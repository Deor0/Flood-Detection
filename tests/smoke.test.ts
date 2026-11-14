import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

describe('test database harness', () => {
  it('applies migrations so all tables exist', async () => {
    const res = await ctx.client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = res.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(['users', 'missing_persons', 'sms_log', 'community_posts']),
    );
  });
});
