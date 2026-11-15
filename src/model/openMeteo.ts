/** Open-Meteo Flood API (Copernicus GloFAS river discharge) client helpers. No network here. */

const BASE = 'https://flood-api.open-meteo.com/v1/flood';
const CELL_DEGREES = 0.05;

export class FloodApiError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FloodApiError';
  }
}

export type FloodUrlOptions = {
  lat: number | number[];
  lng: number | number[];
  startDate?: string;
  endDate?: string;
  pastDays?: number;
  forecastDays?: number;
};

export function floodUrl(opts: FloodUrlOptions): string {
  const join = (v: number | number[]) => (Array.isArray(v) ? v.join(',') : String(v));
  const url = new URL(BASE);
  url.searchParams.set('latitude', join(opts.lat));
  url.searchParams.set('longitude', join(opts.lng));
  url.searchParams.set('daily', 'river_discharge');
  if (opts.startDate) url.searchParams.set('start_date', opts.startDate);
  if (opts.endDate) url.searchParams.set('end_date', opts.endDate);
  if (opts.pastDays !== undefined) url.searchParams.set('past_days', String(opts.pastDays));
  if (opts.forecastDays !== undefined)
    url.searchParams.set('forecast_days', String(opts.forecastDays));
  return url.toString();
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The 3 by 3 grid of cells around the click (+-0.05 degrees), the click itself first. */
export function neighbourCoordinates(lat: number, lng: number): { lat: number; lng: number }[] {
  const out = [{ lat, lng }];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      out.push({ lat: round6(lat + dy * CELL_DEGREES), lng: round6(lng + dx * CELL_DEGREES) });
    }
  }
  return out;
}

export type FloodCell = { lat: number; lng: number; days: string[]; discharge: (number | null)[] };

/** Single or array responses. An `{ error: true, reason }` body throws a FloodApiError. */
export function parseFloodResponse(json: unknown): FloodCell[] {
  const items = Array.isArray(json) ? json : [json];
  return items.map((item) => {
    const o = item as {
      error?: boolean;
      reason?: string;
      latitude?: number;
      longitude?: number;
      daily?: { time?: string[]; river_discharge?: (number | null)[] };
    } | null;
    if (!o || typeof o !== 'object') throw new FloodApiError('Unexpected response');
    if (o.error) throw new FloodApiError(o.reason ?? 'Open-Meteo error');
    return {
      lat: Number(o.latitude),
      lng: Number(o.longitude),
      days: o.daily?.time ?? [],
      discharge: o.daily?.river_discharge ?? [],
    };
  });
}

type CellLike = { lat: number; lng: number; discharge: (number | null)[] };

function meanDischarge(values: (number | null)[]): number {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    sum += v;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/** Largest mean discharge wins; ties go to the cell nearest the click; no flow anywhere gives null. */
export function pickRiverCell<T extends CellLike>(
  cells: T[],
  click: { lat: number; lng: number },
): T | null {
  let best: T | null = null;
  let bestMean = 0;
  let bestDist = Infinity;
  for (const cell of cells) {
    const mean = meanDischarge(cell.discharge);
    if (!(mean > 0)) continue;
    const dist = (cell.lat - click.lat) ** 2 + (cell.lng - click.lng) ** 2;
    if (mean > bestMean || (mean === bestMean && dist < bestDist)) {
      best = cell;
      bestMean = mean;
      bestDist = dist;
    }
  }
  return best;
}

/** Forecast spread for one cell: min, quartiles, median and max of the GloFAS ensemble per day. */
export type EnsembleBand = {
  days: string[];
  min: (number | null)[];
  p25: (number | null)[];
  median: (number | null)[];
  p75: (number | null)[];
  max: (number | null)[];
};

const ENSEMBLE_FIELDS = [
  'river_discharge',
  'river_discharge_min',
  'river_discharge_max',
  'river_discharge_p25',
  'river_discharge_p75',
  'river_discharge_median',
] as const;

/** One cell, forecast only, with the ensemble statistics. */
export function floodEnsembleUrl(opts: {
  lat: number;
  lng: number;
  forecastDays?: number;
}): string {
  const url = new URL(BASE);
  url.searchParams.set('latitude', String(opts.lat));
  url.searchParams.set('longitude', String(opts.lng));
  url.searchParams.set('daily', ENSEMBLE_FIELDS.join(','));
  url.searchParams.set('forecast_days', String(opts.forecastDays ?? 16));
  return url.toString();
}

const numberOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Null when the body is an error or has no daily times. The median falls back to `river_discharge`. */
export function parseEnsembleResponse(json: unknown): EnsembleBand | null {
  const o = (Array.isArray(json) ? json[0] : json) as {
    error?: boolean;
    daily?: Record<string, unknown>;
  } | null;
  if (!o || typeof o !== 'object' || o.error || !o.daily) return null;
  const daily = o.daily;
  const days = Array.isArray(daily.time) ? (daily.time as string[]) : [];
  if (days.length === 0) return null;
  const column = (key: string): (number | null)[] => {
    const raw = daily[key];
    return days.map((_, i) => (Array.isArray(raw) ? numberOrNull(raw[i]) : null));
  };
  const base = column('river_discharge');
  const median = column('river_discharge_median').map((v, i) => v ?? base[i]);
  return {
    days,
    min: column('river_discharge_min'),
    p25: column('river_discharge_p25'),
    median,
    p75: column('river_discharge_p75'),
    max: column('river_discharge_max'),
  };
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
