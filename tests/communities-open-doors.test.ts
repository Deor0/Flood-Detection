import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAST_START_GRACE_MS,
  approveProgram,
  cancelProgram,
  cancelRegistration,
  cleanProgram,
  createProgram,
  editProgram,
  listMyPrograms,
  listMyRegistrations,
  listPendingPrograms,
  listPrograms,
  programHistory,
  registerForProgram,
} from '@/core/programs/service';
import { PROGRAM_CATEGORIES } from '@/db/schema';
import { CATEGORY_LABELS, categoryOption, registerLabel } from '@/core/programs/categories';
import { createTestDb } from './db';

const host = { userId: 'user_od_host' };
const admin = { userId: 'user_od_admin', isAdmin: true };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

// Far enough ahead that the "no past start" rule never trips while these tests are in use.
const START = '2030-06-01T15:00:00.000Z';
const END = '2030-06-01T17:00:00.000Z';

function input(title: string, overrides: Record<string, string | number | null> = {}) {
  return {
    title,
    category: 'shelter',
    organizer: 'River Ward',
    location: 'School gym',
    topics: 'cots, blankets',
    startsAt: START,
    endsAt: END,
    capacity: 20,
    ...overrides,
  };
}

/** Host submits, admin approves: a live program. */
async function liveProgram(title: string, overrides: Record<string, string | number | null> = {}) {
  const created = await createProgram(ctx.db, host.userId, input(title, overrides));
  if (!created.ok) throw new Error('create failed');
  const approved = await approveProgram(ctx.db, admin, created.program.id);
  if (!approved.ok) throw new Error('approve failed');
  return approved.program;
}

describe('flood mutual-aid categories', () => {
  it('accepts shelter, supplies, rides and cleanup crew, with themed subtitles', () => {
    for (const c of ['shelter', 'supplies', 'rides', 'cleanup_crew'] as const) {
      expect(PROGRAM_CATEGORIES).toContain(c);
      expect(cleanProgram(input('Aid', { category: c })).value?.category).toBe(c);
    }
    expect(categoryOption('shelter')).toBe('Shelter — Hearth');
    expect(categoryOption('rides')).toBe('Rides — Phaeacian ship');
    expect(categoryOption('cleanup_crew')).toBe('Cleanup crew — Join the crew');
    expect(categoryOption('first_aid_cpr')).toBe(CATEGORY_LABELS.first_aid_cpr);
    expect(registerLabel('cleanup_crew')).toBe('Join the crew');
    expect(registerLabel('volunteer_briefing')).toBe('Join the crew');
    expect(registerLabel('shelter')).toBe('Register');
  });
});

describe('program time validation', () => {
  const now = new Date('2030-06-01T12:00:00.000Z');

  it('rejects a start in the past, beyond the grace window', () => {
    const past = cleanProgram(
      input('Late', { startsAt: '2030-06-01T11:00:00.000Z', endsAt: '2030-06-01T13:00:00.000Z' }),
      { now },
    );
    expect(past.value).toBeUndefined();
    expect(past.errors.startsAt).toMatch(/already passed/);
  });

  it('allows a start a few minutes ago (grace window)', () => {
    const justNow = new Date(now.getTime() - PAST_START_GRACE_MS + 60_000).toISOString();
    const result = cleanProgram(input('Just now', { startsAt: justNow }), { now });
    expect(result.errors.startsAt).toBeUndefined();
    expect(result.value).toBeDefined();
  });

  it('rejects an end before or equal to the start', () => {
    const backwards = cleanProgram(input('Backwards', { endsAt: '2030-06-01T14:00:00.000Z' }), {
      now,
    });
    expect(backwards.errors.endsAt).toMatch(/after the start/);
    const zero = cleanProgram(input('Zero length', { endsAt: START }), { now });
    expect(zero.errors.endsAt).toMatch(/after the start/);
  });

  it('keeps an unchanged start that has passed (editing a program in progress)', () => {
    const result = cleanProgram(input('In progress'), {
      now: new Date('2030-06-01T16:00:00.000Z'),
      currentStartsAt: new Date(START),
    });
    expect(result.errors.startsAt).toBeUndefined();
  });

  it('refuses a host submitting a past program, lets an admin backfill one', async () => {
    const past = { startsAt: '2020-01-01T10:00:00.000Z', endsAt: '2020-01-01T12:00:00.000Z' };
    const byHost = await createProgram(ctx.db, host.userId, input('Old drill', past));
    expect(byHost.ok).toBe(false);
    if (byHost.ok || byHost.tooManyPending) return;
    expect(byHost.fields.startsAt).toMatch(/already passed/);
    const byAdmin = await createProgram(ctx.db, admin, input('Old drill record', past));
    expect(byAdmin.ok).toBe(true);
  });
});

describe('host edits to an approved program', () => {
  it('sends a material change back to review and logs it', async () => {
    const program = await liveProgram('Night shelter');
    const edited = await editProgram(ctx.db, host, program.id, {
      ...input('Night shelter'),
      location: 'Temple hall',
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.program.status).toBe('pending');
    expect(edited.program.location).toBe('Temple hall');

    const kinds = (await programHistory(ctx.db, program.id)).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['edited', 'submitted']));
    expect((await listPendingPrograms(ctx.db)).map((p) => p.id)).toContain(program.id);
    // No longer listed publicly until an admin approves it again.
    const listed = await listPrograms(ctx.db, { now: new Date('2030-01-01T00:00:00.000Z') });
    expect(listed.map((p) => p.id)).not.toContain(program.id);
  });

  it('treats a start-time change as material', async () => {
    const program = await liveProgram('Morning rides');
    const edited = await editProgram(ctx.db, host, program.id, {
      ...input('Morning rides'),
      startsAt: '2030-06-01T14:00:00.000Z',
    });
    expect(edited.ok && edited.program.status).toBe('pending');
  });

  it('keeps it approved for a minor change (topics, capacity)', async () => {
    const program = await liveProgram('Supply drop');
    const edited = await editProgram(ctx.db, host, program.id, {
      ...input('Supply drop'),
      topics: 'water, rice, torches',
      capacity: 30,
    });
    expect(edited.ok && edited.program.status).toBe('approved');
  });

  it('lets an admin make a material change directly', async () => {
    const program = await liveProgram('Cleanup Saturday');
    const edited = await editProgram(ctx.db, admin, program.id, {
      ...input('Cleanup Saturday (moved)'),
      location: 'Market square',
    });
    expect(edited.ok && edited.program.status).toBe('approved');
  });
});

describe('my registrations', () => {
  it('lists active registrations with notices for cancelled and changed programs', async () => {
    const attendee = 'user_od_attendee';
    const steady = await liveProgram('Steady shelter', { capacity: 5 });
    const moved = await liveProgram('Moved rides');
    const called = await liveProgram('Called-off cleanup', { category: 'cleanup_crew' });
    const left = await liveProgram('Left supplies');
    for (const p of [steady, moved, called, left])
      expect(await registerForProgram(ctx.db, attendee, p.id)).toEqual({ ok: true });
    await registerForProgram(ctx.db, 'user_od_other', steady.id);

    // Admin moves the time (stays approved); host cancels one; the attendee leaves another.
    await editProgram(ctx.db, admin, moved.id, {
      ...input('Moved rides'),
      startsAt: '2030-06-01T16:00:00.000Z',
      endsAt: '2030-06-01T18:00:00.000Z',
    });
    await cancelProgram(ctx.db, host, called.id, 'river still too high');
    await cancelRegistration(ctx.db, attendee, left.id);

    const mine = await listMyRegistrations(ctx.db, attendee, new Date('2030-01-01T00:00:00.000Z'));
    const byTitle = Object.fromEntries(mine.map((r) => [r.title, r]));
    expect(Object.keys(byTitle).sort()).toEqual(
      ['Called-off cleanup', 'Moved rides', 'Steady shelter'].sort(),
    );
    expect(byTitle['Steady shelter'].notices).toEqual([]);
    expect(byTitle['Steady shelter'].registered).toBe(2);
    expect(byTitle['Moved rides'].notices).toEqual(['time_changed']);
    expect(byTitle['Called-off cleanup'].notices).toEqual(['cancelled']);
    expect(byTitle['Called-off cleanup'].status).toBe('cancelled');
  });

  it('flags a program sent back to review after the host moves it', async () => {
    const attendee = 'user_od_attendee2';
    const program = await liveProgram('Shelter that moves');
    await registerForProgram(ctx.db, attendee, program.id);
    await editProgram(ctx.db, host, program.id, {
      ...input('Shelter that moves'),
      location: 'New gym',
    });
    const [reg] = await listMyRegistrations(ctx.db, attendee, new Date('2030-01-01T00:00:00.000Z'));
    expect(reg.notices).toEqual(['under_review', 'place_changed']);
  });

  it('hides programs that have ended and returns nothing for a stranger', async () => {
    const attendee = 'user_od_attendee3';
    const program = await liveProgram('Ends soon');
    await registerForProgram(ctx.db, attendee, program.id);
    expect(
      await listMyRegistrations(ctx.db, attendee, new Date('2031-01-01T00:00:00.000Z')),
    ).toEqual([]);
    expect(await listMyRegistrations(ctx.db, 'user_nobody')).toEqual([]);
  });
});

describe('host headcount', () => {
  it('gives the host a count of active registrations and no attendee details', async () => {
    const hostB = 'user_od_host_b';
    const created = await createProgram(ctx.db, hostB, input('Counted shelter', { capacity: 3 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await approveProgram(ctx.db, admin, created.program.id);
    await registerForProgram(ctx.db, 'u_a', created.program.id);
    await registerForProgram(ctx.db, 'u_b', created.program.id);
    await registerForProgram(ctx.db, 'u_c', created.program.id);
    await cancelRegistration(ctx.db, 'u_c', created.program.id);

    const [mine] = await listMyPrograms(ctx.db, hostB);
    expect(mine.registered).toBe(2);
    expect(mine.capacity).toBe(3);
    expect(Object.keys(mine)).not.toContain('attendees');
    expect(JSON.stringify(mine)).not.toContain('u_a');
  });
});
