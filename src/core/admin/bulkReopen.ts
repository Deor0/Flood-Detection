import { and, asc, eq, gte, type SQL } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons } from '@/db/schema';
import { reopenMissing, type Actor } from '@/core/missing/service';

/**
 * Moderation tool for a false "found" spree: re-open every record marked found by one actor (a
 * Clerk user id or an E.164 phone) since a given time. Each record goes through the normal
 * `reopenMissing`, so each gets its own `reopened` event with the reason. Nothing is deleted.
 */

export type FoundByFilter = { foundBy: string; since: Date };

export type BulkPreviewItem = { id: string; name: string; publicNumber: number; foundAt: Date };

export type BulkReopenResult =
  | { ok: true; reopened: BulkPreviewItem[] }
  | { ok: false; reason: 'forbidden' | 'invalid' | 'nothing_to_reopen' };

function where(f: FoundByFilter): SQL | undefined {
  const who = f.foundBy.trim();
  return and(
    eq(missingPersons.status, 'found'),
    who.startsWith('+')
      ? eq(missingPersons.foundByPhone, who)
      : eq(missingPersons.foundByUserId, who),
    gte(missingPersons.foundAt, f.since),
  );
}

export function validFilter(f: { foundBy: string; since: Date }): boolean {
  const who = f.foundBy.trim();
  return (
    who.length >= 3 &&
    who.length <= 100 &&
    (/^user_[A-Za-z0-9]+$/.test(who) || /^\+[1-9]\d{6,14}$/.test(who)) &&
    !Number.isNaN(f.since.getTime())
  );
}

/** What a bulk re-open would touch. Read-only. */
export async function previewFoundBy(db: AppDb, f: FoundByFilter): Promise<BulkPreviewItem[]> {
  if (!validFilter(f)) return [];
  const rows = await db
    .select({
      id: missingPersons.id,
      name: missingPersons.name,
      publicNumber: missingPersons.publicNumber,
      foundAt: missingPersons.foundAt,
    })
    .from(missingPersons)
    .where(where(f))
    .orderBy(asc(missingPersons.foundAt));
  return rows.map((r) => ({ ...r, foundAt: r.foundAt as Date }));
}

/** Re-opens all matches in one transaction: either every record is re-opened, or none is. */
export async function bulkReopenFoundBy(
  db: AppDb,
  actor: Actor,
  f: FoundByFilter & { reason: string },
): Promise<BulkReopenResult> {
  if (!actor.isAdmin) return { ok: false, reason: 'forbidden' };
  const why = f.reason.trim();
  if (!validFilter(f) || why.length < 3 || why.length > 480)
    return { ok: false, reason: 'invalid' };
  return db.transaction(async (tx) => {
    const targets = await previewFoundBy(tx as unknown as AppDb, f);
    if (targets.length === 0) return { ok: false, reason: 'nothing_to_reopen' } as const;
    for (const t of targets) {
      const r = await reopenMissing(tx as unknown as AppDb, actor, t.id, `Bulk re-open: ${why}`);
      // Anything but success aborts the whole batch (rolled back), so no half-done state remains.
      if (!r.ok) throw new Error(`bulk re-open stopped at ${t.id}: ${r.reason}`);
    }
    return { ok: true, reopened: targets } as const;
  });
}
