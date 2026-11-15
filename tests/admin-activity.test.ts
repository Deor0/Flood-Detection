import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  floodAlertEvents,
  floodAlerts,
  missingPersonEditRequests,
  missingPersonEvents,
  missingPersons,
  programEvents,
  programs,
} from '@/db/schema';
import {
  actorLabel,
  describeKind,
  listActivity,
  listOldestPending,
  listRecentActors,
  maskPhone,
  parseActivityFilter,
  waitingLabel,
} from '@/core/admin/activity';
import { composeReason, REJECT_REASON_TEMPLATES } from '@/core/admin/reasons';
import { createTestDb } from './db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const t = (min: number) => new Date(Date.UTC(2026, 10, 15, 10, min));

beforeAll(async () => {
  ctx = await createTestDb();
  const db = ctx.db;
  const [ana] = await db
    .insert(missingPersons)
    .values({ name: 'Ana Rai', nameNormalized: 'ana rai', reporterPhone: '+15555550132' })
    .returning();
  await db.insert(missingPersonEvents).values([
    { missingPersonId: ana.id, kind: 'reported', actorPhone: '+15555550132', createdAt: t(1) },
    { missingPersonId: ana.id, kind: 'found', actorUserId: 'user_finder', createdAt: t(5) },
  ]);
  const [prog] = await db
    .insert(programs)
    .values({
      title: 'CPR refresher',
      category: 'first_aid_cpr',
      organizer: 'Ward 4',
      location: 'Hall',
      startsAt: t(0),
      endsAt: t(30),
      createdByUserId: 'user_host',
      createdAt: t(2),
    })
    .returning();
  await db
    .insert(programEvents)
    .values({ programId: prog.id, kind: 'submitted', actorUserId: 'user_host', createdAt: t(2) });
  const [alert] = await db
    .insert(floodAlerts)
    .values({
      kind: 'simulated',
      place: 'Bagmati bridge',
      lat: 27.7,
      lng: 85.3,
      severity: 'warning',
      createdByUserId: 'user_admin',
    })
    .returning();
  await db.insert(floodAlertEvents).values([
    { alertId: alert.id, kind: 'detected', actorUserId: 'user_admin', createdAt: t(3) },
    { alertId: alert.id, kind: 'verified', actorUserId: 'user_admin', createdAt: t(4) },
  ]);
  // Pending work: an edit request older than the program.
  await db.insert(missingPersonEditRequests).values({
    missingPersonId: ana.id,
    submittedByUserId: 'user_finder',
    baseUpdatedAt: t(0),
    proposed: { name: 'Ana Rai' },
    createdAt: t(0),
  });
});
afterAll(async () => {
  await ctx.close();
});

describe('activity feed (The Helmsman’s Log)', () => {
  it('merges missing, program and flood-alert events, newest first', async () => {
    const rows = await listActivity(ctx.db);
    expect(rows.map((r) => `${r.source}:${r.kind}`)).toEqual([
      'missing:found',
      'alert:verified',
      'alert:detected',
      'program:submitted',
      'missing:reported',
    ]);
    expect(rows[1].subject).toBe('Bagmati bridge (simulated)');
    expect(rows[3].subject).toBe('CPR refresher');
  });

  it('filters by kind', async () => {
    expect(
      (await listActivity(ctx.db, { kind: 'alerts' })).every((r) => r.source === 'alert'),
    ).toBe(true);
    expect((await listActivity(ctx.db, { kind: 'programs' })).map((r) => r.kind)).toEqual([
      'submitted',
    ]);
    expect((await listActivity(ctx.db, { kind: 'missing' })).length).toBe(2);
    expect(parseActivityFilter('alerts')).toBe('alerts');
    expect(parseActivityFilter('drop table')).toBe('all');
  });

  it('filters by actor, user id or phone', async () => {
    expect((await listActivity(ctx.db, { actor: 'user_admin' })).map((r) => r.kind)).toEqual([
      'verified',
      'detected',
    ]);
    const byPhone = await listActivity(ctx.db, { actor: '+15555550132' });
    expect(byPhone.map((r) => r.kind)).toEqual(['reported']);
    expect(await listRecentActors(ctx.db)).toEqual([
      'user_finder',
      'user_admin',
      'user_host',
      '+15555550132',
    ]);
  });

  it('respects the limit', async () => {
    expect((await listActivity(ctx.db, { limit: 2 })).length).toBe(2);
  });

  it('shows names instead of ids and masks phones', () => {
    const names = new Map([['user_finder', 'Mira (mira@example.org)']]);
    expect(actorLabel({ actorUserId: 'user_finder', actorPhone: null }, names)).toBe(
      'Mira (mira@example.org)',
    );
    expect(actorLabel({ actorUserId: null, actorPhone: '+15555550132' }, names)).toBe(
      'SMS +1•••0132',
    );
    const unresolved = actorLabel({ actorUserId: 'user_gone', actorPhone: null }, names);
    expect(unresolved).not.toContain('user_gone');
    expect(maskPhone('+15555550132')).toBe('+1•••0132');
    expect(maskPhone('+9779812345678')).toBe('+977•••5678');
    expect(maskPhone('12')).toBe('•••');
    expect(describeKind('edit_approved')).toMatch(/woven in/);
    expect(describeKind('something_new')).toBe('something new');
  });
});

describe('oldest pending work', () => {
  it('lists pending programs and edit requests oldest first with a wait label', async () => {
    const items = await listOldestPending(ctx.db);
    expect(items.map((i) => i.source)).toEqual(['edit_request', 'program']);
    expect(items[0].title).toBe('Suggested edit: Ana Rai');
    expect(items[1].href).toBe('/admin/programs');
  });

  it('formats waiting time', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    expect(waitingLabel(new Date('2026-11-15T09:00:00Z'), now)).toBe('waiting 3 h');
    expect(waitingLabel(new Date('2026-11-15T11:48:00Z'), now)).toBe('waiting 12 min');
    expect(waitingLabel(new Date('2026-11-12T12:00:00Z'), now)).toBe('waiting 3 d');
    expect(waitingLabel(new Date('2026-11-15T12:00:30Z'), now)).toBe('waiting under a minute');
  });
});

describe('reject reason templates', () => {
  it('combines a known template with free text', () => {
    const tpl = REJECT_REASON_TEMPLATES.edit[1];
    expect(composeReason('edit', tpl, '')).toBe(tpl);
    expect(composeReason('edit', tpl, ' neighbour says otherwise ')).toBe(
      `${tpl}: neighbour says otherwise`,
    );
    expect(composeReason('edit', '', 'only text')).toBe('only text');
    expect(composeReason('program', 'made-up template', 'x y z')).toBe('x y z');
    expect(composeReason('program', null, 'a'.repeat(900)).length).toBe(500);
  });
});
