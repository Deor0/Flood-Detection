import { and, desc, ilike, or, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons } from '@/db/schema';
import { normalizeName, publicId } from './names';

/** The only fields a signed-out visitor may ever see. */
export type PublicPerson = {
  publicId: string;
  name: string;
  status: 'missing' | 'found';
  region: string | null;
};

export const PUBLIC_SEARCH_MIN_CHARS = 2;
export const PUBLIC_SEARCH_LIMIT = 20;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** "A. Sharma" -> initials only, used for anyone under 18. */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => `${Array.from(part)[0].toUpperCase()}.`);
  return letters.join(' ') || '?';
}

/** Coarse place only: the part after the last comma, or the first 24 characters. */
export function coarseRegion(lastSeen: string | null): string | null {
  const text = lastSeen?.trim();
  if (!text) return null;
  const afterComma = text.includes(',') ? text.slice(text.lastIndexOf(',') + 1).trim() : '';
  const region = afterComma || text;
  return region.length > 24 ? `${region.slice(0, 24).trimEnd()}…` : region;
}

/**
 * Read-only, status-only search for signed-out visitors. Returns nothing for fewer than 2
 * characters (never lists the registry) and never selects age, notes, contact, found note or
 * coordinates into the result; age is read only to mask minors.
 */
export async function publicSearch(db: AppDb, query: string): Promise<PublicPerson[]> {
  const normalized = normalizeName(query);
  if (Array.from(normalized.replace(/\s/g, '')).length < PUBLIC_SEARCH_MIN_CHARS) return [];
  const tokens = normalized.split(' ').filter(Boolean).slice(0, 5);
  const compact = sql`replace(${missingPersons.nameNormalized}, ' ', '')`;
  const rows = await db
    .select({
      publicNumber: missingPersons.publicNumber,
      name: missingPersons.name,
      age: missingPersons.age,
      status: missingPersons.status,
      lastSeenLocation: missingPersons.lastSeenLocation,
    })
    .from(missingPersons)
    .where(
      and(
        ...tokens.map((t) =>
          or(
            ilike(missingPersons.nameNormalized, `%${escapeLike(t)}%`),
            sql`${compact} ilike ${`%${escapeLike(t)}%`}`,
          ),
        ),
      ),
    )
    .orderBy(desc(missingPersons.updatedAt))
    .limit(PUBLIC_SEARCH_LIMIT);

  return rows.map((row) => ({
    publicId: publicId(row.publicNumber),
    name: row.age !== null && row.age < 18 ? initials(row.name) : row.name,
    status: row.status,
    region: coarseRegion(row.lastSeenLocation),
  }));
}
