import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countHomeSafe } from '@/core/missing/stats';
import { markFound, reportMissing } from '@/core/missing/service';
import { createTestDb } from './db';

const actor = { userId: 'user_home_stats' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

describe('home page reunion counter', () => {
  it('is zero on an empty registry', async () => {
    expect(await countHomeSafe(ctx.db)).toBe(0);
  });

  it('counts only people marked found, not those still missing', async () => {
    const names = ['Ana Ruiz', 'Ben Okafor', 'Cleo Tan'];
    const ids: string[] = [];
    for (const name of names) {
      const r = await reportMissing(ctx.db, actor, { name, lastSeenLocation: 'Harbour Road' });
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.person.id);
    }
    expect(await countHomeSafe(ctx.db)).toBe(0);

    await markFound(ctx.db, actor, ids[0]!);
    await markFound(ctx.db, actor, ids[2]!);
    expect(await countHomeSafe(ctx.db)).toBe(2);
  });
});
