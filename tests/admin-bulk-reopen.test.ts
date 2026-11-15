import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersonEvents, missingPersons } from '@/db/schema';
import { markFound, reportMissing } from '@/core/missing/service';
import { bulkReopenFoundBy, previewFoundBy, validFilter } from '@/core/admin/bulkReopen';
import { createTestDb } from './db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const admin = { userId: 'user_admin', isAdmin: true };
const ids: Record<string, string> = {};

beforeAll(async () => {
  ctx = await createTestDb();
  for (const name of ['Ana Rai', 'Bikash Thapa', 'Chandra Gurung', 'Dipa Lama']) {
    const r = await reportMissing(ctx.db, admin, { name });
    if (!r.ok) throw new Error('seed failed');
    ids[name] = r.person.id;
  }
  // A troll marks three people found; an honest helper marks one.
  await markFound(ctx.db, { userId: 'user_troll' }, ids['Ana Rai'], 'fake');
  await markFound(ctx.db, { userId: 'user_troll' }, ids['Bikash Thapa'], 'fake');
  await markFound(ctx.db, { phone: '+15555550199' }, ids['Chandra Gurung'], 'sms');
  await markFound(ctx.db, { userId: 'user_helper' }, ids['Dipa Lama'], 'real');
});
afterAll(async () => {
  await ctx.close();
});

const since = new Date(Date.now() - 60 * 60 * 1000);

describe('bulk re-open of false "found" reports', () => {
  it('previews only records found by that actor since the time', async () => {
    const preview = await previewFoundBy(ctx.db, { foundBy: 'user_troll', since });
    expect(preview.map((p) => p.name).sort()).toEqual(['Ana Rai', 'Bikash Thapa']);
    expect(await previewFoundBy(ctx.db, { foundBy: 'user_troll', since: new Date() })).toEqual([]);
    expect(
      (await previewFoundBy(ctx.db, { foundBy: '+15555550199', since })).map((p) => p.name),
    ).toEqual(['Chandra Gurung']);
  });

  it('refuses non-admins and missing reasons', async () => {
    expect(
      await bulkReopenFoundBy(
        ctx.db,
        { userId: 'user_x' },
        {
          foundBy: 'user_troll',
          since,
          reason: 'false reports',
        },
      ),
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(
      await bulkReopenFoundBy(ctx.db, admin, { foundBy: 'user_troll', since, reason: ' ' }),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(validFilter({ foundBy: 'drop table', since })).toBe(false);
    expect(validFilter({ foundBy: 'user_troll', since: new Date('nope') })).toBe(false);
  });

  it('re-opens each record through the normal path, logging a reopened event with the reason', async () => {
    const r = await bulkReopenFoundBy(ctx.db, admin, {
      foundBy: 'user_troll',
      since,
      reason: 'troll account',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reopened).toHaveLength(2);
    for (const name of ['Ana Rai', 'Bikash Thapa']) {
      const [p] = await ctx.db
        .select()
        .from(missingPersons)
        .where(eq(missingPersons.id, ids[name]));
      expect(p.status).toBe('missing');
      const events = await ctx.db
        .select()
        .from(missingPersonEvents)
        .where(eq(missingPersonEvents.missingPersonId, ids[name]));
      const reopened = events.find((e) => e.kind === 'reopened');
      expect(reopened?.reason).toBe('Bulk re-open: troll account');
      expect(reopened?.actorUserId).toBe('user_admin');
      // Nothing was deleted: the false "found" event is still in the history.
      expect(events.some((e) => e.kind === 'found')).toBe(true);
    }
    // Others untouched.
    const [dipa] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, ids['Dipa Lama']));
    expect(dipa.status).toBe('found');
  });

  it('says so when there is nothing left to re-open', async () => {
    expect(
      await bulkReopenFoundBy(ctx.db, admin, {
        foundBy: 'user_troll',
        since,
        reason: 'troll account',
      }),
    ).toEqual({ ok: false, reason: 'nothing_to_reopen' });
  });
});
