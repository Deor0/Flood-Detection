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
