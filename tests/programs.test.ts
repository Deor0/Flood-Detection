import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { programRegistrations } from '@/db/schema';
import {
  cancelRegistration,
  createProgram,
  listPrograms,
  registerForProgram,
} from '@/core/programs/service';
import { createTestDb } from './db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const host = { userId: 'user_host', isAdmin: true };

function program(overrides: Record<string, string | number | null> = {}) {
  return {
    title: 'Community CPR refresher',
    category: 'first_aid_cpr',
    organizer: 'River Ward Volunteers',
    location: 'Central Community Post',
    topics: 'CPR, recovery position',
    startsAt: '2026-12-01T15:00:00.000Z',
    endsAt: '2026-12-01T17:00:00.000Z',
    capacity: 2,
    ...overrides,
  };
}

describe('community awareness programs', () => {
  it('lists upcoming programs that match the search and the category together', async () => {
    const cpr = await createProgram(ctx.db, host, program());
    const drill = await createProgram(
      ctx.db,
      host,
      program({
        title: 'Neighborhood evacuation drill',
        category: 'evacuation_drill',
        topics: 'go-bag, routes',
        startsAt: '2026-12-02T15:00:00.000Z',
        endsAt: '2026-12-02T17:00:00.000Z',
      }),
    );
    const ended = await createProgram(
      ctx.db,
      host,
      program({
        title: 'Last month water workshop',
        category: 'water_sanitation',
        startsAt: '2026-01-01T15:00:00.000Z',
        endsAt: '2026-01-01T16:00:00.000Z',
        capacity: null,
      }),
    );
    expect(cpr.ok && drill.ok && ended.ok).toBe(true);

    const now = new Date('2026-11-14T12:00:00.000Z');
    const byText = await listPrograms(ctx.db, { q: 'cpr', now });
    expect(byText.map((p) => p.title)).toEqual(['Community CPR refresher']);

    const byCategory = await listPrograms(ctx.db, { category: 'evacuation_drill', now });
    expect(byCategory.map((p) => p.title)).toEqual(['Neighborhood evacuation drill']);

    const both = await listPrograms(ctx.db, { q: 'cpr', category: 'evacuation_drill', now });
    expect(both).toHaveLength(0);

    const visible = await listPrograms(ctx.db, { now });
    expect(visible.map((p) => p.title)).not.toContain('Last month water workshop');
  });

  it('registers once, refuses a full program, and cancels without deleting the row', async () => {
    const created = await createProgram(ctx.db, host, program({ title: 'Flood watch briefing', capacity: 1 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await registerForProgram(ctx.db, 'user_a', created.program.id);
    const duplicate = await registerForProgram(ctx.db, 'user_a', created.program.id);
    const full = await registerForProgram(ctx.db, 'user_b', created.program.id);
    expect(first).toEqual({ ok: true });
    expect(duplicate).toEqual({ ok: false, reason: 'already_registered' });
    expect(full).toEqual({ ok: false, reason: 'full' });

    const cancelled = await cancelRegistration(ctx.db, 'user_a', created.program.id);
    expect(cancelled).toEqual({ ok: true });

    const rows = await ctx.db
      .select()
      .from(programRegistrations)
      .where(
        and(
          eq(programRegistrations.programId, created.program.id),
          eq(programRegistrations.userId, 'user_a'),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cancelledAt).toBeTruthy();

    const openSeat = await registerForProgram(ctx.db, 'user_b', created.program.id);
    expect(openSeat).toEqual({ ok: true });

    const active = await ctx.db
      .select()
      .from(programRegistrations)
      .where(
        and(eq(programRegistrations.programId, created.program.id), isNull(programRegistrations.cancelledAt)),
      );
    expect(active).toHaveLength(1);
  });
});
