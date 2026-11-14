import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersonEvents, missingPersons } from '@/db/schema';
import { lastFirst, normalizeName, publicId } from '@/core/missing/names';
import { editMissing, markFound, reportMissing, searchMissing } from '@/core/missing/service';
import { createTestDb } from './db';

const actor = { userId: 'user_clerk_1' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

describe('missing person names', () => {
  it('normalizes case, accents and order for display ids', () => {
    expect(normalizeName('Miller, José')).toBe('miller jose');
    expect(lastFirst('David Miller')).toBe('Miller, David');
    expect(lastFirst('Miller, David')).toBe('Miller, David');
    expect(publicId(1001)).toBe('REG-01001');
  });
});

describe('missing person records', () => {
  it('reports a person, searches in any order, and never removes the row', async () => {
    const reported = await reportMissing(ctx.db, actor, {
      name: 'David Miller',
      age: 42,
      lastSeenLocation: 'Riverside Park',
      notes: 'Near the footbridge',
      contact: 'Maya Miller',
    });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;

    expect(publicId(reported.person.publicNumber)).toBe('REG-01001');
    expect(reported.person.status).toBe('missing');

    for (const query of ['Miller', 'miller david', 'David Miller']) {
      const hits = await searchMissing(ctx.db, query);
      expect(hits.map((p) => p.id)).toContain(reported.person.id);
    }

    const stillThere = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, reported.person.id));
    expect(stillThere).toHaveLength(1);
  });

  it('marks found once, keeps the row, and records the edit history', async () => {
    const reported = await reportMissing(ctx.db, actor, { name: 'Amina Rahman', age: 8 });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;

    const found = await markFound(ctx.db, actor, reported.person.id, 'Sheltered at Central Community Post');
    expect(found.ok).toBe(true);
    const again = await markFound(ctx.db, actor, reported.person.id, 'second note');
    expect(again).toEqual({ ok: false, reason: 'already_found' });

    const edited = await editMissing(ctx.db, actor, reported.person.id, {
      name: 'Amina Rahman',
      age: 9,
      lastSeenLocation: 'Lincoln Elementary',
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.changed).toContain('age');

    const history = await ctx.db
      .select()
      .from(missingPersonEvents)
      .where(eq(missingPersonEvents.missingPersonId, reported.person.id));
    expect(history.map((e) => e.kind).sort()).toEqual(['edited', 'found', 'reported']);

    const row = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, reported.person.id));
    expect(row[0]?.status).toBe('found');
  });
});
