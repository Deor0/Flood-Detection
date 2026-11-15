import { desc } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons } from '@/db/schema';
import { foldName, fuzzyScore, publicId, wordsClose } from './names';
import { coarseRegion } from './publicSearch';

/**
 * Fuzzy matching runs in TypeScript over the most recently updated records (no pg_trgm). The
 * registry is small; this bound keeps the work fixed if it grows.
 */
export const FUZZY_CANDIDATE_LIMIT = 2000;

type Candidate = {
  id: string;
  publicNumber: number;
  name: string;
  age: number | null;
  status: 'missing' | 'found';
  lastSeenLocation: string | null;
};

async function candidates(db: AppDb): Promise<Candidate[]> {
  return db
    .select({
      id: missingPersons.id,
      publicNumber: missingPersons.publicNumber,
      name: missingPersons.name,
      age: missingPersons.age,
      status: missingPersons.status,
      lastSeenLocation: missingPersons.lastSeenLocation,
    })
    .from(missingPersons)
    .orderBy(desc(missingPersons.updatedAt))
    .limit(FUZZY_CANDIDATE_LIMIT);
}

/**
 * "Did you mean …": names close to the query (one typo, or a spelling variant such as
 * Shrestha/Srestha or Laxmi/Lakshmi), best first, each name once. Children's names are left out
 * unless `includeMinors` (signed-out visitors never get a child's full name).
 */
export async function suggestNames(
  db: AppDb,
  query: string,
  opts: { limit?: number; includeMinors?: boolean } = {},
): Promise<string[]> {
  if (foldName(query).length === 0) return [];
  const scored: { name: string; score: number }[] = [];
  for (const c of await candidates(db)) {
    if (!opts.includeMinors && c.age !== null && c.age < 18) continue;
    const score = fuzzyScore(query, c.name);
    if (score !== null) scored.push({ name: c.name, score });
  }
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { name } of scored) {
    const key = foldName(name).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= (opts.limit ?? 3)) break;
  }
  return out;
}

/** Two places overlap if any word of 3+ letters is the same (allowing a typo or spelling variant). */
export function placesOverlap(a: string | null, b: string | null): boolean {
  const words = (s: string) => foldName(s).filter((w) => Array.from(w).length >= 3);
  const x = words(a ?? '');
  const y = words(b ?? '');
  return x.some((w) => y.some((v) => wordsClose(w, v)));
}

export type LikelyDuplicate = {
  id: string;
  publicId: string;
  name: string;
  status: 'missing' | 'found';
  region: string | null;
  age: number | null;
};

/**
 * Records that are probably the same person as a new report: the same number of name words,
 * each word equal or one typo / spelling variant apart, and either the same area or no place on
 * one side. Ages more than 3 years apart rule a record out. Open records first.
 */
export async function findLikelyDuplicates(
  db: AppDb,
  input: { name: string; lastSeenLocation?: string | null; age?: number | null },
  limit = 3,
): Promise<LikelyDuplicate[]> {
  if (foldName(input.name).length === 0) return [];
  const place = input.lastSeenLocation?.trim() || null;
  const hits: (LikelyDuplicate & { score: number })[] = [];
  for (const c of await candidates(db)) {
    const there = fuzzyScore(input.name, c.name);
    const back = fuzzyScore(c.name, input.name);
    if (there === null || back === null || Math.max(there, back) > 2) continue;
    if (place && c.lastSeenLocation && !placesOverlap(place, c.lastSeenLocation)) continue;
    if (input.age != null && c.age !== null && Math.abs(input.age - c.age) > 3) continue;
    hits.push({
      id: c.id,
      publicId: publicId(c.publicNumber),
      name: c.name,
      status: c.status,
      region: coarseRegion(c.lastSeenLocation),
      age: c.age,
      score: Math.max(there, back) + (c.status === 'found' ? 10 : 0),
    });
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, limit).map((h) => ({
    id: h.id,
    publicId: h.publicId,
    name: h.name,
    status: h.status,
    region: h.region,
    age: h.age,
  }));
}
