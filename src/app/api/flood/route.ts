import { auth } from '@clerk/nextjs/server';
import { annualMaxima, fitGumbel } from '@/model/gumbel';
import {
  FloodApiError,
  floodUrl,
  neighbourCoordinates,
  parseFloodResponse,
  pickRiverCell,
} from '@/model/openMeteo';
import { classifyDischarge } from '@/model/severity';
import { FLOOD_ATTRIBUTION, type FloodResponse, type Severity } from '@/model/types';

const HISTORY_START = '1984-01-01';
const FORECAST_DAYS = 16;
const SERIES_LENGTH = 120;
const FLOOD_TIMEOUT_MS = 8000;
const PLACE_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const USER_AGENT = 'flood-desk-hackathon/1.0 (educational demo)';

type Cells = ReturnType<typeof parseFloodResponse>;

/** Small in-memory TTL cache, bounded so a long-running server cannot grow without limit. */
function makeCache<T>() {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > CACHE_TTL_MS) {
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

const historyCache = makeCache<Cells>();
const placeCache = makeCache<string>();

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

async function loadHistory(lat: number, lng: number, end: string): Promise<Cells> {
  // Fetch around the rounded point so the cache key and the cells always agree.
  const key = `${round2(lat)},${round2(lng)}`;
  const cached = historyCache.get(key);
  if (cached) return cached;
  const around = neighbourCoordinates(round2(lat), round2(lng));
  const res = await fetch(
    floodUrl({
      lat: around.map((c) => c.lat),
      lng: around.map((c) => c.lng),
      startDate: HISTORY_START,
      endDate: end,
    }),
    { signal: AbortSignal.timeout(FLOOD_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error('Flood data service unavailable');
  const cells = parseFloodResponse(await res.json());
  historyCache.set(key, cells);
  return cells;
}

const RANK: Record<Severity, number> = { unknown: -1, normal: 0, watch: 1, warning: 2, severe: 3 };

/** The worse of two severities; unknown only when both are unknown. */
function worse(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
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
  // Flood data first (so it is the first fetch started), place name in parallel.
  const historyPromise = loadHistory(lat, lng, end);
  const placePromise = lookupPlace(lat, lng);

  let cells: Cells;
  try {
    cells = await historyPromise;
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

  const river = pickRiverCell(
    cells.map((c) => ({ ...c })),
    { lat, lng },
  );
  if (!river) {
    const body: FloodResponse = {
      snapped: { lat, lng },
      noRiver: true,
      series: { days: [], discharge: [] },
      climatology: { years: 0, q2: null, fit: null },
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
      attribution: FLOOD_ATTRIBUTION,
    };
    return json(body, 200, 'private, max-age=300');
  }

  const { days, discharge } = river as unknown as { days: string[]; discharge: (number | null)[] };

  // History only (the forecast must not shape the climatology).
  const pastCount = days.filter((d) => d <= today).length;
  const maxima = annualMaxima(days.slice(0, pastCount), discharge.slice(0, pastCount));

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
  const place = await placePromise;

  const body: FloodResponse = {
    snapped: { lat: river.lat, lng: river.lng },
    noRiver: false,
    series: { days: tailDays, discharge: tailValues },
    climatology: { years: maxima.length, q2: classified?.q2 ?? null, fit: fitGumbel(maxima) },
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
    },
    ...(place ? { place } : {}),
    attribution: FLOOD_ATTRIBUTION,
  };
  return json(body, 200, 'private, max-age=300');
}
