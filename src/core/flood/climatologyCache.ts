import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { floodClimatology } from '@/db/schema';

export type CacheDb = PgDatabase<PgQueryResultHKT, typeof import('@/db/schema')>;

/** GloFAS cells are 0.05 degrees wide. */
const CELL_DEGREES = 0.05;
/** History does not change, but a new hydrological year can complete: refresh monthly. */
export const CLIMATOLOGY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type Climatology = {
  cellKey: string;
  pickedLat: number | null;
  pickedLng: number | null;
  noRiver: boolean;
  meanDischarge: number | null;
  neighbourEmptyCount: number;
  annualMaxima: number[];
  years: number;
  historyStart: string;
  historyEnd: string;
  updatedAt: Date;
};

export type ClimatologyInput = Omit<Climatology, 'updatedAt'>;

export function cellKey(lat: number, lng: number): string {
  return `${Math.round(lat / CELL_DEGREES)}:${Math.round(lng / CELL_DEGREES)}`;
}

export function isFresh(updatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() <= CLIMATOLOGY_MAX_AGE_MS;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
}

/** The stored row for a cell, whatever its age, or null. */
export async function getClimatology(db: CacheDb, key: string): Promise<Climatology | null> {
  const [row] = await db
    .select()
    .from(floodClimatology)
    .where(eq(floodClimatology.cellKey, key))
    .limit(1);
  if (!row) return null;
  return {
    cellKey: row.cellKey,
    pickedLat: row.pickedLat,
    pickedLng: row.pickedLng,
    noRiver: row.noRiver,
    meanDischarge: row.meanDischarge,
    neighbourEmptyCount: row.neighbourEmptyCount,
    annualMaxima: numbers(row.annualMaxima),
    years: row.years,
    historyStart: row.historyStart,
    historyEnd: row.historyEnd,
    updatedAt: row.updatedAt,
  };
}

/** The stored row only while it is fresh (younger than 30 days). */
export async function getFreshClimatology(
  db: CacheDb,
  key: string,
  now: Date = new Date(),
): Promise<Climatology | null> {
  const row = await getClimatology(db, key);
  return row && isFresh(row.updatedAt, now) ? row : null;
}

/** Insert, or refresh the existing row in place. Nothing is ever deleted. */
export async function putClimatology(db: CacheDb, input: ClimatologyInput): Promise<void> {
  const values = {
    pickedLat: input.pickedLat,
    pickedLng: input.pickedLng,
    noRiver: input.noRiver,
    meanDischarge: input.meanDischarge,
    neighbourEmptyCount: input.neighbourEmptyCount,
    annualMaxima: input.annualMaxima,
    years: input.years,
    historyStart: input.historyStart,
    historyEnd: input.historyEnd,
  };
  await db
    .insert(floodClimatology)
    .values({ cellKey: input.cellKey, ...values })
    .onConflictDoUpdate({
      target: floodClimatology.cellKey,
      set: { ...values, updatedAt: new Date() },
    });
}
