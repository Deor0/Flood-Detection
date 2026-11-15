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
