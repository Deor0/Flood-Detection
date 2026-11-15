import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersonEditRequests, missingPersonEvents, missingPersons } from '@/db/schema';
import { normalizeName } from './names';
import { cleanMissing, type CleanMissing, type FieldErrors, type MissingInput } from './validate';

import {
  LIMITS,
  canEditMissingDirectly,
  canMarkFoundDirectly,
  canReopen,
  canSeeContact,
  type Actor,
} from '@/core/permissions';
export type { Actor };

export type MissingPerson = typeof missingPersons.$inferSelect;

/** Under 18: shown as initials to the public, and notes are for the reporter and admins only. */
export const isMinor = (p: { age: number | null }) => p.age !== null && p.age < 18;

export type ReportResult =
  | { ok: true; person: MissingPerson }
  | { ok: false; rateLimited: true }
  | { ok: false; rateLimited?: undefined; fields: FieldErrors<keyof CleanMissing> };

export async function reportMissing(
  db: AppDb,
  actor: Actor,
  input: MissingInput,
): Promise<ReportResult> {
  const { value, errors } = cleanMissing(input);
  if (!value) return { ok: false, fields: errors };

  // Testing switch: DISABLE_REPORT_LIMIT=true turns off the 10-reports-per-24h cap. Unset = on.
  const limitOn = process.env.DISABLE_REPORT_LIMIT !== 'true';

  const result = await db.transaction(async (tx) => {
    if (limitOn && !actor.isAdmin && (actor.userId || actor.phone)) {
      const who = (actor.userId ?? actor.phone) as string;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'missing-report:' + who}))`);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(missingPersons)
        .where(
          and(
            actor.userId
              ? eq(missingPersons.reporterUserId, actor.userId)
              : eq(missingPersons.reporterPhone, actor.phone as string),
            gte(missingPersons.createdAt, since),
          ),
        );
      if (n >= LIMITS.reportsPerUserPer24h) return null;
    }
    const [row] = await tx
      .insert(missingPersons)
      .values({
        ...value,
        nameNormalized: normalizeName(value.name),
        status: 'missing',
        reporterUserId: actor.userId ?? null,
        reporterPhone: actor.phone ?? null,
      })
      .returning();
    await tx.insert(missingPersonEvents).values({
      missingPersonId: row.id,
      kind: 'reported',
      actorUserId: actor.userId ?? null,
      actorPhone: actor.phone ?? null,
    });
    return row;
  });
  if (!result) return { ok: false, rateLimited: true };
  return { ok: true, person: result };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Every word of the query must appear in the name, in any order, ignoring case and accents:
 * "miller", "David Miller" and "miller, david" all find "David Miller".
 */
export async function searchMissing(
  db: AppDb,
  query: string,
  limit = 50,
  opts: { status?: 'missing' | 'found' } = {},
): Promise<MissingPerson[]> {
  const tokens = normalizeName(query).split(' ').filter(Boolean);
  // A non-empty query that has no searchable characters ("%", "!!!") matches nothing.
  if (query.trim() !== '' && tokens.length === 0) return [];
  // Each token may match the name as written ("o brien") or with spaces removed ("obrien").
  const compact = sql`replace(${missingPersons.nameNormalized}, ' ', '')`;
  const where = tokens.length
    ? and(
        ...tokens.map((t) =>
          or(
            ilike(missingPersons.nameNormalized, `%${escapeLike(t)}%`),
            sql`${compact} ilike ${`%${escapeLike(t)}%`}`,
          ),
        ),
      )
    : undefined;
  return db
    .select()
    .from(missingPersons)
    .where(and(where, opts.status ? eq(missingPersons.status, opts.status) : undefined))
    .orderBy(desc(missingPersons.updatedAt))
    .limit(limit);
}

export async function getMissing(db: AppDb, id: string): Promise<MissingPerson | null> {
  const [row] = await db.select().from(missingPersons).where(eq(missingPersons.id, id)).limit(1);
  return row ?? null;
}

export type FoundResult =
  | { ok: true; person: MissingPerson; pending?: undefined }
  /** Not the reporter: the "found" report waits for the reporter or an admin to confirm. */
  | { ok: true; person: MissingPerson; pending: true; requestId: string }
  | { ok: false; reason: 'not_found' | 'already_found' | 'rate_limited' | 'forbidden' };

/** One account cannot flip the registry: at most 5 mark-found actions per 10 minutes. Admins are exempt. */
export const MARK_FOUND_LIMIT = { count: 5, windowMs: 10 * 60 * 1000 } as const;

/** The `proposed` value of an edit request that says "this person is safe". */
type FoundClaim = { _kind: 'found'; note: string | null };
const isFoundClaim = (p: unknown): p is FoundClaim =>
  !!p && typeof p === 'object' && (p as { _kind?: unknown })._kind === 'found';
const foundClaimSql = sql`${missingPersonEditRequests.proposed}->>'_kind' = 'found'`;

/**
 * "This person is safe". The reporter and admins mark the record found at once. Anyone else files
 * a found claim in the suggestion queue: the record stays `missing` (shown as "Reported safe —
 * confirming") until the reporter marks it found or an admin approves the claim. Safe to call
 * twice: the second call changes nothing.
 */
export async function markFound(
  db: AppDb,
  actor: Actor,
  id: string,
  note?: string,
): Promise<FoundResult> {
  const cleanNote = (note ?? '').trim().slice(0, 500) || null;
  const [target] = await db
    .select({
      reporterUserId: missingPersons.reporterUserId,
      reporterPhone: missingPersons.reporterPhone,
    })
    .from(missingPersons)
    .where(eq(missingPersons.id, id))
    .limit(1);
  if (!target) return { ok: false, reason: 'not_found' };
  if (!canMarkFoundDirectly(actor, target)) return claimFound(db, actor, id, cleanNote);

  return db.transaction(async (tx) => {
    const who = actor.userId ?? actor.phone;
    if (!actor.isAdmin && who) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'missing-found:' + who}))`);
      const since = new Date(Date.now() - MARK_FOUND_LIMIT.windowMs);
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(missingPersonEvents)
        .where(
          and(
            eq(missingPersonEvents.kind, 'found'),
            actor.userId
              ? eq(missingPersonEvents.actorUserId, actor.userId)
              : eq(missingPersonEvents.actorPhone, actor.phone as string),
            gte(missingPersonEvents.createdAt, since),
          ),
        );
      if (n >= MARK_FOUND_LIMIT.count) return { ok: false, reason: 'rate_limited' } as const;
    }
    const [current] = await tx
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, id))
      .for('update')
      .limit(1);
    if (!current) return { ok: false, reason: 'not_found' } as const;
    if (current.status === 'found') return { ok: false, reason: 'already_found' } as const;

    const now = new Date();
    const [person] = await tx
      .update(missingPersons)
      .set({
        status: 'found',
        foundAt: now,
        foundByUserId: actor.userId ?? null,
        foundByPhone: actor.phone ?? null,
        foundNote: cleanNote,
        updatedAt: now,
      })
      .where(eq(missingPersons.id, id))
      .returning();
    await tx.insert(missingPersonEvents).values({
      missingPersonId: id,
      kind: 'found',
      actorUserId: actor.userId ?? null,
      actorPhone: actor.phone ?? null,
      changes: { note: cleanNote },
    });
    await closeFoundClaims(tx, actor, id);
    return { ok: true, person } as const;
  });
}

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

/** The record is now found: any waiting found claims for it are settled as approved. */
async function closeFoundClaims(tx: Tx, actor: Actor, id: string, except?: string) {
  const open = await tx
    .select({ id: missingPersonEditRequests.id, by: missingPersonEditRequests.submittedByUserId })
    .from(missingPersonEditRequests)
    .where(
      and(
        eq(missingPersonEditRequests.missingPersonId, id),
        eq(missingPersonEditRequests.status, 'pending'),
        foundClaimSql,
      ),
    );
  for (const req of open) {
    if (req.id === except) continue;
    await tx
      .update(missingPersonEditRequests)
      .set({ status: 'approved', reviewedByUserId: actor.userId ?? null, reviewedAt: new Date() })
      .where(eq(missingPersonEditRequests.id, req.id));
    await tx.insert(missingPersonEvents).values({
      missingPersonId: id,
      kind: 'edit_approved',
      actorUserId: actor.userId ?? null,
      actorPhone: actor.phone ?? null,
      changes: { requestId: req.id, submittedBy: req.by, found: true },
    });
  }
}

/** Files (or repeats) a found claim. One open claim per record; the record itself is unchanged. */
async function claimFound(
  db: AppDb,
  actor: Actor,
  id: string,
  note: string | null,
): Promise<FoundResult> {
  // Claims sit in the suggestion queue, which is keyed by a signed-in account.
  if (!actor.userId) return { ok: false, reason: 'forbidden' };
  const userId = actor.userId;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'missing-claim:' + id}))`);
    const [person] = await tx
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, id))
      .limit(1);
    if (!person) return { ok: false, reason: 'not_found' } as const;
    if (person.status === 'found') return { ok: false, reason: 'already_found' } as const;

    const [existing] = await tx
      .select({ id: missingPersonEditRequests.id })
      .from(missingPersonEditRequests)
      .where(
        and(
          eq(missingPersonEditRequests.missingPersonId, id),
          eq(missingPersonEditRequests.status, 'pending'),
          foundClaimSql,
        ),
      )
      .limit(1);
    if (existing) return { ok: true, person, pending: true, requestId: existing.id } as const;

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(missingPersonEditRequests)
      .where(
        and(
          eq(missingPersonEditRequests.submittedByUserId, userId),
          eq(missingPersonEditRequests.status, 'pending'),
        ),
      );
    if (!actor.isAdmin && n >= LIMITS.editRequestsPerUserPending)
      return { ok: false, reason: 'rate_limited' } as const;

    const claim: FoundClaim = { _kind: 'found', note };
    const [req] = await tx
      .insert(missingPersonEditRequests)
      .values({
        missingPersonId: id,
        submittedByUserId: userId,
        baseUpdatedAt: person.updatedAt,
        proposed: claim,
        status: 'pending',
      })
      .returning();
    await tx.insert(missingPersonEvents).values({
      missingPersonId: id,
      kind: 'found_claimed',
      actorUserId: userId,
      changes: { requestId: req.id, note },
    });
    return { ok: true, person, pending: true, requestId: req.id } as const;
  });
}

/** Ids (of those given) that have a found claim waiting for confirmation. */
export async function pendingFoundClaims(db: AppDb, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: missingPersonEditRequests.missingPersonId })
    .from(missingPersonEditRequests)
    .where(
      and(
        inArray(missingPersonEditRequests.missingPersonId, ids),
        eq(missingPersonEditRequests.status, 'pending'),
        foundClaimSql,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

export type EditResult =
  | { ok: true; person: MissingPerson; changed: string[] }
  | { ok: false; reason: 'not_found' | 'forbidden' }
  | { ok: false; reason: 'invalid'; fields: FieldErrors<keyof CleanMissing> };

const EDITABLE = ['name', 'age', 'lastSeenLocation', 'notes', 'contact'] as const;
type Changes = Record<string, { from: unknown; to: unknown }>;

type Base = Record<(typeof EDITABLE)[number], string | number | null>;
const baseOf = (p: MissingPerson): Base => ({
  name: p.name,
  age: p.age,
  lastSeenLocation: p.lastSeenLocation,
  notes: p.notes,
  contact: p.contact,
});

function diffPerson(current: MissingPerson, value: CleanMissing): Changes {
  const changes: Changes = {};
  for (const field of EDITABLE) {
    if (current[field] !== value[field])
      changes[field] = { from: current[field], to: value[field] };
  }
  return changes;
}

/** Updates the details and logs exactly what changed, who changed it and when. Admin or reporter. */
export async function editMissing(
  db: AppDb,
  actor: Actor,
  id: string,
  input: MissingInput,
): Promise<EditResult> {
  const { value, errors } = cleanMissing(input);
  if (!value) return { ok: false, reason: 'invalid', fields: errors };

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, id))
      .for('update')
      .limit(1);
    if (!current) return { ok: false, reason: 'not_found' } as const;
    if (!canEditMissingDirectly(actor, current)) return { ok: false, reason: 'forbidden' } as const;

    const changes = diffPerson(current, value);
    const changed = Object.keys(changes);
    if (changed.length === 0) return { ok: true, person: current, changed } as const;

    const [person] = await tx
      .update(missingPersons)
      .set({ ...value, nameNormalized: normalizeName(value.name), updatedAt: sql`now()` })
      .where(eq(missingPersons.id, id))
      .returning();
    await tx.insert(missingPersonEvents).values({
      missingPersonId: id,
      kind: 'edited',
      actorUserId: actor.userId ?? null,
      actorPhone: actor.phone ?? null,
      changes,
    });
    return { ok: true, person, changed } as const;
  });
}

export type RequestEditResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: 'not_found' | 'use_direct_edit' | 'no_change' | 'too_many' | 'forbidden' }
  | { ok: false; reason: 'invalid'; fields: FieldErrors<keyof CleanMissing> };

/** "Suggest an edit": queues a request for an admin; the record itself is not changed. */
export async function requestEdit(
  db: AppDb,
  actor: Actor,
  id: string,
  input: MissingInput,
): Promise<RequestEditResult> {
  if (!actor.userId) return { ok: false, reason: 'forbidden' };
  const userId = actor.userId;
  const { value: cleaned, errors } = cleanMissing(input);
  if (!cleaned) return { ok: false, reason: 'invalid', fields: errors };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'missing-edit-req:' + userId}))`);
    const [person] = await tx
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, id))
      .limit(1);
    if (!person) return { ok: false, reason: 'not_found' } as const;
    if (canEditMissingDirectly(actor, person))
      return { ok: false, reason: 'use_direct_edit' } as const;
    // Requesters cannot see the private contact line, so a suggestion never changes it. Notes
    // about a child are hidden from them too, so those stay as they are.
    const value: CleanMissing = {
      ...cleaned,
      contact: person.contact,
      ...(isMinor(person) ? { notes: person.notes } : {}),
    };
    if (Object.keys(diffPerson(person, value)).length === 0)
      return { ok: false, reason: 'no_change' } as const;

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(missingPersonEditRequests)
      .where(
        and(
          eq(missingPersonEditRequests.submittedByUserId, userId),
          eq(missingPersonEditRequests.status, 'pending'),
        ),
      );
    if (n >= LIMITS.editRequestsPerUserPending) return { ok: false, reason: 'too_many' } as const;

    const [req] = await tx
      .insert(missingPersonEditRequests)
      .values({
        missingPersonId: id,
        submittedByUserId: userId,
        baseUpdatedAt: person.updatedAt,
        // `_base` = the record's values when the suggestion was made, so approval can apply only
        // the fields the suggester actually changed.
        proposed: { ...value, _base: baseOf(person) },
        status: 'pending',
      })
      .returning();
    await tx.insert(missingPersonEvents).values({
      missingPersonId: id,
      kind: 'edit_requested',
      actorUserId: userId,
      changes: diffPerson(person, value),
    });
    return { ok: true, requestId: req.id } as const;
  });
}

export type EditRequestItem = {
  /** `found`: someone other than the reporter says the person is safe. */
  kind: 'edit' | 'found';
  request: typeof missingPersonEditRequests.$inferSelect;
  person: MissingPerson;
  proposed: CleanMissing;
  diff: Changes;
  /** The record changed after this suggestion was made. */
  stale: boolean;
};

/** Edit requests with the record's current values and a per-field diff. Oldest first. */
export async function listEditRequests(
  db: AppDb,
  opts: { status?: 'pending' | 'approved' | 'rejected' } = {},
): Promise<EditRequestItem[]> {
  const rows = await db
    .select({ request: missingPersonEditRequests, person: missingPersons })
    .from(missingPersonEditRequests)
    .innerJoin(missingPersons, eq(missingPersons.id, missingPersonEditRequests.missingPersonId))
    .where(eq(missingPersonEditRequests.status, opts.status ?? 'pending'))
    .orderBy(asc(missingPersonEditRequests.createdAt));
  return rows.map(({ request, person }) => {
    if (isFoundClaim(request.proposed)) {
      const diff: Changes = {};
      if (person.status !== 'found') diff.status = { from: person.status, to: 'found' };
      if (request.proposed.note)
        diff.foundNote = { from: person.foundNote, to: request.proposed.note };
      return {
        kind: 'found' as const,
        request,
        person,
        proposed: {
          name: person.name,
          age: person.age,
          lastSeenLocation: person.lastSeenLocation,
          notes: person.notes,
          contact: person.contact,
        },
        diff,
        stale: false,
      };
    }
    const { _base: base, ...proposed } = request.proposed as CleanMissing & { _base?: Base };
    const diff = diffPerson(person, proposed);
    // Show only what the suggester changed; fields edited since are not part of the suggestion.
    if (base) for (const f of EDITABLE) if (proposed[f] === base[f]) delete diff[f];
    return {
      kind: 'edit' as const,
      request,
      person,
      proposed,
      diff,
      stale: person.updatedAt.getTime() > request.baseUpdatedAt.getTime(),
    };
  });
}

export type ReviewResult =
  | { ok: true; person: MissingPerson; stale: boolean }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'not_pending' };

/** Admin only. Applies the suggestion to the record, logs the edit and the approval. */
export async function approveEditRequest(
  db: AppDb,
  actor: Actor,
  requestId: string,
): Promise<ReviewResult> {
  if (!actor.isAdmin) return { ok: false, reason: 'forbidden' };
  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(missingPersonEditRequests)
      .where(eq(missingPersonEditRequests.id, requestId))
      .for('update')
      .limit(1);
    if (!req) return { ok: false, reason: 'not_found' } as const;
    if (req.status !== 'pending') return { ok: false, reason: 'not_pending' } as const;
    const [current] = await tx
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, req.missingPersonId))
      .for('update')
      .limit(1);
    if (!current) return { ok: false, reason: 'not_found' } as const;

    if (isFoundClaim(req.proposed)) {
      // Confirming a found claim: the claimant is recorded as the finder.
      let person = current;
      if (current.status !== 'found') {
        const now = new Date();
        [person] = await tx
          .update(missingPersons)
          .set({
            status: 'found',
            foundAt: now,
            foundByUserId: req.submittedByUserId,
            foundByPhone: null,
            foundNote: req.proposed.note,
            updatedAt: now,
          })
          .where(eq(missingPersons.id, current.id))
          .returning();
        await tx.insert(missingPersonEvents).values({
          missingPersonId: current.id,
          kind: 'found',
          actorUserId: actor.userId ?? null,
          changes: { note: req.proposed.note, requestId, claimedBy: req.submittedByUserId },
        });
      }
      await tx
        .update(missingPersonEditRequests)
        .set({ status: 'approved', reviewedByUserId: actor.userId ?? null, reviewedAt: new Date() })
        .where(eq(missingPersonEditRequests.id, requestId));
      await tx.insert(missingPersonEvents).values({
        missingPersonId: current.id,
        kind: 'edit_approved',
        actorUserId: actor.userId ?? null,
        changes: { requestId, submittedBy: req.submittedByUserId, found: true },
      });
      await closeFoundClaims(tx, actor, current.id, requestId);
      return { ok: true, person, stale: false } as const;
    }

    const { _base: base, ...proposed } = req.proposed as CleanMissing & { _base?: Base };
    const stale = current.updatedAt.getTime() > req.baseUpdatedAt.getTime();
    // Apply only what the suggester changed, and never over a newer change to the same field.
    // A suggestion never touches the private contact line.
    const apply: Partial<CleanMissing> = {};
    const skipped: string[] = [];
    for (const field of EDITABLE) {
      if (field === 'contact') continue;
      const suggested = proposed[field];
      if (base) {
        if (suggested === base[field]) continue; // not part of the suggestion
        if (current[field] !== base[field]) {
          if (current[field] !== suggested) skipped.push(field); // changed since: newer wins
          continue;
        }
      } else if (current[field] === suggested) continue; // older request without a snapshot
      (apply as Record<string, unknown>)[field] = suggested;
    }
    const changes: Changes = {};
    for (const [field, to] of Object.entries(apply))
      changes[field] = { from: current[field as (typeof EDITABLE)[number]], to };
    let person = current;
    if (Object.keys(changes).length > 0) {
      [person] = await tx
        .update(missingPersons)
        .set({
          ...apply,
          ...(apply.name ? { nameNormalized: normalizeName(apply.name) } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(missingPersons.id, current.id))
        .returning();
      await tx.insert(missingPersonEvents).values({
        missingPersonId: current.id,
        kind: 'edited',
        actorUserId: actor.userId ?? null,
        changes,
      });
    }
    await tx
      .update(missingPersonEditRequests)
      .set({ status: 'approved', reviewedByUserId: actor.userId ?? null, reviewedAt: new Date() })
      .where(eq(missingPersonEditRequests.id, requestId));
    await tx.insert(missingPersonEvents).values({
      missingPersonId: current.id,
      kind: 'edit_approved',
      actorUserId: actor.userId ?? null,
      changes: { requestId, submittedBy: req.submittedByUserId, stale, skipped },
    });
    return { ok: true, person, stale } as const;
  });
}

const cleanReason = (reason: string) => {
  const r = (reason ?? '').trim();
  return r.length >= 3 && r.length <= 500 ? r : null;
};

export type RejectResult =
  { ok: true } | { ok: false; reason: 'forbidden' | 'not_found' | 'not_pending' | 'invalid' };

/** Admin only. A reason (3-500 characters) is required. The record is not changed. */
export async function rejectEditRequest(
  db: AppDb,
  actor: Actor,
  requestId: string,
  reason: string,
): Promise<RejectResult> {
  if (!actor.isAdmin) return { ok: false, reason: 'forbidden' };
  const why = cleanReason(reason);
  if (!why) return { ok: false, reason: 'invalid' };
  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(missingPersonEditRequests)
      .where(eq(missingPersonEditRequests.id, requestId))
      .for('update')
      .limit(1);
    if (!req) return { ok: false, reason: 'not_found' } as const;
    if (req.status !== 'pending') return { ok: false, reason: 'not_pending' } as const;
    await tx
      .update(missingPersonEditRequests)
      .set({
        status: 'rejected',
        rejectReason: why,
        reviewedByUserId: actor.userId ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(missingPersonEditRequests.id, requestId));
    await tx.insert(missingPersonEvents).values({
      missingPersonId: req.missingPersonId,
      kind: 'edit_rejected',
      actorUserId: actor.userId ?? null,
      reason: why,
      changes: { requestId, submittedBy: req.submittedByUserId },
    });
    return { ok: true } as const;
  });
}

export type ReopenResult =
  | { ok: true; person: MissingPerson }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'already_missing' | 'invalid' };

/** Admin only: found -> missing again, with a required reason. Found details are cleared. */
export async function reopenMissing(
  db: AppDb,
  actor: Actor,
  id: string,
  reason: string,
): Promise<ReopenResult> {
  if (!canReopen(actor)) return { ok: false, reason: 'forbidden' };
  const why = cleanReason(reason);
  if (!why) return { ok: false, reason: 'invalid' };
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.id, id))
      .for('update')
      .limit(1);
    if (!current) return { ok: false, reason: 'not_found' } as const;
    if (current.status !== 'found') return { ok: false, reason: 'already_missing' } as const;
    const [person] = await tx
      .update(missingPersons)
      .set({
        status: 'missing',
        foundAt: null,
        foundByUserId: null,
        foundByPhone: null,
        foundNote: null,
        updatedAt: sql`now()`,
      })
      .where(eq(missingPersons.id, id))
      .returning();
    await tx.insert(missingPersonEvents).values({
      missingPersonId: id,
      kind: 'reopened',
      actorUserId: actor.userId ?? null,
      reason: why,
      changes: {
        foundNote: current.foundNote,
        foundAt: current.foundAt,
        foundByUserId: current.foundByUserId,
        foundByPhone: current.foundByPhone,
      },
    });
    return { ok: true, person } as const;
  });
}

/**
 * The person with private fields removed unless the viewer may see them: `contact` is for admins
 * and the reporter; the found note (it can reveal where someone is now) is also for the finder.
 */
export function redactForViewer<
  P extends {
    contact: string | null;
    reporterUserId: string | null;
    reporterPhone: string | null;
    foundNote?: string | null;
    foundByUserId?: string | null;
    foundByPhone?: string | null;
  },
>(person: P, actor: Actor): P {
  const privileged = canSeeContact(actor, person);
  const isFinder =
    (!!actor.userId && person.foundByUserId === actor.userId) ||
    (!!actor.phone && person.foundByPhone === actor.phone);
  const out = { ...person };
  if (!privileged) out.contact = null;
  if (!privileged && !isFinder && 'foundNote' in out) out.foundNote = null;
  return out;
}

export async function missingHistory(db: AppDb, id: string) {
  return (
    db
      .select()
      .from(missingPersonEvents)
      .where(eq(missingPersonEvents.missingPersonId, id))
      // Events written in one transaction share a timestamp; list the approval above the edit it made.
      .orderBy(
        desc(missingPersonEvents.createdAt),
        sql`case ${missingPersonEvents.kind} when 'edit_approved' then 1 else 0 end desc`,
      )
  );
}
