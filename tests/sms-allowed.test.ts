import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './db';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));

vi.mock('@/db', () => ({
  getDb: () => {
    if (!holder.db) throw new Error('getDb called with no test database');
    return holder.db;
  },
}));

import { POST } from '@/app/api/sms/route';
import { allowedSenders } from '@/lib/phone';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});

afterAll(async () => {
  await ctx.close();
  vi.unstubAllEnvs();
});

function post(from: string, body: string) {
  return POST(
    new Request('http://localhost:3000/api/sms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, body }),
    }),
  );
}

describe('SMS_ALLOWED_FROM', () => {
  it('reads one number or a comma-separated list, normalized', () => {
    expect([...allowedSenders('+14155552671')]).toEqual(['+14155552671']);
    expect([...allowedSenders(' (415) 555-2671 , +1 202 555 0198,bad, ')]).toEqual([
      '+14155552671',
      '+12025550198',
    ]);
    expect(allowedSenders(undefined).size).toBe(0);
    expect(allowedSenders('').size).toBe(0);
  });

  it('lets every listed phone use the line and refuses others', async () => {
    vi.stubEnv('SMS_ALLOWED_FROM', '+14155552671, +12025550198');
    const a = (await (await post('+14155552671', 'HELP')).json()) as { reply: string };
    const b = (await (await post('2025550198', 'HELP')).json()) as { reply: string };
    const c = (await (await post('+13105550111', 'HELP')).json()) as { reply: string };
    expect(a.reply).toMatch(/^Commands:/);
    expect(b.reply).toMatch(/^Commands:/);
    expect(c.reply).toBe('This number is not allowed to use the line.');
  });

  it('refuses everyone when the list is empty', async () => {
    vi.stubEnv('SMS_ALLOWED_FROM', '');
    const r = (await (await post('+14155552671', 'HELP')).json()) as { reply: string };
    expect(r.reply).toBe('This number is not allowed to use the line.');
  });
});
