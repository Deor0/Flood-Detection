import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersonEvents, missingPersons } from '@/db/schema';
import { handleVapiTools, normalizeCallerPhone, type HelplineReport } from '@/core/helpline/vapi';
import { createTestDb } from './db';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));

vi.mock('@/db', () => ({
  getDb: () => {
    if (!holder.db) throw new Error('getDb called with no test database');
    return holder.db;
  },
}));

import { POST } from '@/app/api/sms/vapi/route';

const US = '+14155552671';
const NEPAL = '+9779841234567';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let reportsDir: string;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  reportsDir = mkdtempSync(path.join(tmpdir(), 'helpline-'));
  process.env.HELPLINE_REPORTS_FILE = path.join(reportsDir, 'reports.json');
});

afterAll(async () => {
  await ctx.close();
  rmSync(reportsDir, { recursive: true, force: true });
});

function savedReports(): HelplineReport[] {
  return JSON.parse(readFileSync(process.env.HELPLINE_REPORTS_FILE!, 'utf8')) as HelplineReport[];
}

function resultOf(
  results: { toolCallId: string; result: string }[],
  toolCallId: string,
): Record<string, unknown> {
  const row = results.find((item) => item.toolCallId === toolCallId);
  expect(row).toBeTruthy();
  return JSON.parse(row!.result) as Record<string, unknown>;
}

async function counts() {
  const people = await ctx.db.select().from(missingPersons);
  const events = await ctx.db.select().from(missingPersonEvents);
  return { people: people.length, events: events.length };
}

describe('caller phone', () => {
  it('accepts a valid US or Nepal number and rejects anything else', () => {
    expect(normalizeCallerPhone('+1 415 555 2671')).toBe(US);
    expect(normalizeCallerPhone('+977 984-1234567')).toBe(NEPAL);
    expect(normalizeCallerPhone('555')).toBeNull();
    expect(normalizeCallerPhone('')).toBeNull();
  });
});

describe('report_missing_person', () => {
  it('saves the report, the caller phone, and one reported event', async () => {
    const before = await counts();
    const { results } = await handleVapiTools({
      db: ctx.db,
      callerPhone: NEPAL,
      toolCalls: [
        {
          id: 'report-1',
          name: 'report_missing_person',
          arguments: {
            name: '  Sarah Jenkins ',
            lastKnownLocation: 'Westside Community Center, Houston',
            age: 34,
            description: 'Blue jacket, needs insulin',
          },
        },
      ],
    });

    const body = resultOf(results, 'report-1');
    expect(body.ok).toBe(true);
    expect(body.status).toBe('missing');
    expect(body.name).toBe('Sarah Jenkins');
    expect(body.publicId).toMatch(/^REG-\d{5}$/);

    const [row] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.name, 'Sarah Jenkins'));
    expect(row.reporterPhone).toBe(NEPAL);
    expect(row.contact).toBeNull();
    expect(row.notes).toBe('Blue jacket, needs insulin');
    expect(row.lastSeenLocation).toBe('Westside Community Center, Houston');
    expect(row.age).toBe(34);
    expect(row.status).toBe('missing');
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);

    const record = savedReports().find((item) => item.name === 'Sarah Jenkins');
    expect(record).toMatchObject({
      id: row.id,
      name: 'Sarah Jenkins',
      status: 'missing',
      age: 34,
      lastSeenLocation: 'Westside Community Center, Houston',
      notes: 'Blue jacket, needs insulin',
      lat: null,
      lng: null,
      contact: null,
      reporterPhone: NEPAL,
      foundAt: null,
    });
    expect(record?.createdAt).toBe(row.createdAt.toISOString());
    expect(record?.updatedAt).toBe(row.updatedAt.toISOString());

    const events = await ctx.db
      .select()
      .from(missingPersonEvents)
      .where(eq(missingPersonEvents.missingPersonId, row.id));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('reported');
    expect(events[0].actorPhone).toBe(NEPAL);
    expect(await counts()).toEqual({ people: before.people + 1, events: before.events + 1 });
  });

  it('reads arguments that arrive as a JSON string', async () => {
    const { results } = await handleVapiTools({
      db: ctx.db,
      callerPhone: US,
      toolCalls: [
        {
          id: 'report-json',
          name: 'report_missing_person',
          arguments: JSON.stringify({
            name: 'Maya Rai',
            lastKnownLocation: 'Galchi',
          }),
        },
      ],
    });
    expect(resultOf(results, 'report-json').ok).toBe(true);
  });

  it('saves a name by itself and leaves every other caller field null', async () => {
    const { results } = await handleVapiTools({
      db: ctx.db,
      callerPhone: null,
      toolCalls: [
        { id: 'name-only', name: 'report_missing_person', arguments: { name: 'Name Only' } },
      ],
    });
    expect(resultOf(results, 'name-only').ok).toBe(true);

    const [row] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.name, 'Name Only'));
    expect(row.age).toBeNull();
    expect(row.lastSeenLocation).toBeNull();
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.contact).toBeNull();
    expect(row.reporterPhone).toBeNull();
    expect(row.status).toBe('missing');

    const record = savedReports().find((item) => item.id === row.id);
    expect(record).toMatchObject({
      id: row.id,
      name: 'Name Only',
      status: 'missing',
      age: null,
      lastSeenLocation: null,
      notes: null,
      reporterPhone: null,
      foundAt: null,
    });
    expect(record?.createdAt).toBeTruthy();
    expect(record?.updatedAt).toBeTruthy();
  });

  it('inserts nothing when the name, age, or tool is unusable', async () => {
    const before = await counts();
    const cases: {
      id: string;
      name: string;
      arguments: unknown;
      phone: string | null;
      error: string;
    }[] = [
      {
        id: 'no-name',
        name: 'report_missing_person',
        arguments: { lastKnownLocation: 'Houston' },
        phone: US,
        error: 'invalid',
      },
      {
        id: 'bad-age',
        name: 'report_missing_person',
        arguments: { name: 'Ada Lovelace', lastKnownLocation: 'Houston', age: 12.5 },
        phone: US,
        error: 'invalid',
      },
      {
        id: 'unknown',
        name: 'check_flood_status',
        arguments: { city: 'Austin' },
        phone: US,
        error: 'unknown_tool',
      },
    ];

    for (const item of cases) {
      const { results } = await handleVapiTools({
        db: ctx.db,
        callerPhone: item.phone,
        toolCalls: [{ id: item.id, name: item.name, arguments: item.arguments }],
      });
      expect(resultOf(results, item.id)).toMatchObject({ ok: false, error: item.error });
    }
    expect(await counts()).toEqual(before);
  });

  it('stops the eleventh report from the same phone within 24 hours', async () => {
    const phone = '+442071838750';
    for (let i = 0; i < 10; i += 1) {
      const { results } = await handleVapiTools({
        db: ctx.db,
        callerPhone: phone,
        toolCalls: [
          {
            id: `cap-${i}`,
            name: 'report_missing_person',
            arguments: { name: `Queue Person ${i}`, lastKnownLocation: 'Kathmandu' },
          },
        ],
      });
      expect(resultOf(results, `cap-${i}`).ok).toBe(true);
    }
    const { results } = await handleVapiTools({
      db: ctx.db,
      callerPhone: phone,
      toolCalls: [
        {
          id: 'cap-11',
          name: 'report_missing_person',
          arguments: { name: 'Queue Person Extra', lastKnownLocation: 'Kathmandu' },
        },
      ],
    });
    expect(resultOf(results, 'cap-11')).toEqual({ ok: false, error: 'rate_limited' });
  });
});

describe('check_missing_person', () => {
  it('returns status and a coarse region, and initials for a child', async () => {
    await handleVapiTools({
      db: ctx.db,
      callerPhone: US,
      toolCalls: [
        {
          id: 'child',
          name: 'report_missing_person',
          arguments: {
            name: 'Sam Rai',
            age: 7,
            lastKnownLocation: 'Galchi, Rasuwa',
            description: 'Private note that must not be spoken',
          },
        },
      ],
    });

    const { results } = await handleVapiTools({
      db: ctx.db,
      callerPhone: null,
      toolCalls: [
        { id: 'find-child', name: 'check_missing_person', arguments: { name: 'Sam Rai' } },
      ],
    });
    const body = resultOf(results, 'find-child');
    expect(body.ok).toBe(true);
    expect(body.matches).toEqual([
      {
        publicId: expect.stringMatching(/^REG-\d{5}$/),
        name: 'S. R.',
        status: 'missing',
        region: 'Rasuwa',
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/Private note|insulin|\+1|\+977/);
  });

  it('returns no matches for a one-letter name and at most three for a common name', async () => {
    const short = await handleVapiTools({
      db: ctx.db,
      callerPhone: null,
      toolCalls: [{ id: 'short', name: 'check_missing_person', arguments: { name: 'A' } }],
    });
    expect(resultOf(short.results, 'short')).toEqual({ ok: true, matches: [] });

    for (let i = 0; i < 4; i += 1) {
      await handleVapiTools({
        db: ctx.db,
        callerPhone: US,
        toolCalls: [
          {
            id: `sharma-${i}`,
            name: 'report_missing_person',
            arguments: { name: `Person${i} Sharma`, lastKnownLocation: 'Lalitpur' },
          },
        ],
      });
    }
    const found = await handleVapiTools({
      db: ctx.db,
      callerPhone: null,
      toolCalls: [{ id: 'sharma', name: 'check_missing_person', arguments: { name: 'Sharma' } }],
    });
    const matches = resultOf(found.results, 'sharma').matches as unknown[];
    expect(matches).toHaveLength(3);
  });
});

function post(body: unknown) {
  return new Request('http://localhost:3000/api/sms/vapi', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sms/vapi', () => {
  it('acknowledges a non-tool message and runs a tool call from the Vapi envelope', async () => {
    const status = await POST(post({ message: { type: 'status-update', status: 'in-progress' } }));
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ ok: true });

    const before = await counts();
    const response = await POST(
      post({
        message: {
          type: 'tool-calls',
          toolCalls: [
            {
              id: 'from-route',
              type: 'function',
              function: {
                name: 'report_missing_person',
                arguments: { name: 'Route Person', lastKnownLocation: 'Bhaktapur' },
              },
            },
          ],
          call: { customer: { number: '+977 984-1234567' } },
        },
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: { toolCallId: string; result: string }[];
    };
    expect(resultOf(payload.results, 'from-route').ok).toBe(true);
    expect(await counts()).toEqual({ people: before.people + 1, events: before.events + 1 });
  });
});
