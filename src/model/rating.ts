/**
 * Synthetic rating curve from HAND (height above nearest drainage): the stage a discharge needs
 * in a reach, from Manning's equation on a cross-section built from the terrain, instead of an
 * assumed bankfull depth (Zheng et al. 2018; Garousi-Nejad et al. 2019). Pure functions.
 *
 * The cells of the reach (those that drain to its stream cells) are sorted by HAND to make one
 * monotone cross-section: lateral width per cell = cellArea / reachLength. For a stage h the wet
 * cells are those with HAND below h, area A = sum(h - hand) * width, wetted perimeter follows the
 * sorted bed profile plus one bank, R = A / P, and Q(h) = A * R^(2/3) * sqrt(S) / n.
 */

export type RatingInput = {
  /** HAND per cell (metres above the nearest stream); Infinity or NaN cells are ignored. */
  hand: Float32Array;
  /** Cells that belong to the reach (truthy = include). */
  reachMask: Uint8Array | boolean[];
  /** Grid cell size in metres. */
  cellSizeM: number;
  /** Channel slope (m/m), floored at 0.0001. */
  slope: number;
  /** Manning roughness; 0.05 is a common default for natural channels with floodplain. */
  n: number;
  /** Discharge in m3/s. */
  q: number;
};

export type Stage = { central: number; low: number; high: number };

const MIN_SLOPE = 0.0001;
const STREAM_EPS = 1e-6;
const N_SPREAD = 0.3; // low/high use n -30% / +30%
const MAX_STAGE_M = 1000;

type Section = {
  z: Float64Array; // sorted HAND of reach cells
  prefixZ: Float64Array; // prefixZ[k] = sum of the first k values
  prefixP: Float64Array; // prefixP[k] = bed length across the first k cells
  omega: number; // lateral width represented by one cell
};

function buildSection(input: RatingInput): Section | null {
  const { hand, reachMask, cellSizeM } = input;
  const values: number[] = [];
  let streamCells = 0;
  for (let i = 0; i < hand.length; i += 1) {
    if (!reachMask[i]) continue;
    const h = hand[i];
    if (!Number.isFinite(h) || h < 0) continue;
    values.push(h);
    if (h <= STREAM_EPS) streamCells += 1;
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const length = Math.max(1, streamCells) * cellSizeM;
  const omega = (cellSizeM * cellSizeM) / length;
  const k = values.length;
  const z = Float64Array.from(values);
  const prefixZ = new Float64Array(k + 1);
  const prefixP = new Float64Array(k + 1);
  for (let i = 0; i < k; i += 1) {
    prefixZ[i + 1] = prefixZ[i] + z[i];
    const dz = i === 0 ? 0 : z[i] - z[i - 1];
    prefixP[i + 1] = prefixP[i] + Math.sqrt(omega * omega + dz * dz);
  }
  return { z, prefixZ, prefixP, omega };
}

/** Number of cells with HAND strictly below stage h. */
function wetCount(z: Float64Array, h: number): number {
  let lo = 0;
  let hi = z.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (z[mid] < h) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function manningDischarge(section: Section, h: number, slope: number, n: number): number {
  if (!(h > 0)) return 0;
  const k = wetCount(section.z, h);
  if (k === 0) return 0;
  const area = section.omega * (k * h - section.prefixZ[k]);
  const perimeter = section.prefixP[k] + (h - section.z[k - 1]);
  if (!(area > 0) || !(perimeter > 0)) return 0;
  const radius = area / perimeter;
  return (area * Math.pow(radius, 2 / 3) * Math.sqrt(slope)) / n;
}

function invert(section: Section, q: number, slope: number, n: number): number {
  let lo = 0;
  let hi = 1;
  while (manningDischarge(section, hi, slope, n) < q) {
    hi *= 2;
    if (hi > MAX_STAGE_M) return MAX_STAGE_M;
  }
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (manningDischarge(section, mid, slope, n) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Stage in metres above the stream bed for discharge q. `low` and `high` use roughness n -30% and
 * +30% (a rougher channel needs a higher stage). Always finite; zeros for q <= 0 or bad input.
 */
export function stageForDischarge(input: RatingInput): Stage {
  const zero: Stage = { central: 0, low: 0, high: 0 };
  const { q, n, cellSizeM } = input;
  if (!Number.isFinite(q) || q <= 0) return zero;
  if (!Number.isFinite(n) || n <= 0) return zero;
  if (!Number.isFinite(cellSizeM) || cellSizeM <= 0) return zero;
  const slope = Math.max(MIN_SLOPE, Number.isFinite(input.slope) ? input.slope : MIN_SLOPE);
  const section = buildSection(input);
  if (!section) return zero;
  const central = invert(section, q, slope, n);
  const low = invert(section, q, slope, n * (1 - N_SPREAD));
  const high = invert(section, q, slope, n * (1 + N_SPREAD));
  return { central, low: Math.min(low, central), high: Math.max(high, central) };
}
