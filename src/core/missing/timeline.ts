import { eq } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons } from '@/db/schema';
import { missingHistory, type MissingPerson } from './service';

/** One line of a record's public history: what happened and when, never who or why. */
export type TimelineEntry = { at: Date; label: string; channel: 'web' | 'text' | null };

/**
 * Public wording per event. Reasons, notes, field values and actor ids are never included: they
 * can name people or say where someone is now.
 */
const LABELS: Record<string, string> = {
  reported: 'Reported missing',
  edited: 'Details updated',
  edit_requested: 'Correction suggested',
  edit_rejected: 'Suggestion reviewed and declined',
  found_claimed: 'Reported found by a volunteer — waiting for confirmation',
  found: 'Marked found',
  reopened: 'Re-opened as missing',
};

/** Oldest first, like reading the record from the day it was filed. */
export async function publicTimeline(db: AppDb, id: string): Promise<TimelineEntry[]> {
  const events = await missingHistory(db, id);
  return events
    .slice()
    .reverse()
    .map((e) => {
      const changes = (e.changes ?? {}) as { found?: boolean };
      const label =
        e.kind === 'edit_approved'
          ? changes.found
            ? 'Safe report confirmed'
            : 'Suggested correction approved'
          : (LABELS[e.kind] ?? 'Record updated');
      const channel = e.actorPhone ? 'text' : e.actorUserId ? 'web' : null;
      return { at: e.createdAt, label, channel } as TimelineEntry;
    });
}

export async function getMissingByPublicNumber(
  db: AppDb,
  publicNumber: number,
): Promise<MissingPerson | null> {
  const [row] = await db
    .select()
    .from(missingPersons)
    .where(eq(missingPersons.publicNumber, publicNumber))
    .limit(1);
  return row ?? null;
}
