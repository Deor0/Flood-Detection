/**
 * Requests to the SFINCS flood engine (the `engine/` Docker service) and checks on its answers.
 * Pure functions; the route in `src/app/api/simulate` does the network part.
 */

export const MAX_BOX_KM = 20;
export const MIN_HOURS = 1;
export const MAX_HOURS = 72;
export const MIN_RES = 30;
export const MAX_RES = 200;

export type SimulateRequest = {
  bbox: [number, number, number, number];
  inflow: { lat: number; lng: number; times: string[]; discharge: number[] };
  hours: number;
  resolution?: number;
};

export type SimulateResult = {
  id: string;
  bbox: [number, number, number, number];
  /** [south, west, north, east], ready for a Leaflet image overlay. */
  bounds: [number, number, number, number];
  width: number;
  height: number;
  resolution: number;
  maxDepth: { url: string; scaleMax: number };
  stats: { floodedKm2: number; maxDepthM: number; runSeconds: number };
  /** Plain-language accuracy warnings from the engine (e.g. most water sits in filled hollows). */
  warnings: string[];
  attribution: string;
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function boxSizeKm([west, south, east, north]: SimulateRequest['bbox']): {
  width: number;
  height: number;
} {
  const mid = ((south + north) / 2) * (Math.PI / 180);
  return { width: (east - west) * 111.32 * Math.cos(mid), height: (north - south) * 110.574 };
}

/** A square box of `halfWidthKm` around a point, clamped to the engine's size limit. */
export function boxAround(lat: number, lng: number, halfWidthKm: number): SimulateRequest['bbox'] {
  const half = Math.min(halfWidthKm, MAX_BOX_KM / 2 - 0.05);
  const dLat = half / 110.574;
  const dLng = half / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/** The typical flow on this river: the median of the daily series (ignoring gaps). */
export function typicalFlow(discharge: (number | null)[] | undefined): number {
  const values = (discharge ?? []).filter(finite).sort((a, b) => a - b);
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * The engine request for a scenario flow `q` at the snapped river point.
 *
 * Elevation models show the river's water surface at about its ordinary level, not the river bed, so
 * the engine is fed the flow *above* the typical flow. That excess rises linearly from zero to its
 * peak over the first half of the run, then holds.
 */
export function buildSimulateRequest(
  point: { lat: number; lng: number },
  q: number,
  baseflow: number,
  opts: { hours?: number; halfWidthKm?: number; resolution?: number; start?: Date } = {},
): SimulateRequest {
  const hours = Math.round(Math.min(MAX_HOURS, Math.max(MIN_HOURS, opts.hours ?? 24)));
  const start = new Date(opts.start ?? Date.now());
  start.setUTCMinutes(0, 0, 0);
  const at = (h: number) => new Date(start.getTime() + h * 3_600_000).toISOString();
  const excess = Math.max(0, q - Math.max(0, baseflow));
  return {
    bbox: boxAround(point.lat, point.lng, opts.halfWidthKm ?? 5),
    inflow: {
      lat: point.lat,
      lng: point.lng,
      times: [at(0), at(hours / 2), at(hours)],
      discharge: [0, excess, excess].map((v) => Math.round(v * 1000) / 1000),
    },
    hours,
    resolution: opts.resolution ?? 50,
  };
}

/** Same rules as `engine/validate.py`. Returns an error message, or null when the request is fine. */
export function checkSimulateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Partial<SimulateRequest>;
  if (!Array.isArray(b.bbox) || b.bbox.length !== 4 || !b.bbox.every(finite))
    return 'bbox must be [west, south, east, north]';
  const [west, south, east, north] = b.bbox;
  if (!(-180 <= west && west < east && east <= 180 && -85 <= south && south < north && north <= 85))
    return 'bbox is out of range or inverted';
  const size = boxSizeKm(b.bbox);
  if (size.width > MAX_BOX_KM + 0.01 || size.height > MAX_BOX_KM + 0.01)
    return `bbox is larger than ${MAX_BOX_KM} x ${MAX_BOX_KM} km`;
  const inflow = b.inflow;
  if (!inflow || typeof inflow !== 'object') return 'inflow is required';
  if (!finite(inflow.lat) || !finite(inflow.lng)) return 'inflow point must be numbers';
  if (inflow.lng < west || inflow.lng > east || inflow.lat < south || inflow.lat > north)
    return 'inflow point must be inside the bbox';
  if (!Array.isArray(inflow.times) || !Array.isArray(inflow.discharge))
    return 'inflow.times and inflow.discharge must be arrays';
  if (inflow.times.length !== inflow.discharge.length)
    return 'inflow.times and inflow.discharge differ in length';
  if (inflow.times.length < 2) return 'the hydrograph needs at least 2 values';
  const ms = inflow.times.map((t) => (typeof t === 'string' ? Date.parse(t) : NaN));
  if (ms.some((t) => !Number.isFinite(t))) return 'inflow.times must be ISO strings';
  if (ms.some((t, i) => i > 0 && t <= ms[i - 1])) return 'inflow.times must be strictly ascending';
  if (!inflow.discharge.every((v) => finite(v) && v >= 0)) return 'discharge must be >= 0';
  if (!finite(b.hours) || !Number.isInteger(b.hours) || b.hours < MIN_HOURS || b.hours > MAX_HOURS)
    return `hours must be a whole number from ${MIN_HOURS} to ${MAX_HOURS}`;
  if (
    b.resolution !== undefined &&
    (!finite(b.resolution) || b.resolution < MIN_RES || b.resolution > MAX_RES)
  )
    return `resolution must be ${MIN_RES} to ${MAX_RES} m`;
  return null;
}

export function validateSimulateResponse(json: unknown): SimulateResult | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Partial<SimulateResult>;
  const quad = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(finite);
  if (typeof r.id !== 'string' || !/^[0-9a-f]{16}$/.test(r.id)) return null;
  if (!quad(r.bbox) || !quad(r.bounds)) return null;
  if (!r.maxDepth || typeof r.maxDepth.url !== 'string' || !finite(r.maxDepth.scaleMax))
    return null;
  const s = r.stats;
  if (!s || ![s.floodedKm2, s.maxDepthM, s.runSeconds].every((v) => finite(v) && v >= 0))
    return null;
  return {
    id: r.id,
    bbox: r.bbox as SimulateResult['bbox'],
    bounds: r.bounds as SimulateResult['bounds'],
    width: finite(r.width) ? r.width : 0,
    height: finite(r.height) ? r.height : 0,
    resolution: finite(r.resolution) ? r.resolution : 0,
    maxDepth: { url: r.maxDepth.url, scaleMax: r.maxDepth.scaleMax },
    stats: { floodedKm2: s.floodedKm2, maxDepthM: s.maxDepthM, runSeconds: s.runSeconds },
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
    attribution: typeof r.attribution === 'string' ? r.attribution : '',
  };
}
