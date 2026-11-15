import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { programRegistrations } from '@/db/schema';
import {
  approveProgram,
  cancelProgram,
  createProgram,
  editProgram,
  listAttendees,
  listMyPrograms,
  listPendingPrograms,
  listRecentProgramEdits,
  programHistory,
  registerForProgram,
  rejectProgram,
} from '@/core/programs/service';
import { createTestDb } from './db';

const host = { userId: 'user_host' };
const admin = { userId: 'user_admin', isAdmin: true };
const outsider = { userId: 'user_outsider' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function input(title: string, capacity: number | '' = 5) {
  return {
    title,
    category: 'first_aid_cpr',
    organizer: 'River Ward',
    location: 'Hall',
    topics: 'CPR',
    startsAt: '2026-12-01T15:00:00.000Z',
    endsAt: '2026-12-01T17:00:00.000Z',
    capacity,
  };
}

describe('program edits, cancellation, and attendees', () => {
  it('lets the host edit a live program, blocks a capacity below the registrations, and logs the edit', async () => {
    const created = await createProgram(ctx.db, admin, input('Capacity drill', 2));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await registerForProgram(ctx.db, 'user_a', created.program.id);
    await registerForProgram(ctx.db, 'user_b', created.program.id);

    const tooSmall = await editProgram(ctx.db, admin, created.program.id, input('Capacity drill', 1));
    expect(tooSmall).toEqual({ ok: false, reason: 'capacity_below_registered' });

    const edited = await editProgram(ctx.db, admin, created.program.id, {
      ...input('Capacity drill renamed', 2),
      topics: 'CPR and recovery',
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.program.title).toBe('Capacity drill renamed');
    expect(edited.changes).toMatchObject({
      title: { from: 'Capacity drill', to: 'Capacity drill renamed' },
    });

    const feed = await listRecentProgramEdits(ctx.db);
    expect(feed.map((row) => row.programId)).toContain(created.program.id);
    const history = await programHistory(ctx.db, created.program.id);
    expect(history.map((row) => row.kind)).toContain('edited');
  });

  it('resubmits a rejected program when the host edits it, and refuses an outsider', async () => {
    const created = await createProgram(ctx.db, host.userId, input('Rejected workshop'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await rejectProgram(ctx.db, admin, created.program.id, 'needs a location fix')).toMatchObject({
      ok: true,
    });

    expect(await editProgram(ctx.db, outsider, created.program.id, input('Hijacked'))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    const resubmitted = await editProgram(ctx.db, host, created.program.id, input('Rejected workshop v2'));
    expect(resubmitted.ok).toBe(true);
    if (!resubmitted.ok) return;
    expect(resubmitted.program.status).toBe('pending');
    expect(resubmitted.program.rejectionReason).toBeNull();

    const queue = await listPendingPrograms(ctx.db);
    expect(queue.map((p) => p.id)).toContain(created.program.id);
    const mine = await listMyPrograms(ctx.db, host.userId);
    expect(mine.map((p) => p.id)).toContain(created.program.id);
  });

  it('cancels a program without deleting registrations, and blocks a second cancel', async () => {
    const created = await createProgram(ctx.db, host.userId, input('Cancel me', 4));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await approveProgram(ctx.db, admin, created.program.id)).ok).toBe(true);
    await registerForProgram(ctx.db, 'user_a', created.program.id);

    expect(await cancelProgram(ctx.db, outsider, created.program.id)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await cancelProgram(ctx.db, host, created.program.id, 'weather')).toEqual({ ok: true });
    expect(await cancelProgram(ctx.db, admin, created.program.id)).toEqual({
      ok: false,
      reason: 'already_cancelled',
    });
    expect(await editProgram(ctx.db, host, created.program.id, input('Still cancelled'))).toEqual({
      ok: false,
      reason: 'cancelled',
    });

    const rows = await ctx.db
      .select()
      .from(programRegistrations)
      .where(
        and(
          eq(programRegistrations.programId, created.program.id),
          isNull(programRegistrations.cancelledAt),
        ),
      );
    expect(rows).toHaveLength(1);

    expect(await listAttendees(ctx.db, host, created.program.id)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    const attendees = await listAttendees(ctx.db, admin, created.program.id);
    expect(attendees.ok).toBe(true);
    if (!attendees.ok) return;
    expect(attendees.attendees.map((a) => a.userId)).toEqual(['user_a']);
  });

  it('approves only a pending program', async () => {
    const created = await createProgram(ctx.db, host.userId, input('Approve once'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await approveProgram(ctx.db, admin, created.program.id)).ok).toBe(true);
    expect(await approveProgram(ctx.db, admin, created.program.id)).toEqual({
      ok: false,
      reason: 'not_pending',
    });
  });
});
