import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersons } from '@/db/schema';
import { canBan, canRevokeAdmin } from '@/core/admin/rules';
import {
  canEditMissingDirectly,
  canReopen,
  canSeeContact,
  canSeeProgramStatus,
  LIMITS,
} from '@/core/permissions';
import { normalizeName } from '@/core/missing/names';
import {
  approveEditRequest,
  editMissing,
  markFound,
  redactForViewer,
  rejectEditRequest,
  reopenMissing,
  reportMissing,
  requestEdit,
  searchMissing,
} from '@/core/missing/service';
import {
  approveProgram,
  createProgram,
  listPrograms,
  registerForProgram,
  rejectProgram,
} from '@/core/programs/service';
import { createTestDb } from './db';

const reporter = { userId: 'user_reporter' };
const outsider = { userId: 'user_outsider' };
const admin = { userId: 'user_admin', isAdmin: true };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const futureProgram = {
  title: 'Pending drill',
  category: 'evacuation_drill',
  organizer: 'Ward',
  location: 'Field',
  startsAt: '2026-12-08T15:00:00.000Z',
  endsAt: '2026-12-08T17:00:00.000Z',
  capacity: 10,
};

describe('permission rules', () => {
  const person = { reporterUserId: 'user_reporter', reporterPhone: '+15555550100' };

  it('lets the reporter and an admin edit and see contact, and only an admin re-open', () => {
    expect(canEditMissingDirectly(reporter, person)).toBe(true);
    expect(canEditMissingDirectly(admin, person)).toBe(true);
    expect(canEditMissingDirectly(outsider, person)).toBe(false);
    expect(canSeeContact(reporter, person)).toBe(true);
    expect(canSeeContact({ userId: 'sms', phone: '+15555550100' }, person)).toBe(true);
    expect(canSeeContact(outsider, person)).toBe(false);
    expect(canReopen(admin)).toBe(true);
    expect(canReopen(reporter)).toBe(false);
  });

  it('hides a pending program from outsiders and shows it to the host and an admin', () => {
    const program = { createdByUserId: 'user_reporter', status: 'pending' };
    expect(canSeeProgramStatus(outsider, program)).toBe(false);
    expect(canSeeProgramStatus(reporter, program)).toBe(true);
    expect(canSeeProgramStatus(admin, program)).toBe(true);
    expect(canSeeProgramStatus(outsider, { ...program, status: 'approved' })).toBe(true);
  });

  it('refuses a self-demotion, demoting the last admin, a self-ban, and banning an admin', () => {
    expect(canRevokeAdmin({ actorId: 'a', targetId: 'a', adminCount: 2 }).ok).toBe(false);
    expect(canRevokeAdmin({ actorId: 'a', targetId: 'b', adminCount: 1 }).ok).toBe(false);
    expect(canRevokeAdmin({ actorId: 'a', targetId: 'b', adminCount: 2 })).toEqual({ ok: true });
    expect(canBan({ actorId: 'a', targetId: 'a', targetIsAdmin: false }).ok).toBe(false);
    expect(canBan({ actorId: 'a', targetId: 'b', targetIsAdmin: true }).ok).toBe(false);
    expect(canBan({ actorId: 'a', targetId: 'b', targetIsAdmin: false })).toEqual({ ok: true });
  });
});

describe('missing person supervision', () => {
  it('searches a non-Latin name and treats a punctuation-only query as no match', async () => {
    const reported = await reportMissing(ctx.db, reporter, {
      name: '李明',
      contact: 'private line',
    });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;
    expect(normalizeName('李明')).toBe('李明');
    const hits = await searchMissing(ctx.db, '李明');
    expect(hits.map((p) => p.id)).toEqual([reported.person.id]);
    expect(await searchMissing(ctx.db, '%')).toEqual([]);
  });

  it('hides the contact line from an outsider and keeps it for the reporter', async () => {
    const [row] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.name, '李明'));
    expect(redactForViewer(row, outsider).contact).toBeNull();
    expect(redactForViewer(row, reporter).contact).toBe('private line');
    expect(redactForViewer(row, admin).contact).toBe('private line');
  });

  it('lets an outsider suggest an edit without changing the record or the contact', async () => {
    const [row] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.name, '李明'));
    const direct = await editMissing(ctx.db, outsider, row.id, {
      name: '李明',
      notes: 'outsider rewrite',
      contact: 'stolen',
    });
    expect(direct).toEqual({ ok: false, reason: 'forbidden' });

    const suggestion = await requestEdit(ctx.db, outsider, row.id, {
      name: '李明',
      notes: 'seen at the bridge',
      contact: 'stolen',
    });
    expect(suggestion.ok).toBe(true);
    const [unchanged] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, row.id));
    expect(unchanged.notes).toBeNull();
    expect(unchanged.contact).toBe('private line');

    const asOutsider = await approveEditRequest(
      ctx.db,
      outsider,
      suggestion.ok ? suggestion.requestId : '',
    );
    expect(asOutsider).toEqual({ ok: false, reason: 'forbidden' });

    const approved = await approveEditRequest(
      ctx.db,
      admin,
      suggestion.ok ? suggestion.requestId : '',
    );
    expect(approved.ok).toBe(true);
    const [after] = await ctx.db.select().from(missingPersons).where(eq(missingPersons.id, row.id));
    expect(after.notes).toBe('seen at the bridge');
    expect(after.contact).toBe('private line');
  });

  it('rejects a suggestion without changing the record, and requires a reason', async () => {
    const reported = await reportMissing(ctx.db, reporter, { name: 'Reject Me' });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;
    const suggestion = await requestEdit(ctx.db, outsider, reported.person.id, {
      name: 'Reject Me',
      notes: 'wrong place',
    });
    expect(suggestion.ok).toBe(true);
    if (!suggestion.ok) return;
    expect(await rejectEditRequest(ctx.db, admin, suggestion.requestId, 'no')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await rejectEditRequest(ctx.db, outsider, suggestion.requestId, 'not this person')).toEqual(
      { ok: false, reason: 'forbidden' },
    );
    expect(await rejectEditRequest(ctx.db, admin, suggestion.requestId, 'not this person')).toEqual({
      ok: true,
    });
    const [row] = await ctx.db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, reported.person.id));
    expect(row.notes).toBeNull();
  });

  it('lets only an admin re-open a found record, and only with a reason', async () => {
    const reported = await reportMissing(ctx.db, reporter, { name: 'Reopen Me' });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;
    await markFound(ctx.db, reporter, reported.person.id, 'safe');
    expect(await reopenMissing(ctx.db, reporter, reported.person.id, 'seen again')).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await reopenMissing(ctx.db, admin, reported.person.id, 'no')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const opened = await reopenMissing(ctx.db, admin, reported.person.id, 'seen again tonight');
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.person.status).toBe('missing');
    expect(opened.person.foundNote).toBeNull();
  });

  it('stops a normal user after 10 reports in a day and does not stop an admin', async () => {
    const limited = { userId: 'user_limited' };
    for (let i = 0; i < LIMITS.reportsPerUserPer24h; i += 1) {
      const result = await reportMissing(ctx.db, limited, { name: `Rate ${i}` });
      expect(result.ok).toBe(true);
    }
    expect(await reportMissing(ctx.db, limited, { name: 'Rate overflow' })).toEqual({
      ok: false,
      rateLimited: true,
    });
    expect((await reportMissing(ctx.db, { ...limited, isAdmin: true }, { name: 'Admin extra' })).ok).toBe(
      true,
    );
  });
});

describe('program supervision', () => {
  it('keeps a normal host pending and off the public list until an admin approves', async () => {
    const created = await createProgram(ctx.db, reporter.userId, futureProgram);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.program.status).toBe('pending');
    const now = new Date('2026-11-14T12:00:00.000Z');
    expect(await listPrograms(ctx.db, { now })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.program.id })]),
    );
    expect(await registerForProgram(ctx.db, outsider.userId, created.program.id, now)).toEqual({
      ok: false,
      reason: 'not_open',
    });
    expect(await approveProgram(ctx.db, reporter, created.program.id)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    const approved = await approveProgram(ctx.db, admin, created.program.id);
    expect(approved.ok).toBe(true);
    const listed = await listPrograms(ctx.db, { q: 'Pending drill', now });
    expect(listed.map((p) => p.id)).toContain(created.program.id);
  });

  it('rejects a program only with a reason, and caps a host at 5 pending programs', async () => {
    const created = await createProgram(ctx.db, reporter.userId, {
      ...futureProgram,
      title: 'Needs a reason',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await rejectProgram(ctx.db, admin, created.program.id, 'no')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await rejectProgram(ctx.db, admin, created.program.id, 'duplicate of another drill')).toEqual(
      expect.objectContaining({ ok: true }),
    );

    const filler = { userId: 'user_filler' };
    for (let i = 0; i < LIMITS.pendingProgramsPerUser; i += 1) {
      const result = await createProgram(ctx.db, filler.userId, {
        ...futureProgram,
        title: `Filler ${i} workshop`,
      });
      expect(result.ok).toBe(true);
    }
    expect(
      await createProgram(ctx.db, filler.userId, { ...futureProgram, title: 'One program too many' }),
    ).toEqual({ ok: false, tooManyPending: true });
  });
});
