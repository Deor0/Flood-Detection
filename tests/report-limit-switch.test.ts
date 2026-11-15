import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { reportMissing } from '@/core/missing/service';
import { createTestDb } from './db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await ctx.close();
});

describe('DISABLE_REPORT_LIMIT', () => {
  it('keeps the 10-per-24h cap when unset', async () => {
    const reporter = { userId: 'user_capped' };
    for (let i = 0; i < 10; i++) {
      expect((await reportMissing(ctx.db, reporter, { name: `Capped Person ${i}` })).ok).toBe(true);
    }
    const eleventh = await reportMissing(ctx.db, reporter, { name: 'Capped Person 10' });
    expect(eleventh).toEqual({ ok: false, rateLimited: true });
  });

  it('lets the same reporter file more than 10 when set to true', async () => {
    vi.stubEnv('DISABLE_REPORT_LIMIT', 'true');
    const reporter = { userId: 'user_tester' };
    for (let i = 0; i < 12; i++) {
      expect((await reportMissing(ctx.db, reporter, { name: `Tester Person ${i}` })).ok).toBe(true);
    }
    vi.unstubAllEnvs();
  });
});
