import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersons } from '@/db/schema';
import { LIMITS } from '@/core/permissions';
import {
  editMissing,
  listEditRequests,
  missingHistory,
  reportMissing,
  requestEdit,
} from '@/core/missing/service';
import { createTestDb } from './db';

const reporter = { userId: 'user_reporter' };
const outsider = { userId: 'user_outsider' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

describe('edit suggestions', () => {
  it('tells the reporter to edit directly, and marks a suggestion stale after the record changes', async () => {
    const reported = await reportMissing(ctx.db, reporter, { name: 'Stale Case', notes: 'original' });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;

    expect(
      await requestEdit(ctx.db, reporter, reported.person.id, {
        name: 'Stale Case',
        notes: 'reporter suggestion',
      }),
    ).toEqual({ ok: false, reason: 'use_direct_edit' });

    const suggestion = await requestEdit(ctx.db, outsider, reported.person.id, {
      name: 'Stale Case',
      notes: 'outsider suggestion',
    });
    expect(suggestion.ok).toBe(true);

    await editMissing(ctx.db, reporter, reported.person.id, {
      name: 'Stale Case',
      notes: 'reporter changed it',
    });
    const queue = await listEditRequests(ctx.db);
    const item = queue.find((row) => row.person.id === reported.person.id);
    expect(item?.stale).toBe(true);

    const history = await missingHistory(ctx.db, reported.person.id);
    expect(history.map((row) => row.kind)).toEqual(
      expect.arrayContaining(['reported', 'edit_requested', 'edited']),
    );
  });

  it('stops one user at 10 pending suggestions', async () => {
    const suggester = { userId: 'user_suggester' };
    for (let i = 0; i < LIMITS.editRequestsPerUserPending; i += 1) {
      const reported = await reportMissing(ctx.db, reporter, { name: `Queue ${i}` });
      expect(reported.ok).toBe(true);
      if (!reported.ok) return;
      const suggestion = await requestEdit(ctx.db, suggester, reported.person.id, {
        name: `Queue ${i}`,
        notes: `note ${i}`,
      });
      expect(suggestion.ok).toBe(true);
    }
    const extra = await reportMissing(ctx.db, reporter, { name: 'Queue overflow' });
    expect(extra.ok).toBe(true);
    if (!extra.ok) return;
    expect(
      await requestEdit(ctx.db, suggester, extra.person.id, {
        name: 'Queue overflow',
        notes: 'one too many',
      }),
    ).toEqual({ ok: false, reason: 'too_many' });

    const [row] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, extra.person.id));
    expect(row.notes).toBeNull();
  });
});
