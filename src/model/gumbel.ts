/** Gumbel (EV1) flood-frequency maths fitted with L-moments. Pure functions, no I/O. */

export type GumbelFit = { mu: number; beta: number };

const EULER_GAMMA = 0.5772156649;
const MIN_YEARS = 10;
const MIN_VALID_DAYS = 300;
const MAX_DISPLAY_YEARS = 40;

/** One maximum per UTC calendar year; years with fewer than 300 valid (non-null) days are dropped. */
export function annualMaxima(days: string[], values: (number | null)[]): number[] {
  const byYear = new Map<number, { max: number; count: number }>();
  const n = Math.min(days.length, values.length);
  for (let i = 0; i < n; i += 1) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    const year = Number(days[i].slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const entry = byYear.get(year);
    if (entry) {
      entry.count += 1;
      if (value > entry.max) entry.max = value;
    } else {
      byYear.set(year, { max: value, count: 1 });
    }
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, e]) => e.count >= MIN_VALID_DAYS)
    .map(([, e]) => e.max);
}

/** First two L-moments: l1 is the mean, l2 = 2*b1 - l1 (probability weighted moment b1). */
export function lMoments(values: number[]): { l1: number; l2: number } {
  const n = values.length;
  if (n === 0) return { l1: 0, l2: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const l1 = sorted.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { l1, l2: 0 };
  let b1 = 0;
  for (let i = 0; i < n; i += 1) b1 += (i / (n - 1)) * sorted[i];
  b1 /= n;
  return { l1, l2: 2 * b1 - l1 };
}

/** Null for fewer than 10 values or a non-positive scale. */
export function fitGumbel(annualMax: number[]): GumbelFit | null {
  const usable = annualMax.filter((v) => Number.isFinite(v));
  if (usable.length < MIN_YEARS) return null;
  const { l1, l2 } = lMoments(usable);
  const beta = l2 / Math.LN2;
  if (!(beta > 0)) return null;
  return { mu: l1 - EULER_GAMMA * beta, beta };
}

/** Discharge with return period T years (T > 1). */
export function quantile(T: number, fit: GumbelFit): number {
  return fit.mu - fit.beta * Math.log(-Math.log(1 - 1 / T));
}

/** Return period in years of discharge q. Always >= 1 and increasing in q. */
export function returnPeriod(q: number, fit: GumbelFit): number {
  const z = Math.exp(-(q - fit.mu) / fit.beta);
  const p = -Math.expm1(-z); // 1 - exp(-z), exact for small z
  return p <= 0 ? Infinity : Math.max(1, 1 / p);
}

/** Forty years of data cannot resolve a 100-year event, so the display stops at 40. */
export function capReturnPeriod(T: number): { value: number; capped: boolean } {
  return T > MAX_DISPLAY_YEARS
    ? { value: MAX_DISPLAY_YEARS, capped: true }
    : { value: T, capped: false };
}

/** Weibull plotting position: T = (n + 1) / rank, rank = 1 + count of maxima strictly greater. */
export function empiricalReturnPeriod(q: number, annualMax: number[]): number {
  const rank = 1 + annualMax.filter((v) => v > q).length;
  return (annualMax.length + 1) / rank;
}

/**
 * Hydrological-year maxima: the water year starts in the month after the month with the lowest
 * mean flow, so one wet season is never split across two calendar years (southern hemisphere,
 * monsoon rivers). Same 300 valid-day rule as `annualMaxima`. The newest (partial) water year is
 * dropped, so the event being rated never shapes its own history.
 */
export function hydrologicalYearMaxima(days: string[], values: (number | null)[]): number[] {
  const n = Math.min(days.length, values.length);
  const monthSum = new Array<number>(12).fill(0);
  const monthCount = new Array<number>(12).fill(0);
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const month = Number(days[i].slice(5, 7)) - 1;
    if (!(month >= 0 && month < 12)) continue;
    monthSum[month] += v;
    monthCount[month] += 1;
  }
  let driest = 0;
  let driestMean = Infinity;
  for (let m = 0; m < 12; m += 1) {
    if (monthCount[m] === 0) continue;
    const mean = monthSum[m] / monthCount[m];
    if (mean < driestMean) {
      driestMean = mean;
      driest = m;
    }
  }
  const startMonth = (driest + 1) % 12; // 0-based month the water year begins in

  const byYear = new Map<number, { max: number; count: number }>();
  let lastIndexYear = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const year = Number(days[i].slice(0, 4));
    const month = Number(days[i].slice(5, 7)) - 1;
    if (!Number.isFinite(year) || !(month >= 0 && month < 12)) continue;
    // Water year is named by the calendar year it starts in.
    const waterYear = startMonth === 0 || month >= startMonth ? year : year - 1;
    lastIndexYear = Math.max(lastIndexYear, waterYear);
    const entry = byYear.get(waterYear);
    if (entry) {
      entry.count += 1;
      if (v > entry.max) entry.max = v;
    } else {
      byYear.set(waterYear, { max: v, count: 1 });
    }
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([year, e]) => year < lastIndexYear && e.count >= MIN_VALID_DAYS)
    .map(([, e]) => e.max);
}

export const RETURN_LEVEL_PERIODS = [2, 5, 20, 50, 100] as const;

/** Discharge at each return period; empty array when there is no fit. */
export function returnLevels(
  fit: GumbelFit | null,
  periods: readonly number[] = RETURN_LEVEL_PERIODS,
): { T: number; q: number }[] {
  if (!fit) return [];
  return periods.map((T) => ({ T, q: quantile(T, fit) }));
}

/** Small deterministic generator (mulberry32) so a bootstrap gives the same answer every time. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 90% bootstrap range (5th to 95th percentile) of the return period of discharge `q`, resampling
 * the yearly maxima with a fixed seed. Null when the sample is too small or q is not usable.
 */
export function returnPeriodRange(
  q: number,
  annualMax: number[],
  resamples = 200,
  seed = 12345,
): { low: number; high: number } | null {
  const usable = annualMax.filter((v) => Number.isFinite(v));
  if (usable.length < MIN_YEARS || !Number.isFinite(q)) return null;
  const rand = seededRandom(seed);
  const periods: number[] = [];
  for (let r = 0; r < resamples; r += 1) {
    const sample: number[] = [];
    for (let i = 0; i < usable.length; i += 1) {
      sample.push(usable[Math.floor(rand() * usable.length)]);
    }
    const fit = fitGumbel(sample);
    if (fit) periods.push(returnPeriod(q, fit));
  }
  if (periods.length < Math.max(10, Math.floor(resamples / 4))) return null;
  periods.sort((a, b) => a - b);
  const at = (p: number) => periods[Math.min(periods.length - 1, Math.floor(p * periods.length))];
  const low = at(0.05);
  const high = at(0.95);
  if (!Number.isFinite(low)) return null;
  return { low, high: Number.isFinite(high) ? high : Infinity };
}
