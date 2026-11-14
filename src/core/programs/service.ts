import { and, asc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import {
  PROGRAM_CATEGORIES,
  programRegistrations,
  programs,
  type ProgramCategory,
} from '@/db/schema';

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

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
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
  | { ok: false; fields: FieldErrors<keyof ProgramInput> };

export async function createProgram(
  db: AppDb,
  userId: string,
  input: ProgramInput,
): Promise<CreateProgramResult> {
  const { value, errors } = cleanProgram(input);
  if (!value) return { ok: false, fields: errors };
  const [program] = await db
    .insert(programs)
    .values({ ...value, createdByUserId: userId })
    .returning();
  return { ok: true, program };
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
  const conditions = [gte(programs.endsAt, now)];
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
  { ok: true } | { ok: false; reason: 'not_found' | 'full' | 'already_registered' | 'ended' };

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
