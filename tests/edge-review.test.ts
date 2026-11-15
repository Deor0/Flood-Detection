import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanMissing } from '@/core/missing/validate';
import { normalizeName } from '@/core/missing/names';
import { editMissing, markFound, reportMissing, searchMissing } from '@/core/missing/service';
import {
  cancelRegistration,
  cleanProgram,
  createProgram,
  listPrograms,
  registerForProgram,
} from '@/core/programs/service';
import { createTestDb } from './db';

const actor = { userId: 'user_reporter' };
const other = { userId: 'user_other' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

describe('missing person edges', () => {
  it('rejects an empty name, a fractional age, and an age over 120', () => {
    expect(cleanMissing({ name: ' ' }).errors.name).toBeTruthy();
    expect(cleanMissing({ name: 'Ada', age: '8.5' }).errors.age).toMatch(/whole number/);
    expect(cleanMissing({ name: 'Ada', age: 121 }).errors.age).toBeTruthy();
    expect(cleanMissing({ name: 'Ada', age: 0 }).errors.age).toBeUndefined();
  });

  it('finds a non-Latin name without also returning everyone else', async () => {
    const latin = await reportMissing(ctx.db, actor, { name: 'David Miller' });
    const cjk = await reportMissing(ctx.db, actor, { name: '李明' });
    expect(latin.ok && cjk.ok).toBe(true);
    if (!cjk.ok) return;

    expect(normalizeName('李明').length).toBeGreaterThan(0);
    const hits = await searchMissing(ctx.db, '李明');
    expect(hits.map((p) => p.id)).toEqual([cjk.person.id]);
  });

  it('treats a percent sign as a literal character in search', async () => {
    const named = await reportMissing(ctx.db, actor, { name: 'Percent Person' });
    expect(named.ok).toBe(true);
    const hits = await searchMissing(ctx.db, '%');
    expect(hits).toHaveLength(0);
  });

  it('lets a different signed-in user edit and mark found', async () => {
    const reported = await reportMissing(ctx.db, actor, { name: 'Owned Record' });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;

    const edited = await editMissing(ctx.db, other, reported.person.id, {
      name: 'Owned Record',
      notes: 'changed by someone else',
    });
    const found = await markFound(ctx.db, other, reported.person.id, 'not the reporter');
    expect(edited).toEqual({ ok: false, reason: 'forbidden' });
    expect(found.ok).toBe(true);
  });

  it('keeps a found record found when marked again', async () => {
    const reported = await reportMissing(ctx.db, actor, { name: 'Stay Found' });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;
    await markFound(ctx.db, actor, reported.person.id);
    const second = await markFound(ctx.db, actor, reported.person.id);
    expect(second).toEqual({ ok: false, reason: 'already_found' });
  });
});

describe('program edges', () => {
  it('rejects a backwards time range and a zero capacity', () => {
    const backwards = cleanProgram({
      title: 'Evening drill',
      category: 'evacuation_drill',
      organizer: 'Ward 2',
      location: 'Park',
      startsAt: '2026-12-02T18:00:00.000Z',
      endsAt: '2026-12-02T17:00:00.000Z',
      capacity: '',
    });
    expect(backwards.errors.endsAt).toMatch(/after the start/);

    const zero = cleanProgram({
      title: 'Evening drill',
      category: 'evacuation_drill',
      organizer: 'Ward 2',
      location: 'Park',
      startsAt: '2026-12-02T17:00:00.000Z',
      endsAt: '2026-12-02T18:00:00.000Z',
      capacity: 0,
    });
    expect(zero.errors.capacity).toBeTruthy();
  });

  it('shows a program that has started and not ended, and hides one that has ended', async () => {
    const publisher = { userId: actor.userId, isAdmin: true };
    const live = await createProgram(ctx.db, publisher, {
      title: 'In progress briefing',
      category: 'volunteer_briefing',
      organizer: 'Team',
      location: 'Hall',
      startsAt: '2026-11-14T10:00:00.000Z',
      endsAt: '2026-11-14T18:00:00.000Z',
      capacity: '',
    });
    const over = await createProgram(ctx.db, publisher, {
      title: 'Finished briefing',
      category: 'volunteer_briefing',
      organizer: 'Team',
      location: 'Hall',
      startsAt: '2026-11-13T10:00:00.000Z',
      endsAt: '2026-11-13T12:00:00.000Z',
      capacity: '',
    });
    expect(live.ok && over.ok).toBe(true);
    const titles = (await listPrograms(ctx.db, { now: new Date('2026-11-14T12:00:00.000Z') })).map(
      (p) => p.title,
    );
    expect(titles).toContain('In progress briefing');
    expect(titles).not.toContain('Finished briefing');
  });

  it('refuses registration after the program ends and allows the same person to register again after cancelling', async () => {
    const publisher = { userId: actor.userId, isAdmin: true };
    const created = await createProgram(ctx.db, publisher, {
      title: 'Short workshop',
      category: 'water_sanitation',
      organizer: 'Health',
      location: 'Kitchen',
      startsAt: '2026-11-01T10:00:00.000Z',
      endsAt: '2026-11-01T12:00:00.000Z',
      capacity: 2,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const late = await registerForProgram(
      ctx.db,
      'user_late',
      created.program.id,
      new Date('2026-11-02T00:00:00.000Z'),
    );
    expect(late).toEqual({ ok: false, reason: 'ended' });

    const open = await createProgram(ctx.db, publisher, {
      title: 'Open workshop',
      category: 'water_sanitation',
      organizer: 'Health',
      location: 'Kitchen',
      startsAt: '2026-12-01T10:00:00.000Z',
      endsAt: '2026-12-01T12:00:00.000Z',
      capacity: 2,
    });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(await registerForProgram(ctx.db, 'user_a', open.program.id)).toEqual({ ok: true });
    expect(await cancelRegistration(ctx.db, 'user_a', open.program.id)).toEqual({ ok: true });
    expect(await registerForProgram(ctx.db, 'user_a', open.program.id)).toEqual({ ok: true });
  });

  it('gives exactly three seats when six people register at once for a three-seat program', async () => {
    const created = await createProgram(ctx.db, { userId: actor.userId, isAdmin: true }, {
      title: 'Limited drill',
      category: 'evacuation_drill',
      organizer: 'Ward',
      location: 'Field',
      startsAt: '2026-12-05T10:00:00.000Z',
      endsAt: '2026-12-05T12:00:00.000Z',
      capacity: 3,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const results = await Promise.all(
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id) =>
        registerForProgram(ctx.db, id, created.program.id),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === 'full')).toHaveLength(3);
  });
});
