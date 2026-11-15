import { auth } from '@clerk/nextjs/server';
import {
  cellKey,
  getFreshClimatology,
  putClimatology,
  type CacheDb,
  type ClimatologyInput,
} from '@/core/flood/climatologyCache';
import { fitGumbel, hydrologicalYearMaxima, returnLevels, returnPeriodRange } from '@/model/gumbel';
import {
  FloodApiError,
  floodEnsembleUrl,
  floodUrl,
  haversineKm,
  neighbourCoordinates,
  parseEnsembleResponse,
  parseFloodResponse,
  pickRiverCell,
  type EnsembleBand,
} from '@/model/openMeteo';
import { classifyDischarge } from '@/model/severity';
import { FLOOD_ATTRIBUTION, type FloodResponse, type Severity } from '@/model/types';

const HISTORY_START = '1984-01-01';
const FORECAST_DAYS = 16;
const SERIES_LENGTH = 120;
const FLOOD_TIMEOUT_MS = 8000;
const PLACE_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ENSEMBLE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;
const SNAP_WARN_KM = 3;
const SMALL_RIVER_M3S = 10;
const MEDIUM_RIVER_M3S = 100;
const MIN_HISTORY_YEARS = 10;
const RANGE_CAP_YEARS = 1000;
const PAST_DAYS = SERIES_LENGTH - FORECAST_DAYS;
const DB_TIMEOUT_MS = 1500;
const DB_BACKOFF_MS = 60_000;
const USER_AGENT = 'flood-desk-hackathon/1.0 (educational demo)';

type Cells = ReturnType<typeof parseFloodResponse>;
type Cell = Cells[number];

/** Small in-memory TTL cache, bounded so a long-running server cannot grow without limit. */
function makeCache<T>(ttlMs = CACHE_TTL_MS) {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      store.delete(key);
      store.set(key, { at: Date.now(), value });
      while (store.size > CACHE_MAX) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
  };
}

const historyCache = makeCache<Located>();
const placeCache = makeCache<string>();
const ensembleCache = makeCache<EnsembleBand>(ENSEMBLE_TTL_MS);
const cellCache = makeCache<Cell>(ENSEMBLE_TTL_MS);

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseCoordinate(value: string | null, limit: number): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function json(body: unknown, status: number, cache = 'private, no-store') {
  return Response.json(body, { status, headers: { 'cache-control': cache } });
}

async function lookupPlace(lat: number, lng: number): Promise<string | undefined> {
  const key = `${round2(lat)},${round2(lng)}`;
  const cached = placeCache.get(key);
  if (cached) return cached;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '10');
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(PLACE_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { name?: string; display_name?: string };
    const name = body.name || body.display_name;
    if (typeof name !== 'string' || !name) return undefined;
    placeCache.set(key, name);
    return name;
  } catch {
    return undefined;
  }
}

let cacheDownUntil = 0;

/**
 * Run a climatology-cache query. The cache is an optimisation only: with no DATABASE_URL, a
 * missing table (migration not applied), a slow or failing database, this returns null and the
 * route carries on with the full history fetch. After a failure it stays off for a minute.
 */
async function withCacheDb<T>(fn: (db: CacheDb) => Promise<T>): Promise<T | null> {
  if (!process.env.DATABASE_URL || Date.now() < cacheDownUntil) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { getDb } = await import('@/db');
    const db = getDb() as unknown as CacheDb;
    return await Promise.race([
      fn(db),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('cache timeout')), DB_TIMEOUT_MS);
      }),
    ]);
  } catch {
    cacheDownUntil = Date.now() + DB_BACKOFF_MS;
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assertFloodOk(res: Response) {
  if (res.status === 429) {
    throw new FloodApiError(
      'The free flood data service is rate-limited right now. Try again in a few minutes, or open the demo.',
    );
  }
  if (!res.ok) throw new Error('Flood data service unavailable');
}

/** One cell, recent days plus forecast: all a cache hit needs (history comes from the database). */
async function loadCell(lat: number, lng: number): Promise<Cell> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cellCache.get(key);
  if (cached) return cached;
  const res = await fetch(
    floodUrl({ lat, lng, pastDays: PAST_DAYS, forecastDays: FORECAST_DAYS }),
    {
      signal: AbortSignal.timeout(FLOOD_TIMEOUT_MS),
    },
  );
  assertFloodOk(res);
  const [cell] = parseFloodResponse(await res.json());
  if (!cell) throw new Error('Flood data service unavailable');
  cellCache.set(key, cell);
  return cell;
}

type Located = { picked: Cell | null; emptyCells: number };

/**
 * Find the river, then fetch its full history. A short look at the 9 nearby cells (60 days) picks
 * the river; only that one cell then asks for 1984-to-now. This keeps the call far below
 * Open-Meteo's free limit compared with 9 cells of full history.
 */
async function loadHistory(lat: number, lng: number, end: string): Promise<Located> {
  // Fetch around the rounded point so the cache key and the cells always agree.
  const key = `${round2(lat)},${round2(lng)}`;
  const cached = historyCache.get(key);
  if (cached) return cached;
  const around = neighbourCoordinates(round2(lat), round2(lng));
  const look = await fetch(
    floodUrl({
      lat: around.map((c) => c.lat),
      lng: around.map((c) => c.lng),
      pastDays: 60,
      forecastDays: 1,
    }),
    { signal: AbortSignal.timeout(FLOOD_TIMEOUT_MS) },
  );
  assertFloodOk(look);
  const nearby = parseFloodResponse(await look.json());
  const emptyCells = nearby.filter((c) => !(meanOf(c.discharge) > 0)).length;
  const chosen = pickRiverCell(
    nearby.map((c) => ({ ...c })),
    { lat, lng },
  );
  if (!chosen) {
    const none: Located = { picked: null, emptyCells };
    historyCache.set(key, none);
    return none;
  }
  const full = await fetch(
    floodUrl({ lat: chosen.lat, lng: chosen.lng, startDate: HISTORY_START, endDate: end }),
    { signal: AbortSignal.timeout(FLOOD_TIMEOUT_MS) },
  );
  assertFloodOk(full);
  let picked: Cell = chosen;
  try {
    // An unreadable history reply degrades to the short window (severity may be unknown).
    const [history] = parseFloodResponse(await full.json());
    if (history) picked = history;
  } catch {
    // keep the 60-day cell
  }
  const result: Located = { picked, emptyCells };
  historyCache.set(key, result);
  return result;
}

/** Forecast spread for the chosen cell. Any failure just means no band (undefined). */
async function loadEnsemble(lat: number, lng: number): Promise<EnsembleBand | undefined> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = ensembleCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(floodEnsembleUrl({ lat, lng, forecastDays: FORECAST_DAYS }), {
      signal: AbortSignal.timeout(FLOOD_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const band = parseEnsembleResponse(await res.json());
    if (!band) return undefined;
    const trimmed: EnsembleBand = {
      days: band.days.slice(0, FORECAST_DAYS),
      min: band.min.slice(0, FORECAST_DAYS),
      p25: band.p25.slice(0, FORECAST_DAYS),
      median: band.median.slice(0, FORECAST_DAYS),
      p75: band.p75.slice(0, FORECAST_DAYS),
      max: band.max.slice(0, FORECAST_DAYS),
    };
    ensembleCache.set(key, trimmed);
    return trimmed;
  } catch {
    return undefined;
  }
}

function meanOf(values: (number | null)[]): number {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  return count === 0 ? 0 : sum / count;
}

const RANK: Record<Severity, number> = { unknown: -1, normal: 0, watch: 1, warning: 2, severe: 3 };

/** The worse of two severities; unknown only when both are unknown. */
function worse(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function noRiverBody(lat: number, lng: number): FloodResponse {
  return {
    snapped: { lat, lng },
    snapDistanceKm: 0,
    noRiver: true,
    series: { days: [], discharge: [] },
    climatology: { years: 0, q2: null, fit: null, returnLevels: [] },
    current: {
      discharge: null,
      returnPeriod: null,
      capped: false,
      severity: 'unknown',
      dischargeDate: null,
      peakDate: null,
      peakDischarge: null,
    },
    forecast: {
      peakDischarge: null,
      peakDate: null,
      daysAhead: null,
      returnPeriod: null,
      capped: false,
      severity: 'unknown',
    },
    caveats: [
      'No river flow was found near this point (open sea, desert, a lake or a very small stream). Try clicking on a larger river.',
    ],
    attribution: FLOOD_ATTRIBUTION,
  };
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: 'Sign in required' }, 401);

  const params = new URL(request.url).searchParams;
  const lat = parseCoordinate(params.get('lat'), 90);
  const lng = parseCoordinate(params.get('lng'), 180);
  if (lat === null || lng === null)
    return json({ error: 'lat and lng must be valid coordinates' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + FORECAST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const key = cellKey(lat, lng);
  const stored = await withCacheDb((db) => getFreshClimatology(db, key));
  if (stored?.noRiver) return json(noRiverBody(lat, lng), 200, 'private, max-age=300');
  const hit =
    stored && stored.pickedLat !== null && stored.pickedLng !== null
      ? { ...stored, pickedLat: stored.pickedLat, pickedLng: stored.pickedLng }
      : null;

  // Flood data first (so it is the first fetch started), place name in parallel. On a cache hit
  // only the chosen cell is fetched; the 1984-to-now history comes from the database.
  const dataPromise: Promise<Cell | Located> = hit
    ? loadCell(hit.pickedLat, hit.pickedLng)
    : loadHistory(lat, lng, end);
  const placePromise = lookupPlace(lat, lng);

  let data: Cell | Located;
  try {
    data = await dataPromise;
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const reason =
      err instanceof FloodApiError
        ? err.message
        : timedOut
          ? 'Flood data service timed out'
          : 'Flood data service unavailable';
    return json({ error: reason }, 502);
  }

  let river: { lat: number; lng: number };
  let days: string[];
  let discharge: (number | null)[];
  let maxima: number[];
  let meanFlow: number;
  let emptyCells: number;
  // History only (the forecast must not shape the climatology).
  let pastCount: number;

  if (hit) {
    const cell = data as Cell;
    river = { lat: cell.lat, lng: cell.lng };
    ({ days, discharge } = cell);
    pastCount = days.filter((d) => d <= today).length;
    maxima = hit.annualMaxima;
    meanFlow = hit.meanDischarge ?? 0;
    emptyCells = hit.neighbourEmptyCount;
  } else {
    const located = data as Located;
    const picked = located.picked;
    if (!picked) {
      void withCacheDb((db) =>
        putClimatology(db, {
          cellKey: key,
          pickedLat: null,
          pickedLng: null,
          noRiver: true,
          meanDischarge: null,
          neighbourEmptyCount: 0,
          annualMaxima: [],
          years: 0,
          historyStart: HISTORY_START,
          historyEnd: today,
        }),
      );
      return json(noRiverBody(lat, lng), 200, 'private, max-age=300');
    }
    river = { lat: picked.lat, lng: picked.lng };
    ({ days, discharge } = picked);
    pastCount = days.filter((d) => d <= today).length;
    // Hydrological years (a wet season is never split at 1 January), newest partial year excluded.
    maxima = hydrologicalYearMaxima(days.slice(0, pastCount), discharge.slice(0, pastCount));
    meanFlow = meanOf(discharge.slice(0, pastCount));
    emptyCells = located.emptyCells;
    const row: ClimatologyInput = {
      cellKey: key,
      pickedLat: river.lat,
      pickedLng: river.lng,
      noRiver: false,
      meanDischarge: meanFlow,
      neighbourEmptyCount: emptyCells,
      annualMaxima: maxima,
      years: maxima.length,
      historyStart: HISTORY_START,
      historyEnd: today,
    };
    void withCacheDb((db) => putClimatology(db, row));
  }

  const tailDays = days.slice(-SERIES_LENGTH);
  const tailValues = discharge.slice(-SERIES_LENGTH);

  let current: number | null = null;
  let dischargeDate: string | null = null;
  for (let i = pastCount - 1; i >= 0; i -= 1) {
    const v = discharge[i];
    if (v !== null && Number.isFinite(v)) {
      current = v;
      dischargeDate = days[i];
      break;
    }
  }

  // Forecast peak: only days strictly after today, never a past date.
  let peakDate: string | null = null;
  let peakDischarge: number | null = null;
  for (let i = pastCount; i < days.length; i += 1) {
    const v = discharge[i];
    if (
      days[i] > today &&
      v !== null &&
      Number.isFinite(v) &&
      (peakDischarge === null || v > peakDischarge)
    ) {
      peakDischarge = v;
      peakDate = days[i];
    }
  }

  const classified = current === null ? null : classifyDischarge(current, maxima);
  const forecastClass = peakDischarge === null ? null : classifyDischarge(peakDischarge, maxima);
  const todaySeverity: Severity = classified?.severity ?? 'unknown';
  const forecastSeverity: Severity = forecastClass?.severity ?? 'unknown';
  const ensemblePromise = loadEnsemble(river.lat, river.lng);
  const [place, ensemble] = await Promise.all([placePromise, ensemblePromise]);

  const fit = fitGumbel(maxima);
  const driving = Math.max(current ?? 0, peakDischarge ?? 0);
  const rawRange = driving > 0 ? returnPeriodRange(driving, maxima) : null;
  const range = rawRange
    ? {
        low: Math.min(rawRange.low, RANGE_CAP_YEARS),
        high: Math.min(rawRange.high, RANGE_CAP_YEARS),
      }
    : undefined;

  const snapDistanceKm =
    Math.round(haversineKm({ lat, lng }, { lat: river.lat, lng: river.lng }) * 10) / 10;
  const caveats: string[] = [];
  if (snapDistanceKm > SNAP_WARN_KM)
    caveats.push(
      `The river data comes from a point ${snapDistanceKm} km from your click. Check that it is the river you meant.`,
    );
  if (meanFlow < SMALL_RIVER_M3S)
    caveats.push(
      'This is a very small flow (under 10 m3/s on average). The model is unreliable for small rivers.',
    );
  else if (meanFlow < MEDIUM_RIVER_M3S)
    caveats.push(
      'The model uses daily average flow on a grid of about 5 km, so it can understate floods on small or fast-rising rivers.',
    );
  if (emptyCells >= 3)
    caveats.push(
      'Several nearby cells have no river flow (coast, lake or dry land). Tides and storm surge are not modelled.',
    );
  if (maxima.length < MIN_HISTORY_YEARS)
    caveats.push('There is not enough river history to rate how unusual this flow is.');

  const body: FloodResponse = {
    snapped: { lat: river.lat, lng: river.lng },
    snapDistanceKm,
    noRiver: false,
    series: { days: tailDays, discharge: tailValues },
    climatology: {
      years: maxima.length,
      q2: classified?.q2 ?? null,
      fit,
      returnLevels: returnLevels(fit),
      ...(range ? { returnPeriodRange: range } : {}),
    },
    current: {
      discharge: current,
      returnPeriod: classified?.returnPeriod ?? null,
      capped: classified?.capped ?? false,
      severity: worse(todaySeverity, forecastSeverity),
      dischargeDate,
      peakDate,
      peakDischarge,
    },
    forecast: {
      peakDischarge,
      peakDate,
      daysAhead: peakDate ? daysBetween(today, peakDate) : null,
      returnPeriod: forecastClass?.returnPeriod ?? null,
      capped: forecastClass?.capped ?? false,
      severity: forecastSeverity,
      ...(ensemble ? { ensemble } : {}),
    },
    caveats,
    ...(place ? { place } : {}),
    attribution: FLOOD_ATTRIBUTION,
  };
  return json(body, 200, 'private, max-age=300');
}
