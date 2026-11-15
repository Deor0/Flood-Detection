import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersonEditRequests, missingPersons } from '@/db/schema';
import { findLikelyDuplicates, suggestNames } from '@/core/missing/fuzzy';
import { editDistance, foldName, fuzzyScore, parsePublicId } from '@/core/missing/names';
import {
  approveEditRequest,
  listEditRequests,
  markFound,
  pendingFoundClaims,
  rejectEditRequest,
  reportMissing,
  requestEdit,
  searchMissing,
} from '@/core/missing/service';
import { getMissingByPublicNumber, publicTimeline } from '@/core/missing/timeline';
import { canMarkFoundDirectly, type Actor } from '@/core/permissions';
import { createTestDb } from './db';

const reporter = { userId: 'user_judge_reporter' };
const stranger = { userId: 'user_judge_stranger' };
const admin = { userId: 'user_judge_admin', isAdmin: true };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

async function report(name: string, extra: Record<string, unknown> = {}, who: Actor = reporter) {
  const r = await reportMissing(ctx.db, who, { name, ...extra });
  if (!r.ok) throw new Error(`report failed: ${JSON.stringify(r)}`);
  return r.person;
}

async function statusOf(id: string) {
  const [row] = await ctx.db.select().from(missingPersons).where(eq(missingPersons.id, id));
  return row;
}

describe('name folding and fuzzy matching', () => {
  it('folds common transliteration variants to one spelling', () => {
    expect(foldName('Shrestha')).toEqual(foldName('Srestha'));
    expect(foldName('Laxmi')).toEqual(foldName('Lakshmi'));
    expect(foldName('Pooja Ray')).toEqual(foldName('Puja Rai'));
    expect(foldName('Bhattarai')).toEqual(foldName('Battarai'));
  });

  it('counts edits and allows one typo, but not on very short words', () => {
    expect(editDistance('maya', 'mya')).toBe(1);
    expect(fuzzyScore('Mya Rai', 'Maya Rai')).not.toBeNull();
    expect(fuzzyScore('Maya', 'Maya Rai')).toBe(0);
    expect(fuzzyScore('Ram', 'Rai Maya')).toBeNull(); // 3-letter words still need a close match
    expect(fuzzyScore('Al', 'Ali Khan')).toBeNull(); // too short for a typo or prefix
    expect(fuzzyScore('Totally Different', 'Maya Rai')).toBeNull();
  });

  it('reads public ids in several forms', () => {
    expect(parsePublicId('REG-01013')).toBe(1013);
    expect(parsePublicId('reg1013')).toBe(1013);
    expect(parsePublicId('1013')).toBe(1013);
    expect(parsePublicId('REG-abc')).toBeNull();
    expect(parsePublicId('0')).toBeNull();
  });
});

describe('did you mean', () => {
  it('suggests a close name when exact search finds nobody, without children by default', async () => {
    await report('Sunita Shrestha', { lastSeenLocation: 'Bhaktapur' });
    await report('Sunil Thapa', { age: 9 });

    expect(await searchMissing(ctx.db, 'Sunita Srestha')).toHaveLength(0);
    expect(await suggestNames(ctx.db, 'Sunita Srestha')).toContain('Sunita Shrestha');
    expect(await suggestNames(ctx.db, 'Sunitta Shrestha')).toContain('Sunita Shrestha');

    expect(await suggestNames(ctx.db, 'Sunil Tapa')).toEqual([]);
    expect(await suggestNames(ctx.db, 'Sunil Tapa', { includeMinors: true })).toContain(
      'Sunil Thapa',
    );
  });
});

describe('duplicate detection before filing', () => {
  it('finds the same name in the same area, and ignores other areas and far-apart ages', async () => {
    const first = await report('Maya Rai', { lastSeenLocation: 'Ward 4, Kathmandu', age: 34 });

    const same = await findLikelyDuplicates(ctx.db, {
      name: 'Maya Ray',
      lastSeenLocation: 'Kathmandu',
      age: 35,
    });
    expect(same.map((d) => d.id)).toContain(first.id);
    expect(same[0]).toMatchObject({ publicId: expect.stringMatching(/^REG-/), status: 'missing' });

    const noPlace = await findLikelyDuplicates(ctx.db, { name: 'maya rai' });
    expect(noPlace.map((d) => d.id)).toContain(first.id);

    expect(
      await findLikelyDuplicates(ctx.db, { name: 'Maya Rai', lastSeenLocation: 'Pokhara' }),
    ).toEqual([]);
    expect(await findLikelyDuplicates(ctx.db, { name: 'Maya Rai', age: 70 })).toEqual([]);
    expect(await findLikelyDuplicates(ctx.db, { name: 'Maya' })).toEqual([]);
  });
});

describe('found needs confirmation unless you are the reporter or an admin', () => {
  it('only the reporter and admins mark found directly', () => {
    const rec = { reporterUserId: reporter.userId, reporterPhone: null };
    expect(canMarkFoundDirectly(reporter, rec)).toBe(true);
    expect(canMarkFoundDirectly(admin, rec)).toBe(true);
    expect(canMarkFoundDirectly(stranger, rec)).toBe(false);
  });

  it("a stranger's found report waits in the queue; the record stays missing", async () => {
    const person = await report('Claim Case');
    const claim = await markFound(ctx.db, stranger, person.id, 'At the school shelter');
    expect(claim).toMatchObject({ ok: true, pending: true });
    expect((await statusOf(person.id)).status).toBe('missing');
    expect((await pendingFoundClaims(ctx.db, [person.id])).has(person.id)).toBe(true);

    // Asking again does not queue a second claim.
    const again = await markFound(ctx.db, { userId: 'user_other_stranger' }, person.id);
    if (!claim.ok || !claim.pending || !again.ok || !again.pending)
      throw new Error('expected claims');
    expect(again.requestId).toBe(claim.requestId);

    const queue = await listEditRequests(ctx.db);
    const item = queue.find((q) => q.person.id === person.id);
    expect(item?.kind).toBe('found');
    expect(item?.diff.status).toEqual({ from: 'missing', to: 'found' });
    expect(item?.diff.foundNote?.to).toBe('At the school shelter');
  });

  it('an admin approving the claim marks the person found, crediting the claimant', async () => {
    const person = await report('Approve Claim');
    const claim = await markFound(ctx.db, stranger, person.id, 'with an aunt');
    if (!claim.ok || !claim.pending) throw new Error('expected a pending claim');

    const outsiderApprove = await approveEditRequest(ctx.db, stranger, claim.requestId);
    expect(outsiderApprove).toEqual({ ok: false, reason: 'forbidden' });

    const approved = await approveEditRequest(ctx.db, admin, claim.requestId);
    expect(approved.ok).toBe(true);
    const row = await statusOf(person.id);
    expect(row.status).toBe('found');
    expect(row.foundByUserId).toBe(stranger.userId);
    expect(row.foundNote).toBe('with an aunt');
    expect((await pendingFoundClaims(ctx.db, [person.id])).size).toBe(0);
    // Name and details are untouched by a found claim.
    expect(row.name).toBe('Approve Claim');
  });

  it('the reporter marking found settles any waiting claim', async () => {
    const person = await report('Reporter Confirms');
    const claim = await markFound(ctx.db, stranger, person.id);
    if (!claim.ok || !claim.pending) throw new Error('expected a pending claim');

    const done = await markFound(ctx.db, reporter, person.id, 'confirmed by family');
    expect(done).toMatchObject({ ok: true });
    expect(done.ok && done.pending).toBeFalsy();
    expect((await statusOf(person.id)).status).toBe('found');
    const [req] = await ctx.db
      .select()
      .from(missingPersonEditRequests)
      .where(eq(missingPersonEditRequests.id, claim.requestId));
    expect(req.status).toBe('approved');
  });

  it('a rejected claim leaves the record missing with nothing pending', async () => {
    const person = await report('Rejected Claim');
    const claim = await markFound(ctx.db, stranger, person.id);
    if (!claim.ok || !claim.pending) throw new Error('expected a pending claim');
    expect((await rejectEditRequest(ctx.db, admin, claim.requestId, 'Not confirmed')).ok).toBe(
      true,
    );
    expect((await statusOf(person.id)).status).toBe('missing');
    expect((await pendingFoundClaims(ctx.db, [person.id])).size).toBe(0);
  });

  it('a phone that did not report the person cannot claim, and the SMS reporter still can mark found', async () => {
    const smsPerson = await report('Sms Person', {}, { phone: '+15555550100' });
    expect(await markFound(ctx.db, { phone: '+15555550199' }, smsPerson.id)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    const done = await markFound(ctx.db, { phone: '+15555550100' }, smsPerson.id, 'by SMS');
    expect(done.ok && !done.pending).toBe(true);
  });

  it('a found record cannot be claimed again', async () => {
    const person = await report('Already Home');
    await markFound(ctx.db, admin, person.id);
    expect(await markFound(ctx.db, stranger, person.id)).toEqual({
      ok: false,
      reason: 'already_found',
    });
  });
});

describe("children's notes", () => {
  it("a suggestion from someone who cannot see a child's notes never changes them", async () => {
    const child = await report('Child Notes', { age: 8, notes: 'private detail' });
    const r = await requestEdit(ctx.db, stranger, child.id, {
      name: 'Child Notes',
      age: 9,
      notes: '',
    });
    expect(r.ok).toBe(true);
    const item = (await listEditRequests(ctx.db)).find((q) => q.person.id === child.id);
    expect(item?.diff.notes).toBeUndefined();
    expect(item?.diff.age).toEqual({ from: 8, to: 9 });
  });
});

describe('status filter and public timeline', () => {
  // A second reporter: one account files at most 10 reports a day.
  const owner = { userId: 'user_judge_reporter_2' };

  it('filters search by status', async () => {
    const a = await report('Filter Open', {}, owner);
    const b = await report('Filter Closed', {}, owner);
    await markFound(ctx.db, owner, b.id);
    const open = await searchMissing(ctx.db, 'filter', 50, { status: 'missing' });
    const closed = await searchMissing(ctx.db, 'filter', 50, { status: 'found' });
    expect(open.map((p) => p.id)).toEqual([a.id]);
    expect(closed.map((p) => p.id)).toEqual([b.id]);
  });

  it('tells the story oldest first with no actor ids, notes or reasons', async () => {
    const person = await report('Timeline Person', {}, owner);
    await markFound(ctx.db, stranger, person.id, 'secret shelter address');
    const claim = await listEditRequests(ctx.db);
    const req = claim.find((c) => c.person.id === person.id);
    if (!req) throw new Error('missing claim');
    await approveEditRequest(ctx.db, admin, req.request.id);

    const timeline = await publicTimeline(ctx.db, person.id);
    expect(timeline[0].label).toBe('Reported missing');
    expect(timeline.map((t) => t.label)).toEqual(
      expect.arrayContaining([
        'Reported found by a volunteer — waiting for confirmation',
        'Marked found',
        'Safe report confirmed',
      ]),
    );
    const text = JSON.stringify(timeline);
    expect(text).not.toContain('user_judge');
    expect(text).not.toContain('secret shelter');

    const byNumber = await getMissingByPublicNumber(ctx.db, person.publicNumber);
    expect(byNumber?.id).toBe(person.id);
    expect(await getMissingByPublicNumber(ctx.db, 999999)).toBeNull();
  });
});
