/** Water level rise above bankfull: h * ((q / q2) ** k - 1), never negative. Defaults h = 2 m, k = 0.5. */
export function riseAboveBankfull(
  q: number,
  q2: number,
  opts: { bankfullDepth?: number; exponent?: number } = {},
): number {
  const h = opts.bankfullDepth ?? 2;
  const k = opts.exponent ?? 0.5;
  if (!Number.isFinite(q) || !Number.isFinite(q2) || q2 <= 0) return 0;
  const rise = h * ((q / q2) ** k - 1);
  return Number.isFinite(rise) ? Math.max(0, rise) : 0;
}
