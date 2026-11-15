import { capReturnPeriod, returnPeriod } from '@/model/gumbel';
import { severityFromReturnPeriod } from '@/model/severity';
import type { FloodData, Severity } from './types';

/** What the person has asked the simulation to show. */
export type ScenarioState = {
  /** Simulate a forecast day, or a flood of a chosen return period. */
  basis: 'forecast' | 'return';
  /** Days after today (0 = today). */
  day: number;
  /** Return period in years when basis is 'return'. */
  T: number;
  /** Multiplies the river flow. */
  multiplier: number;
  /** Add a breach flow on top of the river flow. */
  breach: boolean;
  /** Extra discharge in m3/s when `breach` is on. */
  extra: number;
  /** Channel roughness factor (1 = the default assumption). */
  roughness: number;
};

export const DEFAULT_SCENARIO: ScenarioState = {
  basis: 'forecast',
  day: 0,
  T: 20,
  multiplier: 1,
  breach: false,
  extra: 0,
  roughness: 1,
};

export const RETURN_PERIODS = [2, 5, 20, 50, 100] as const;

export type ResolvedScenario = {
  /** The discharge that is simulated, m3/s. */
  q: number | null;
  /** Discharge before the multiplier and breach flow, m3/s. */
  base: number | null;
  /** Date the base discharge belongs to, for forecast scenarios. */
  date: string | null;
  /** Forecast spread for that day, when the ensemble is available. */
  spread: { min: number | null; max: number | null } | null;
  /** Return period of the simulated flow, years (capped for display). */
  returnPeriod: { value: number; capped: boolean } | null;
  /** One-line, plain description of what the map shows. */
  summary: string;
};

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** How many days after today the data covers (at most 15). */
export function forecastDays(data: FloodData, today = todayIso()): number {
  const days = new Set<string>();
  for (const d of data.series?.days ?? []) if (d > today) days.add(d);
  for (const d of data.forecast?.ensemble?.days ?? []) if (d > today) days.add(d);
  return Math.min(15, days.size);
}

function seriesAt(data: FloodData, date: string): number | null {
  const i = data.series?.days.indexOf(date) ?? -1;
  return i >= 0 ? (data.series?.discharge[i] ?? null) : null;
}

const fmtQ = (q: number) => (q >= 100 ? Math.round(q).toLocaleString('en') : q.toFixed(1));

export function resolveScenario(
  data: FloodData,
  state: ScenarioState,
  today = todayIso(),
): ResolvedScenario {
  const levels = data.climatology?.returnLevels ?? [];
  const fit = data.climatology?.fit ?? null;
  let base: number | null = null;
  let date: string | null = null;
  let spread: ResolvedScenario['spread'] = null;

  if (state.basis === 'return') {
    base = levels.find((l) => l.T === state.T)?.q ?? null;
  } else {
    date = addDays(today, state.day);
    const ens = data.forecast?.ensemble;
    const i = ens ? ens.days.indexOf(date) : -1;
    if (ens && i >= 0 && state.day > 0 && ens.median[i] != null) {
      base = ens.median[i];
      spread = { min: ens.min[i] ?? null, max: ens.max[i] ?? null };
    } else {
      base =
        state.day === 0 ? (data.current?.discharge ?? seriesAt(data, date)) : seriesAt(data, date);
      if (base === null && state.day === 0) base = seriesAt(data, date);
    }
  }

  const extra = state.breach ? Math.max(0, state.extra) : 0;
  const q = base === null ? null : base * state.multiplier + extra;
  const rp = q !== null && fit ? capReturnPeriod(returnPeriod(q, fit)) : null;

  const when =
    state.basis === 'return' ? `a ${state.T}-year flood scenario` : formatDay(date, state.day);
  const parts = [`Showing ${when}`];
  if (q !== null) parts.push(`${fmtQ(q)} m³/s`);
  if (rp) parts.push(describeReturn(rp));
  if (state.multiplier !== 1) parts.push(`flow ×${state.multiplier.toFixed(1)}`);
  if (extra > 0) parts.push(`plus ${fmtQ(extra)} m³/s breach flow`);
  return { q, base, date, spread, returnPeriod: rp, summary: parts.join(', ') };
}

function formatDay(date: string | null, day: number): string {
  if (!date) return 'today';
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return day === 0 ? `today (${label})` : `${label} (in ${day} ${day === 1 ? 'day' : 'days'})`;
}

export function describeReturn(rp: { value: number; capped: boolean }): string {
  if (rp.capped) return 'more than a 40-year flow';
  if (rp.value < 2) return 'an ordinary flow, under the 2-year level';
  return `about a ${rp.value < 10 ? rp.value.toFixed(1) : Math.round(rp.value)}-year flow`;
}

/** Plain-language sentence for what the flow means on this river. */
export function plainSeverity(
  rp: { value: number; capped: boolean } | null,
  range: { low: number; high: number } | undefined,
): string {
  if (!rp) return 'There is not enough river history here to say how unusual this flow is.';
  if (rp.capped)
    return 'A flow this big has not been seen in the 40-year view we show, so we cannot say how rare it is.';
  if (rp.value < 2) return 'This is an ordinary flow for this river; it happens most years.';
  const base = `A flow this size happens about once every ${rp.value < 10 ? rp.value.toFixed(1) : Math.round(rp.value)} years on this river`;
  return range
    ? `${base} (likely between ${Math.round(range.low)} and ${Math.round(range.high)} years).`
    : `${base}.`;
}

/**
 * The river's normal flow (m3/s): the level the terrain already shows as water. Uses the server's
 * long-term average; older saved data without it falls back to the median of the past days shown.
 */
export function normalFlowFor(data: FloodData, today = todayIso()): number | null {
  const stored = data.climatology?.normalFlow;
  if (stored != null && Number.isFinite(stored) && stored > 0) return stored;
  const days = data.series?.days ?? [];
  const past = (data.series?.discharge ?? [])
    .filter((v, i): v is number => days[i] <= today && v !== null && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (past.length === 0) return null;
  const mid = past.length >> 1;
  return past.length % 2 ? past[mid] : (past[mid - 1] + past[mid]) / 2;
}

/** Today's severity and the forecast peak's, kept apart. Older data falls back to the fields. */
export function splitSeverity(data: FloodData): { today: Severity; forecastPeak: Severity } {
  if (data.severities) return data.severities;
  const rp = data.current?.returnPeriod;
  return {
    today: rp != null && Number.isFinite(rp) ? severityFromReturnPeriod(rp) : 'unknown',
    forecastPeak: data.forecast?.severity ?? 'unknown',
  };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Eight-point compass direction from one point to another (initial great-circle bearing). */
export function compassDirection(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): (typeof COMPASS)[number] {
  const r = Math.PI / 180;
  const dl = (to.lng - from.lng) * r;
  const y = Math.sin(dl) * Math.cos(to.lat * r);
  const x =
    Math.cos(from.lat * r) * Math.sin(to.lat * r) -
    Math.sin(from.lat * r) * Math.cos(to.lat * r) * Math.cos(dl);
  const deg = (((Math.atan2(y, x) / r) % 360) + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/** "~640 m" under a kilometre (to 10 m), "~1.2 km" above. */
export function roundDistance(m: number): string {
  if (m < 1000) return `~${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `~${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** Map label for the way-home line, e.g. "Nearest high ground (Ithaca), ~640 m NE". */
export function wayHomeLabel(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  distM: number,
): string {
  if (distM < 15) return 'This point stays dry at this level (Ithaca, high ground)';
  return `Nearest high ground (Ithaca), ${roundDistance(distM)} ${compassDirection(from, to)}`;
}

const SURGE_LABEL: Partial<Record<Severity, string>> = {
  watch: 'Watch',
  warning: 'Warning',
  severe: 'Severe',
};

/**
 * Themed kicker for a raised severity, plain words first: "Warning — Poseidon's surge: about a
 * 1-in-20-year flow". Null for normal or unknown (nothing to announce).
 */
export function surgeLine(
  severity: Severity,
  rp: { value: number; capped: boolean } | null,
  when: 'today' | 'forecast' = 'today',
): string | null {
  const label = SURGE_LABEL[severity];
  if (!label) return null;
  const size = !rp
    ? 'an unusually high flow'
    : rp.capped
      ? 'more than a 1-in-40-year flow'
      : `about a 1-in-${rp.value < 10 ? rp.value.toFixed(1) : Math.round(rp.value)}-year flow`;
  return `${label} — Poseidon's surge: ${size}${when === 'forecast' ? ' at the forecast peak' : ''}`;
}
