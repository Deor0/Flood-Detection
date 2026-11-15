/**
 * GEOGloWS ECMWF Streamflow (v2): free, keyless, CC BY 4.0. Primary river source.
 *
 * The service works per river reach, not per grid cell:
 * - getriverid: nearest reach to a point (id only; the reach's own position is not returned);
 * - retrospectivedaily: daily simulated flow from 1940 to a few days ago (slow: 10 to 20 s for the
 *   full record, so callers cache it);
 * - forecaststats: 15-day forecast statistics (min, 25th, median, 75th, max) at 1 to 3 hour steps,
 *   with gaps written as empty strings.
 *
 * Every value is a cubic metre per second (m3/s) figure.
 */
import type { EnsembleBand } from '@/model/openMeteo';

export const GEOGLOWS_BASE = 'https://geoglows.ecmwf.int/api/v2';
export const GEOGLOWS_ATTRIBUTION = 'River data: GEOGloWS ECMWF Streamflow (CC BY 4.0)';

export class GeoglowsError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'GeoglowsError';
  }
}

export type DailySeries = { days: string[]; discharge: (number | null)[] };

const FORECAST_KEYS = {
  min: 'flow_min',
  p25: 'flow_25p',
  median: 'flow_med',
  p75: 'flow_75p',
  max: 'flow_max',
} as const;

const numberOrNull = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const dayOf = (iso: unknown): string => (typeof iso === 'string' ? iso.slice(0, 10) : '');

function addDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** GEOGloWS dates are YYYYMMDD in requests. */
export function compactDate(ymd: string): string {
  return ymd.replace(/-/g, '');
}

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET and parse JSON. A short burst limit (429) or a 503 is retried with a growing pause. */
async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new GeoglowsError(timedOut ? 'GEOGloWS timed out' : 'GEOGloWS is unreachable');
    }
    if ((res.status === 429 || res.status === 503) && attempt < RETRY_DELAYS_MS.length) {
      await pause(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!res.ok) throw new GeoglowsError(`GEOGloWS answered ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new GeoglowsError('GEOGloWS sent an unreadable reply');
    }
  }
}

/** The river reach nearest to a point. Throws when the service gives no usable id. */
export async function findReach(lat: number, lng: number): Promise<number> {
  const body = (await getJson(`${GEOGLOWS_BASE}/getriverid?lat=${lat}&lon=${lng}`, 10_000)) as {
    river_id?: unknown;
  } | null;
  const id = Number(body?.river_id);
  if (!Number.isInteger(id) || id <= 0) throw new GeoglowsError('No river reach found');
  return id;
}

/** Parse a retrospectivedaily reply: { "<id>": [flows], datetime: [iso...] }. */
export function parseRetrospective(json: unknown, id: number): DailySeries {
  const o = json as Record<string, unknown> | null;
  const values = o?.[String(id)];
  const times = o?.datetime;
  if (!Array.isArray(values) || !Array.isArray(times)) {
    throw new GeoglowsError('Unexpected river history reply');
  }
  return {
    days: times.map(dayOf),
    discharge: values.map(numberOrNull),
  };
}

export async function fetchHistory(
  id: number,
  startYmd: string,
  endYmd: string,
  timeoutMs = 45_000,
): Promise<DailySeries> {
  const url =
    `${GEOGLOWS_BASE}/retrospectivedaily/${id}?format=json` +
    `&start_date=${compactDate(startYmd)}&end_date=${compactDate(endYmd)}`;
  return parseRetrospective(await getJson(url, timeoutMs), id);
}

export type ForecastDaily = DailySeries & { band: EnsembleBand };

/** Daily means of the forecast statistics; the median is the day's discharge. */
export function parseForecastStats(json: unknown): ForecastDaily {
  const o = json as Record<string, unknown> | null;
  const times = o?.datetime;
  if (!Array.isArray(times)) throw new GeoglowsError('Unexpected forecast reply');

  const buckets = new Map<string, Record<keyof typeof FORECAST_KEYS, number[]>>();
  times.forEach((t, i) => {
    const day = dayOf(t);
    if (!day) return;
    let bucket = buckets.get(day);
    if (!bucket) {
      bucket = { min: [], p25: [], median: [], p75: [], max: [] };
      buckets.set(day, bucket);
    }
    for (const [name, key] of Object.entries(FORECAST_KEYS) as [
      keyof typeof FORECAST_KEYS,
      string,
    ][]) {
      const series = o?.[key];
      const v = Array.isArray(series) ? numberOrNull(series[i]) : null;
      if (v !== null) bucket[name].push(v);
    }
  });

  const days = [...buckets.keys()].sort();
  const mean = (xs: number[]): number | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  const column = (name: keyof typeof FORECAST_KEYS) => days.map((d) => mean(buckets.get(d)![name]));

  return {
    days,
    discharge: column('median'),
    band: {
      days,
      min: column('min'),
      p25: column('p25'),
      median: column('median'),
      p75: column('p75'),
      max: column('max'),
    },
  };
}

export async function fetchForecast(id: number, timeoutMs = 15_000): Promise<ForecastDaily> {
  return parseForecastStats(
    await getJson(`${GEOGLOWS_BASE}/forecaststats/${id}?format=json`, timeoutMs),
  );
}

/**
 * History and forecast as one continuous daily series. History wins where both have a value. Days
 * between the end of the history and the start of the forecast stay null (the service has no value
 * for them), so "today" is the latest day that has a number.
 */
export function combineDaily(history: DailySeries, forecast: DailySeries): DailySeries {
  const byDay = new Map<string, number | null>();
  history.days.forEach((d, i) => {
    if (d) byDay.set(d, history.discharge[i] ?? null);
  });
  forecast.days.forEach((d, i) => {
    if (!d) return;
    if (!byDay.has(d) || byDay.get(d) === null) byDay.set(d, forecast.discharge[i] ?? null);
  });
  const sorted = [...byDay.keys()].sort();
  if (sorted.length === 0) return { days: [], discharge: [] };
  const days: string[] = [];
  const discharge: (number | null)[] = [];
  for (let d = sorted[0]; d <= sorted[sorted.length - 1]; d = addDay(d)) {
    days.push(d);
    discharge.push(byDay.get(d) ?? null);
  }
  return { days, discharge };
}

/** Offset (degrees, about 3 km) of the points searched around a click for the largest nearby river. */
export const REACH_SEARCH_DEGREES = 0.03;

export type ChosenReach = { id: number; lat: number; lng: number; recentMean: number };

/**
 * The nearest reach can be a small side channel (the Mississippi at St Louis snaps to one that
 * averages about 5 m3/s). So the 9 points around the click are looked up, each reach is checked on
 * its last 90 days of flow, and the largest mean wins; ties go to the point nearest the click.
 */
export async function chooseReach(lat: number, lng: number, today: string): Promise<ChosenReach> {
  const points: { lat: number; lng: number }[] = [];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      points.push({
        lat: Math.round((lat + dy * REACH_SEARCH_DEGREES) * 1e6) / 1e6,
        lng: Math.round((lng + dx * REACH_SEARCH_DEGREES) * 1e6) / 1e6,
      });
    }
  }
  // One request at a time: bursts of parallel requests trigger the service's rate limit.
  const looked: PromiseSettledResult<{ lat: number; lng: number; id: number }>[] = [];
  for (const p of points) {
    try {
      looked.push({ status: 'fulfilled', value: { ...p, id: await findReach(p.lat, p.lng) } });
    } catch (reason) {
      looked.push({ status: 'rejected', reason });
    }
    await pause(150);
  }
  const seen = new Set<number>();
  const candidates: { id: number; lat: number; lng: number }[] = [];
  for (const r of looked) {
    if (r.status === 'fulfilled' && !seen.has(r.value.id)) {
      seen.add(r.value.id);
      candidates.push(r.value);
    }
  }
  if (candidates.length === 0) throw new GeoglowsError('No river reach found');

  const start = addDaysTo(today, -90);
  const recent: PromiseSettledResult<DailySeries>[] = [];
  for (const c of candidates) {
    try {
      recent.push({ status: 'fulfilled', value: await fetchHistory(c.id, start, today, 20_000) });
    } catch (reason) {
      recent.push({ status: 'rejected', reason });
    }
    await pause(150);
  }

  let best: ChosenReach | null = null;
  const dist = (c: { lat: number; lng: number }) => (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
  candidates.forEach((c, i) => {
    const r = recent[i];
    if (r.status !== 'fulfilled') return;
    const vals = r.value.discharge.filter((v): v is number => v !== null);
    if (vals.length === 0) return;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!best || mean > best.recentMean || (mean === best.recentMean && dist(c) < dist(best))) {
      best = { id: c.id, lat: c.lat, lng: c.lng, recentMean: mean };
    }
  });
  if (!best) throw new GeoglowsError('No recent flow for any nearby reach');
  return best;
}

function addDaysTo(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
