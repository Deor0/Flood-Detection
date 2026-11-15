import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersons } from '@/db/schema';
import { createTestDb } from './db';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));

vi.mock('@/db', () => ({
  getDb: () => {
    if (!holder.db) throw new Error('getDb called with no test database');
    return holder.db;
  },
}));

import { POST } from '@/app/api/postsms/route';
import { handleVapiTools, normalizeCallerPhone } from '@/core/helpline/vapi';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let dir: string;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  dir = mkdtempSync(path.join(tmpdir(), 'vapi-test-'));
});

afterAll(async () => {
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.HELPLINE_REPORTS_FILE = path.join(dir, 'reports.json');
  delete process.env.VERCEL;
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.HELPLINE_REPORTS_FILE;
});

type ToolResult = Record<string, unknown>;

async function tool(
  name: string,
  args: unknown,
  opts: { caller?: string | null; callId?: string | null } = {},
): Promise<ToolResult> {
  const { results } = await handleVapiTools({
    db: ctx.db,
    callerPhone: opts.caller ?? null,
    callId: opts.callId ?? null,
    toolCalls: [{ id: 't1', name, arguments: args }],
  });
  return JSON.parse(results[0].result) as ToolResult;
}

const rows = (name: string) =>
  ctx.db.select().from(missingPersons).where(eq(missingPersons.name, name));

describe('report_missing_person', () => {
  it('saves the row and appends the JSON copy when the file system is writable', async () => {
    const result = await tool(
      'report_missing_person',
      { name: 'Sarah Jenkins', age: 34, lastKnownLocation: 'Westside Center, Houston' },
      { caller: '+14155552671' },
    );
    expect(result).toMatchObject({ ok: true, name: 'Sarah Jenkins', status: 'missing' });
    expect(result.publicId).toMatch(/^REG-\d{5}$/);
    const [row] = await rows('Sarah Jenkins');
    expect(row.reporterPhone).toBe('+14155552671');
    const file = JSON.parse(readFileSync(process.env.HELPLINE_REPORTS_FILE as string, 'utf8'));
    expect(file.at(-1)).toMatchObject({ name: 'Sarah Jenkins', age: 34 });
  });

  it('still returns the saved report when the JSON file cannot be written', async () => {
    const blocker = path.join(dir, 'not-a-dir');
    writeFileSync(blocker, 'x');
    process.env.HELPLINE_REPORTS_FILE = path.join(blocker, 'reports.json');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await tool('report_missing_person', { name: 'Readonly Person' });
    spy.mockRestore();
    expect(result).toMatchObject({ ok: true, name: 'Readonly Person' });
    expect(await rows('Readonly Person')).toHaveLength(1);
  });

  it('skips the JSON file on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    process.env.HELPLINE_REPORTS_FILE = path.join(dir, 'vercel.json');
    const result = await tool('report_missing_person', { name: 'Vercel Person' });
    expect(result).toMatchObject({ ok: true });
    expect(() => readFileSync(path.join(dir, 'vercel.json'))).toThrow();
  });

  it('returns the existing record when the same caller reports the same name again', async () => {
    const caller = '+14155550120';
    const first = await tool('report_missing_person', { name: 'Ram Thapa' }, { caller });
    const second = await tool('report_missing_person', { name: '  ram  THAPA ' }, { caller });
    expect(second).toMatchObject({ ok: true, publicId: first.publicId, duplicate: true });
    expect(await rows('Ram Thapa')).toHaveLength(1);
  });

  it('files separately for a different caller', async () => {
    await tool('report_missing_person', { name: 'Gita Rai' }, { caller: '+14155550121' });
    await tool('report_missing_person', { name: 'Gita Rai' }, { caller: '+14155550122' });
    expect(await rows('Gita Rai')).toHaveLength(2);
  });

  it('uses the call id when the number is hidden', async () => {
    const a = await tool('report_missing_person', { name: 'Hidden Caller' }, { callId: 'call-a' });
    const b = await tool('report_missing_person', { name: 'Hidden Caller' }, { callId: 'call-a' });
    expect(b).toMatchObject({ publicId: a.publicId, duplicate: true });
    await tool('report_missing_person', { name: 'Hidden Caller' }, { callId: 'call-b' });
    expect(await rows('Hidden Caller')).toHaveLength(2);
  });

  it('refuses a blank name and an invalid age without saving', async () => {
    expect(await tool('report_missing_person', { name: ' ' })).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    expect(await tool('report_missing_person', { name: 'Bad Age', age: 200 })).toMatchObject({
      ok: false,
      error: 'invalid',
      fields: { age: expect.any(String) },
    });
    expect(await rows('Bad Age')).toHaveLength(0);
  });

  it('accepts arguments as a JSON string', async () => {
    const result = await tool('report_missing_person', JSON.stringify({ name: 'String Args' }));
    expect(result).toMatchObject({ ok: true, name: 'String Args' });
  });
});

describe('check_missing_person', () => {
  it('returns status and a coarse region only', async () => {
    await tool('report_missing_person', {
      name: 'Check Me',
      lastKnownLocation: '12 Main St, Houston',
      description: 'secret notes',
    });
    const result = await tool('check_missing_person', { name: 'check me' });
    expect(result).toEqual({
      ok: true,
      matches: [
        {
          publicId: expect.stringMatching(/^REG-/),
          name: 'Check Me',
          status: 'missing',
          region: 'Houston',
        },
      ],
    });
  });

  it('returns nothing for a one-letter name', async () => {
    expect(await tool('check_missing_person', { name: 'C' })).toEqual({ ok: true, matches: [] });
  });

  it('rejects unknown tools', async () => {
    expect(await tool('check_flood_status', {})).toEqual({ ok: false, error: 'unknown_tool' });
  });
});

describe('POST /api/postsms', () => {
  function post(body: unknown) {
    return POST(
      new Request('http://localhost:3000/api/postsms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  }

  it('runs tool calls and de-duplicates a retried call by call id', async () => {
    const envelope = {
      message: {
        type: 'tool-calls',
        toolCallList: [
          {
            id: 'r1',
            function: { name: 'report_missing_person', arguments: '{"name":"Retry Person"}' },
          },
        ],
        call: { id: 'vapi-call-77' },
      },
    };
    const first = (await (await post(envelope)).json()) as { results: { result: string }[] };
    const second = (await (await post(envelope)).json()) as { results: { result: string }[] };
    expect(JSON.parse(second.results[0].result).publicId).toBe(
      JSON.parse(first.results[0].result).publicId,
    );
    expect(await rows('Retry Person')).toHaveLength(1);
  });

  it('ignores other events and rejects bad JSON', async () => {
    expect(await (await post({ message: { type: 'status-update' } })).json()).toEqual({ ok: true });
    expect((await post('not json')).status).toBe(400);
  });
});

describe('normalizeCallerPhone', () => {
  it.each([
    ['+977 984-1234567', '+9779841234567'],
    ['+1 415 555 2671', '+14155552671'],
    ['', null],
    ['abc', null],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeCallerPhone(raw)).toBe(expected);
  });
});
