import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import {
  PROGRAM_CATEGORIES,
  programEvents,
  programRegistrations,
  programs,
  type ProgramCategory,
} from '@/db/schema';
import { LIMITS, canManageProgram } from '@/core/permissions';
import { parseZoned } from '@/lib/time';

/** A plain user id (treated as a non-admin) or an actor object. */
export type ProgramActor = string | { userId: string; isAdmin?: boolean };
const normActor = (a: ProgramActor) =>
  typeof a === 'string'
    ? { userId: a, isAdmin: false }
    : { userId: a.userId, isAdmin: !!a.isAdmin };

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ProgramInput = {
  title: string;
  category: string;
  organizer: string;
  location: string;
  topics?: string;
  startsAt: string; // anything `new Date()` understands, e.g. from <input type="datetime-local">
  endsAt: string;
  capacity?: string | number | null; // empty = open access
};

export type CleanProgram = {
  title: string;
  category: ProgramCategory;
  organizer: string;
  location: string;
  topics: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number | null;
};

export function cleanProgram(input: ProgramInput): {
  value?: CleanProgram;
  errors: FieldErrors<keyof ProgramInput>;
} {
  const errors: FieldErrors<keyof ProgramInput> = {};
  const title = input.title.trim();
  if (title.length < 3) errors.title = 'Enter a title (at least 3 characters).';
  else if (title.length > 150) errors.title = 'Title is too long (150 characters max).';

  const category = PROGRAM_CATEGORIES.find((c) => c === input.category);
  if (!category) errors.category = 'Choose a category.';

  const organizer = input.organizer.trim();
  if (organizer.length < 2) errors.organizer = 'Enter who is organizing it.';
  else if (organizer.length > 150) errors.organizer = 'Organizer is too long.';

  const location = input.location.trim();
  if (location.length < 2) errors.location = 'Enter where it takes place.';
  else if (location.length > 200) errors.location = 'Location is too long.';

  const topics = (input.topics ?? '').trim();
  if (topics.length > 500) errors.topics = 'Topics are too long (500 characters max).';

  const startsAt = parseZoned(input.startsAt);
  const endsAt = parseZoned(input.endsAt);
  if (!input.startsAt || Number.isNaN(startsAt.getTime()))
    errors.startsAt = 'Choose a start date and time.';
  if (!input.endsAt || Number.isNaN(endsAt.getTime()))
    errors.endsAt = 'Choose an end date and time.';
  if (!errors.startsAt && !errors.endsAt && endsAt <= startsAt)
    errors.endsAt = 'The end must be after the start.';

  let capacity: number | null = null;
  const rawCap = typeof input.capacity === 'string' ? input.capacity.trim() : input.capacity;
  if (rawCap !== undefined && rawCap !== null && rawCap !== '') {
    const n = Number(rawCap);
    if (!Number.isInteger(n) || n < 1 || n > 100000)
      errors.capacity = 'Capacity must be a whole number, or leave it empty for open access.';
    else capacity = n;
  }

  if (Object.keys(errors).length > 0 || !category) return { errors };
  return {
    errors,
    value: {
      title,
      category,
      organizer,
      location,
      topics: topics || null,
      startsAt,
      endsAt,
      capacity,
    },
  };
}

export type CreateProgramResult =
  | { ok: true; program: typeof programs.$inferSelect }
  | { ok: false; tooManyPending: true; fields?: undefined }
  | { ok: false; fields: FieldErrors<keyof ProgramInput>; tooManyPending?: undefined };

/** Non-admins submit a pending program (capped); admins publish directly. */
export async function createProgram(
  db: AppDb,
  actorIn: ProgramActor,
  input: ProgramInput,
): Promise<CreateProgramResult> {
  const actor = normActor(actorIn);
  const { value, errors } = cleanProgram(input);
  if (!value) return { ok: false, fields: errors };
  return db.transaction(async (tx) => {
    if (!actor.isAdmin) {
      // Serialize one user's submissions so the cap cannot be raced past.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'program-submit:' + actor.userId}))`,
      );
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(programs)
        .where(and(eq(programs.createdByUserId, actor.userId), eq(programs.status, 'pending')));
      if (n >= LIMITS.pendingProgramsPerUser) return { ok: false, tooManyPending: true } as const;
    }
    const now = new Date();
    const [program] = await tx
      .insert(programs)
      .values({
        ...value,
        createdByUserId: actor.userId,
        status: actor.isAdmin ? 'approved' : 'pending',
        reviewedByUserId: actor.isAdmin ? actor.userId : null,
        reviewedAt: actor.isAdmin ? now : null,
      })
      .returning();
    await tx.insert(programEvents).values({
      programId: program.id,
      kind: actor.isAdmin ? 'approved' : 'submitted',
      actorUserId: actor.userId,
    });
    return { ok: true, program } as const;
  });
}

export type ProgramListItem = typeof programs.$inferSelect & {
  registered: number;
  /** null for open access. */
  spotsLeft: number | null;
  isRegistered: boolean;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Upcoming and in-progress programs (ended ones are hidden), soonest first. The text matches title,
 * organizer, location or topics; the category filter is combined with it (AND).
 */
export async function listPrograms(
  db: AppDb,
  opts: { q?: string; category?: string; userId?: string; now?: Date } = {},
): Promise<ProgramListItem[]> {
  const now = opts.now ?? new Date();
  const conditions = [gte(programs.endsAt, now), eq(programs.status, 'approved')];
  const category = PROGRAM_CATEGORIES.find((c) => c === opts.category);
  if (category) conditions.push(eq(programs.category, category));
  const q = (opts.q ?? '').trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      or(
        ilike(programs.title, pattern),
        ilike(programs.organizer, pattern),
        ilike(programs.location, pattern),
        ilike(programs.topics, pattern),
      )!,
    );
  }

  const registeredCount =
    sql<number>`count(${programRegistrations.id}) filter (where ${programRegistrations.cancelledAt} is null)`.mapWith(
      Number,
    );
  const rows = await db
    .select({ program: programs, registered: registeredCount })
    .from(programs)
    .leftJoin(programRegistrations, eq(programRegistrations.programId, programs.id))
    .where(and(...conditions))
    .groupBy(programs.id)
    .orderBy(asc(programs.startsAt));

  let mine = new Set<string>();
  if (opts.userId) {
    const regs = await db
      .select({ programId: programRegistrations.programId })
      .from(programRegistrations)
      .where(
        and(eq(programRegistrations.userId, opts.userId), isNull(programRegistrations.cancelledAt)),
      );
    mine = new Set(regs.map((r) => r.programId));
  }

  return rows.map(({ program, registered }) => ({
    ...program,
    registered,
    spotsLeft: program.capacity === null ? null : Math.max(program.capacity - registered, 0),
    isRegistered: mine.has(program.id),
  }));
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_open' | 'full' | 'already_registered' | 'ended' };

/** One active registration per person per program. Capacity is enforced under a row lock. */
export async function registerForProgram(
  db: AppDb,
  userId: string,
  programId: string,
  now: Date = new Date(),
): Promise<RegisterResult> {
  return db.transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, programId))
      .for('update')
      .limit(1);
    if (!program) return { ok: false, reason: 'not_found' } as const;
    if (program.status !== 'approved') return { ok: false, reason: 'not_open' } as const;
    if (program.endsAt < now) return { ok: false, reason: 'ended' } as const;

    const [existing] = await tx
      .select()
      .from(programRegistrations)
      .where(
        and(eq(programRegistrations.programId, programId), eq(programRegistrations.userId, userId)),
      )
      .limit(1);
    if (existing && existing.cancelledAt === null)
      return { ok: false, reason: 'already_registered' } as const;

    if (program.capacity !== null) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(programRegistrations)
        .where(
          and(
            eq(programRegistrations.programId, programId),
            isNull(programRegistrations.cancelledAt),
          ),
        );
      if (n >= program.capacity) return { ok: false, reason: 'full' } as const;
    }

    if (existing) {
      await tx
        .update(programRegistrations)
        .set({ cancelledAt: null })
        .where(eq(programRegistrations.id, existing.id));
    } else {
      await tx.insert(programRegistrations).values({ programId, userId });
    }
    return { ok: true } as const;
  });
}

/** Cancelling keeps the row and sets cancelled_at (nothing is deleted). */
export async function cancelRegistration(
  db: AppDb,
  userId: string,
  programId: string,
): Promise<{ ok: boolean }> {
  const updated = await db
    .update(programRegistrations)
    .set({ cancelledAt: new Date() })
    .where(
      and(
        eq(programRegistrations.programId, programId),
        eq(programRegistrations.userId, userId),
        isNull(programRegistrations.cancelledAt),
      ),
    )
    .returning({ id: programRegistrations.id });
  return { ok: updated.length > 0 };
}

const registeredCountSql =
  sql<number>`count(${programRegistrations.id}) filter (where ${programRegistrations.cancelledAt} is null)`.mapWith(
    Number,
  );

export type MyProgram = typeof programs.$inferSelect & { registered: number };

/** Every program the user created, in any status, newest first. */
export async function listMyPrograms(db: AppDb, userId: string): Promise<MyProgram[]> {
  const rows = await db
    .select({ program: programs, registered: registeredCountSql })
    .from(programs)
    .leftJoin(programRegistrations, eq(programRegistrations.programId, programs.id))
    .where(eq(programs.createdByUserId, userId))
    .groupBy(programs.id)
    .orderBy(desc(programs.createdAt));
  return rows.map(({ program, registered }) => ({ ...program, registered }));
}

/** Every program in every status with its active registration count (admin view). */
export async function listAllPrograms(db: AppDb): Promise<MyProgram[]> {
  const rows = await db
    .select({ program: programs, registered: registeredCountSql })
    .from(programs)
    .leftJoin(programRegistrations, eq(programRegistrations.programId, programs.id))
    .groupBy(programs.id)
    .orderBy(desc(programs.createdAt));
  return rows.map(({ program, registered }) => ({ ...program, registered }));
}

/** Pending programs, oldest first (the review queue). */
export async function listPendingPrograms(db: AppDb) {
  return db
    .select()
    .from(programs)
    .where(eq(programs.status, 'pending'))
    .orderBy(asc(programs.createdAt));
}

export type ReviewResult =
  | { ok: true; program: typeof programs.$inferSelect }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'not_pending' | 'invalid' };

async function review(
  db: AppDb,
  actorIn: ProgramActor,
  id: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<ReviewResult> {
  const actor = normActor(actorIn);
  if (!actor.isAdmin) return { ok: false, reason: 'forbidden' };
  let cleanReason: string | null = null;
  if (decision === 'rejected') {
    cleanReason = (reason ?? '').trim();
    if (cleanReason.length < 3 || cleanReason.length > 500) return { ok: false, reason: 'invalid' };
  }
  return db.transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, id))
      .for('update')
      .limit(1);
    if (!program) return { ok: false, reason: 'not_found' } as const;
    if (program.status !== 'pending') return { ok: false, reason: 'not_pending' } as const;
    const now = new Date();
    const [updated] = await tx
      .update(programs)
      .set({
        status: decision,
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        rejectionReason: cleanReason,
        updatedAt: now,
      })
      .where(eq(programs.id, id))
      .returning();
    await tx.insert(programEvents).values({
      programId: id,
      kind: decision === 'approved' ? 'approved' : 'rejected',
      actorUserId: actor.userId,
      reason: cleanReason,
    });
    return { ok: true, program: updated } as const;
  });
}

export const approveProgram = (db: AppDb, actor: ProgramActor, id: string) =>
  review(db, actor, id, 'approved');

export const rejectProgram = (db: AppDb, actor: ProgramActor, id: string, reason: string) =>
  review(db, actor, id, 'rejected', reason);

export type EditResult =
  | { ok: true; program: typeof programs.$inferSelect; changes: Record<string, unknown> }
  | {
      ok: false;
      reason:
        'forbidden' | 'not_found' | 'cancelled' | 'capacity_below_registered' | 'too_many_pending';
    }
  | { ok: false; reason: 'invalid'; fields: FieldErrors<keyof ProgramInput> };

const EDITABLE = [
  'title',
  'category',
  'organizer',
  'location',
  'topics',
  'startsAt',
  'endsAt',
  'capacity',
] as const;

/** Admin or host. Applies at once and logs {field:{from,to}}. */
export async function editProgram(
  db: AppDb,
  actorIn: ProgramActor,
  id: string,
  input: ProgramInput,
): Promise<EditResult> {
  const actor = normActor(actorIn);
  const { value, errors } = cleanProgram(input);
  return db.transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, id))
      .for('update')
      .limit(1);
    if (!program) return { ok: false, reason: 'not_found' } as const;
    if (!canManageProgram(actor, program)) return { ok: false, reason: 'forbidden' } as const;
    if (!value) return { ok: false, reason: 'invalid', fields: errors } as const;
    if (program.status === 'cancelled' && !actor.isAdmin)
      return { ok: false, reason: 'cancelled' } as const;

    if (value.capacity !== null) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(programRegistrations)
        .where(
          and(eq(programRegistrations.programId, id), isNull(programRegistrations.cancelledAt)),
        );
      if (value.capacity < n) return { ok: false, reason: 'capacity_below_registered' } as const;
    }

    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null));
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of EDITABLE) {
      const from = norm(program[f]);
      const to = norm(value[f]);
      if (from !== to) changes[f] = { from, to };
    }
    if (Object.keys(changes).length === 0) return { ok: true, program, changes } as const;

    const resubmit = program.status === 'rejected' && !actor.isAdmin;
    if (resubmit) {
      // Re-submitting puts it back in the queue, so the same cap as a new submission applies.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'program-submit:' + actor.userId}))`,
      );
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(programs)
        .where(and(eq(programs.createdByUserId, actor.userId), eq(programs.status, 'pending')));
      if (n >= LIMITS.pendingProgramsPerUser)
        return { ok: false, reason: 'too_many_pending' } as const;
    }
    const now = new Date();
    const [updated] = await tx
      .update(programs)
      .set({
        ...value,
        updatedAt: now,
        ...(resubmit ? { status: 'pending' as const, rejectionReason: null } : {}),
      })
      .where(eq(programs.id, id))
      .returning();
    await tx.insert(programEvents).values({
      programId: id,
      kind: 'edited',
      actorUserId: actor.userId,
      changes,
    });
    if (resubmit)
      await tx
        .insert(programEvents)
        .values({ programId: id, kind: 'submitted', actorUserId: actor.userId });
    return { ok: true, program: updated, changes } as const;
  });
}

export type CancelProgramResult =
  { ok: true } | { ok: false; reason: 'forbidden' | 'not_found' | 'already_cancelled' };

/** Admin or host. Sets status 'cancelled'; registrations stay as rows. */
export async function cancelProgram(
  db: AppDb,
  actorIn: ProgramActor,
  id: string,
  reason?: string,
): Promise<CancelProgramResult> {
  const actor = normActor(actorIn);
  return db.transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, id))
      .for('update')
      .limit(1);
    if (!program) return { ok: false, reason: 'not_found' } as const;
    if (!canManageProgram(actor, program)) return { ok: false, reason: 'forbidden' } as const;
    if (program.status === 'cancelled') return { ok: false, reason: 'already_cancelled' } as const;
    await tx
      .update(programs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(programs.id, id));
    await tx.insert(programEvents).values({
      programId: id,
      kind: 'cancelled',
      actorUserId: actor.userId,
      reason: reason?.trim() || null,
    });
    return { ok: true } as const;
  });
}

/** Admin only: active registrations, oldest first. */
export async function listAttendees(
  db: AppDb,
  actorIn: ProgramActor,
  programId: string,
): Promise<
  | { ok: true; attendees: { userId: string; registeredAt: Date }[] }
  | { ok: false; reason: 'forbidden' }
> {
  if (!normActor(actorIn).isAdmin) return { ok: false, reason: 'forbidden' };
  const rows = await db
    .select({ userId: programRegistrations.userId, registeredAt: programRegistrations.createdAt })
    .from(programRegistrations)
    .where(
      and(eq(programRegistrations.programId, programId), isNull(programRegistrations.cancelledAt)),
    )
    .orderBy(asc(programRegistrations.createdAt));
  return { ok: true, attendees: rows };
}

/** Newest first. */
export async function programHistory(db: AppDb, programId: string) {
  return db
    .select()
    .from(programEvents)
    .where(eq(programEvents.programId, programId))
    .orderBy(desc(programEvents.createdAt));
}

/** Admin feed of recent host/admin edits with the program title. */
export async function listRecentProgramEdits(db: AppDb, limit = 20) {
  return db
    .select({
      id: programEvents.id,
      programId: programEvents.programId,
      title: programs.title,
      actorUserId: programEvents.actorUserId,
      changes: programEvents.changes,
      createdAt: programEvents.createdAt,
    })
    .from(programEvents)
    .innerJoin(programs, eq(programs.id, programEvents.programId))
    .where(eq(programEvents.kind, 'edited'))
    .orderBy(desc(programEvents.createdAt))
    .limit(limit);
}
