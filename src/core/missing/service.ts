import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersonEvents, missingPersons } from '@/db/schema';
import { normalizeName } from './names';
import { cleanMissing, type CleanMissing, type FieldErrors, type MissingInput } from './validate';

/** Who is acting: a signed-in web user (Clerk id) and/or an SMS sender (phone). */
export type Actor = { userId?: string; phone?: string };

export type MissingPerson = typeof missingPersons.$inferSelect;

export type ReportResult =
  { ok: true; person: MissingPerson } | { ok: false; fields: FieldErrors<keyof CleanMissing> };

export async function reportMissing(
  db: AppDb,
  actor: Actor,
  input: MissingInput,
): Promise<ReportResult> {
  const { value, errors } = cleanMissing(input);
  if (!value) return { ok: false, fields: errors };

  const person = await db.transaction(async (tx) => {
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
  return { ok: true, person };
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
): Promise<MissingPerson[]> {
  const tokens = normalizeName(query).split(' ').filter(Boolean);
  const where = tokens.length
    ? and(...tokens.map((t) => ilike(missingPersons.nameNormalized, `%${escapeLike(t)}%`)))
    : undefined;
  return db
    .select()
    .from(missingPersons)
    .where(where)
    .orderBy(desc(missingPersons.updatedAt))
    .limit(limit);
}

export async function getMissing(db: AppDb, id: string): Promise<MissingPerson | null> {
  const [row] = await db.select().from(missingPersons).where(eq(missingPersons.id, id)).limit(1);
  return row ?? null;
}

export type FoundResult =
  { ok: true; person: MissingPerson } | { ok: false; reason: 'not_found' | 'already_found' };

/** missing -> found. Safe to call twice: the second call changes nothing. */
export async function markFound(
  db: AppDb,
  actor: Actor,
  id: string,
  note?: string,
): Promise<FoundResult> {
  const cleanNote = (note ?? '').trim().slice(0, 500) || null;
  return db.transaction(async (tx) => {
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
    return { ok: true, person } as const;
  });
}

export type EditResult =
  | { ok: true; person: MissingPerson; changed: string[] }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid'; fields: FieldErrors<keyof CleanMissing> };

const EDITABLE = ['name', 'age', 'lastSeenLocation', 'notes', 'contact'] as const;

/** Updates the details and logs exactly what changed, who changed it and when. */
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

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of EDITABLE) {
      if (current[field] !== value[field])
        changes[field] = { from: current[field], to: value[field] };
    }
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

export async function missingHistory(db: AppDb, id: string) {
  return db
    .select()
    .from(missingPersonEvents)
    .where(eq(missingPersonEvents.missingPersonId, id))
    .orderBy(desc(missingPersonEvents.createdAt));
}
