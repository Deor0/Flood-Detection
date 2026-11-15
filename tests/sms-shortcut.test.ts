import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { smsLog, missingPersons } from '@/db/schema';
import { createTestDb } from './db';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));

vi.mock('@/db', () => ({
  getDb: () => {
    if (!holder.db) throw new Error('getDb called with no test database');
    return holder.db;
  },
}));

import { POST } from '@/app/api/sms/route';

const ALLOWED = '+14155552671';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(() => {
  process.env.SMS_ALLOWED_FROM = ALLOWED;
});

function post(body: unknown) {
  return POST(
    new Request('http://localhost:3000/api/sms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/sms shortcut', () => {
  it('saves a report from the allowed number', async () => {
    const response = await post({ from: ALLOWED, body: 'MISSING Test Person, Houston' });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { reply: string };
    expect(payload.reply).toMatch(/REG-\d{5}/);
    expect(payload.reply).toMatch(/Test Person/);

    const people = await ctx.db.select().from(missingPersons);
    expect(people).toHaveLength(1);
    expect(people[0].reporterPhone).toBe(ALLOWED);
    const logs = await ctx.db.select().from(smsLog);
    expect(logs).toHaveLength(1);
  });

  it('does nothing for a different number', async () => {
    const beforePeople = await ctx.db.select().from(missingPersons);
    const beforeLogs = await ctx.db.select().from(smsLog);
    const response = await post({ from: '+12025550198', body: 'MISSING Other Person, Houston' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: 'This number is not allowed to use the line.' });
    expect(await ctx.db.select().from(missingPersons)).toHaveLength(beforePeople.length);
    expect(await ctx.db.select().from(smsLog)).toHaveLength(beforeLogs.length);
  });
});
