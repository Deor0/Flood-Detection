import { computeHand, depthGrid, findSeed } from '@/model/hand';
import { stageForDischarge } from '@/model/rating';
import { groundResolution } from '@/model/terrarium';

/**
 * Pure, DOM-free part of the water fill. Runs in a Web Worker, or on the main thread as a fallback.
 *
 * Two steps, so scenario sliders stay fast:
 *  1. `solveField` (heavy, once per click): HAND on the stitched terrain, the main river the click
 *     belongs to, the reach around the seed, and the channel slope.
 *  2. `simulateField` (cheap, per scenario): stage from the Manning synthetic rating curve in
 *     `@/model/rating`, then depth = stage - HAND.
 *
 * Reach and slope method (documented because the numbers depend on it):
 *  - Seed: the stream cell with the largest upstream accumulation within about 3 km of the river-flow
 *    point (`findSeed`).
 *  - Main river: stream cells carrying at least 20% of the seed's accumulation.
 *  - Reach: main-river stream cells within REACH_RADIUS_M (1 km) of the seed. The reach mask marks
 *    every cell that drains to one of those cells (the strip of valley floor beside the reach), which
 *    is the cross-section the rating curve is built from.
 *  - Slope: least-squares slope of filled DEM elevation against distance along the channel, walking
 *    PROFILE_HALF_M (500 m) downstream by `receiver` and upstream by the largest-accumulation donor.
 *    Fewer than 3 profile points falls back to DEFAULT_SLOPE.
 *  - The stage is one number for the whole window (uniform along the river). Dams, tributaries and
 *    a changing slope are not modelled.
 */
export type SolveInput = {
  elevation: Float32Array;
  width: number;
  height: number;
  /** Click position in pixels inside the stitched window. */
  px: number;
  py: number;
  /** Latitude, so the stream threshold and seed radius keep the same ground size at any latitude. */
  lat: number;
  zoom: number;
};

export type SolveOutput = {
  /** HAND per cell; Infinity for cells that do not drain to the main river. */
  hand: Float32Array;
  mainRiver: Uint8Array;
  /** 1 for cells that drain to a main-river stream cell within the reach around the seed. */
  reachMask: Uint8Array;
  width: number;
  height: number;
  seedFound: boolean;
  /** Distance in metres from the river-flow point to the seed channel, or null with no seed. */
  seedDistM: number | null;
  /** Distance in metres to the nearest stream cell of any size, or null if none within 3 km. */
  nearestStreamM: number | null;
  seedWarning?: string;
  /** Channel slope in m/m. */
  slope: number;
  slopeSource: 'dem' | 'default';
  cellSizeM: number;
  /** Stream cells in the reach, and their approximate length in metres. */
  reachStreamCells: number;
  reachLengthM: number;
};

/** Everything about a solved terrain except the big grids. */
export type SolvedMeta = Omit<SolveOutput, 'hand' | 'mainRiver' | 'reachMask'>;

export type SimOptions = {
  /** River discharge in m3/s. */
  q: number;
  /** Multiplies Manning roughness; 1 is the default of 0.05. The low/high stage use +-30% of it. */
  nScale?: number;
};

export type SimResult = {
  /** Central depth above ground in metres; 0 where dry. */
  depth: Float32Array;
  /** 1 on the boundary of the high-stage wet area (the dashed outline). */
  highEdge: Uint8Array;
  stage: { low: number; central: number; high: number };
  q: number;
  nUsed: number;
  slope: number;
  maxDepth: number;
  wetShare: number;
  wetAreaKm2: number;
  /** Same text as the terrain handle's warning, repeated here so a result is self-contained. */
  seedWarning?: string;
};

export { RAMP_DEEP, RAMP_SHALLOW } from './ramp';

const REACH_RADIUS_M = 1000;
const PROFILE_HALF_M = 500;
const DEFAULT_SLOPE = 0.001;
const MIN_SLOPE = 0.0001;
const MAX_SLOPE = 0.1;
const SEED_SEARCH_M = 3000;
const SEED_WARN_M = 1000;
const BASE_N = 0.05;
const MAX_STAGE_M = 50;
const N8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function nearestStream(
  isStream: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radiusCells: number,
): { index: number; distCells: number } {
  let best = Infinity;
  let index = -1;
  const r = Math.ceil(radiusCells);
  for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy += 1) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx += 1) {
      if (!isStream[yy * width + xx]) continue;
      const d = Math.hypot(xx - x, yy - y);
      if (d < best) {
        best = d;
        index = yy * width + xx;
      }
    }
  }
  return { index, distCells: best };
}

/** About 0.5 km2 of upstream area marks a stream; the seed search reaches about 3 km. */
export function solveField(input: SolveInput): SolveOutput {
  const { elevation, width, height, lat, zoom } = input;
  const res = Math.max(1, groundResolution(lat, zoom));
  const streamThresholdCells = Math.max(50, Math.round(500_000 / (res * res)));
  const radius = Math.max(10, Math.round(SEED_SEARCH_M / res));
  const px = Math.min(width - 1, Math.max(0, input.px));
  const py = Math.min(height - 1, Math.max(0, input.py));

  const result = computeHand({ width, height, elevation }, { streamThresholdCells });
  const seed = findSeed(result.accumulation, result.isStream, width, height, px, py, radius);
  const n = width * height;

  // Keep only streams that carry a meaningful share of the seed river's flow, so a tiny gully
  // does not flood to the discharge of a big river.
  const mainRiver = new Uint8Array(n);
  if (seed >= 0) {
    const floor = result.accumulation[seed] * 0.2;
    for (let i = 0; i < n; i += 1) {
      if (result.isStream[i] && result.accumulation[i] >= floor) mainRiver[i] = 1;
    }
  }

  // Each cell drains to a stream along `receiver`; walk down once and remember which stream cell
  // it reaches (-1 when none or when that stream is not part of the main river).
  const hand = Float32Array.from(result.hand);
  const drain = new Int32Array(n).fill(-2);
  const receiver = result.receiver as ArrayLike<number>;
  const path: number[] = [];
  for (let start = 0; start < n; start += 1) {
    if (drain[start] !== -2) continue;
    path.length = 0;
    let cur = start;
    let verdict = -1;
    for (let guard = 0; guard < n; guard += 1) {
      if (drain[cur] !== -2) {
        verdict = drain[cur];
        break;
      }
      path.push(cur);
      if (result.isStream[cur]) {
        verdict = mainRiver[cur] ? cur : -1;
        break;
      }
      const next = receiver[cur];
      if (next < 0 || next === cur) break;
      cur = next;
    }
    for (const p of path) drain[p] = verdict;
  }
  for (let i = 0; i < n; i += 1) if (drain[i] < 0) hand[i] = Infinity;

  // Reach around the seed, and the cells that drain to it.
  const reachMask = new Uint8Array(n);
  let reachStreamCells = 0;
  let seedDistM: number | null = null;
  let slope = DEFAULT_SLOPE;
  let slopeSource: 'dem' | 'default' = 'default';
  if (seed >= 0) {
    const sx = seed % width;
    const sy = Math.floor(seed / width);
    seedDistM = Math.hypot(sx - px, sy - py) * res;
    const reachR = REACH_RADIUS_M / res;
    const reachStream = new Uint8Array(n);
    for (
      let yy = Math.max(0, Math.floor(sy - reachR));
      yy <= Math.min(height - 1, sy + reachR);
      yy += 1
    ) {
      for (
        let xx = Math.max(0, Math.floor(sx - reachR));
        xx <= Math.min(width - 1, sx + reachR);
        xx += 1
      ) {
        const i = yy * width + xx;
        if (mainRiver[i] && Math.hypot(xx - sx, yy - sy) <= reachR) {
          reachStream[i] = 1;
          reachStreamCells += 1;
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (drain[i] >= 0 && reachStream[drain[i]]) reachMask[i] = 1;
    }

    // Longitudinal profile: elevation against distance along the channel (downstream positive).
    const filled = result.filled;
    const pts: Array<[number, number]> = [[0, filled[seed]]];
    let cur = seed;
    let s = 0;
    while (s < PROFILE_HALF_M) {
      const nxt = receiver[cur];
      if (nxt < 0 || nxt === cur) break;
      const dx = (nxt % width) - (cur % width);
      const dy = Math.floor(nxt / width) - Math.floor(cur / width);
      s += res * Math.hypot(dx, dy);
      cur = nxt;
      pts.push([s, filled[cur]]);
    }
    cur = seed;
    s = 0;
    while (-s < PROFILE_HALF_M) {
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      let donor = -1;
      let donorAcc = -Infinity;
      for (const [ox, oy] of N8) {
        const x2 = cx + ox;
        const y2 = cy + oy;
        if (x2 < 0 || y2 < 0 || x2 >= width || y2 >= height) continue;
        const j = y2 * width + x2;
        if (receiver[j] === cur && result.isStream[j] && result.accumulation[j] > donorAcc) {
          donorAcc = result.accumulation[j];
          donor = j;
        }
      }
      if (donor < 0) break;
      s -= res * Math.hypot((donor % width) - cx, Math.floor(donor / width) - cy);
      cur = donor;
      pts.push([s, filled[cur]]);
    }
    if (pts.length >= 3) {
      const ms = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const mz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      let cov = 0;
      let varS = 0;
      for (const [ps, pz] of pts) {
        cov += (ps - ms) * (pz - mz);
        varS += (ps - ms) ** 2;
      }
      if (varS > 0) {
        slope = Math.min(MAX_SLOPE, Math.max(MIN_SLOPE, -cov / varS));
        slopeSource = 'dem';
      }
    }
  }

  // Warn only when the fill may follow a different channel than the one at the click.
  let seedWarning: string | undefined;
  const near = nearestStream(result.isStream, width, height, px, py, radius);
  const nearestStreamM = Number.isFinite(near.distCells) ? near.distCells * res : null;
  if (seed < 0) {
    seedWarning = 'No river channel was found in the terrain near this point.';
  } else if (nearestStreamM !== null && nearestStreamM > SEED_WARN_M) {
    seedWarning = `The nearest river channel in the terrain is ${(nearestStreamM / 1000).toFixed(1)} km from the river-flow point, so the fill may follow a different channel.`;
  } else if (near.index >= 0 && !mainRiver[near.index] && seedDistM !== null) {
    seedWarning = `The stream nearest the river-flow point is a small tributary; the fill follows the larger river ${(seedDistM / 1000).toFixed(1)} km away.`;
  }

  return {
    hand,
    mainRiver,
    reachMask,
    width,
    height,
    seedFound: seed >= 0,
    seedDistM,
    nearestStreamM,
    seedWarning,
    slope,
    slopeSource,
    cellSizeM: res,
    reachStreamCells,
    reachLengthM: reachStreamCells * res,
  };
}

/** The cheap per-scenario step: stage from the rating curve, then depth over the cached HAND. */
export function simulateField(solved: SolveOutput, options: SimOptions): SimResult {
  const { hand, width, height } = solved;
  const nScale = Number.isFinite(options.nScale) && options.nScale! > 0 ? options.nScale! : 1;
  const nUsed = Math.min(0.2, Math.max(0.01, BASE_N * nScale));
  const q = Number.isFinite(options.q) && options.q > 0 ? options.q : 0;
  const depth = new Float32Array(hand.length);
  const highEdge = new Uint8Array(hand.length);
  const empty: SimResult = {
    depth,
    highEdge,
    stage: { low: 0, central: 0, high: 0 },
    q,
    nUsed,
    slope: solved.slope,
    maxDepth: 0,
    wetShare: 0,
    wetAreaKm2: 0,
    seedWarning: solved.seedWarning,
  };
  if (!solved.seedFound || q <= 0) return empty;

  const raw = stageForDischarge({
    hand,
    reachMask: solved.reachMask,
    cellSizeM: solved.cellSizeM,
    slope: solved.slope,
    n: nUsed,
    q,
  });
  const stage = {
    low: Math.min(MAX_STAGE_M, raw.low),
    central: Math.min(MAX_STAGE_M, raw.central),
    high: Math.min(MAX_STAGE_M, raw.high),
  };
  if (!(stage.central > 0)) return { ...empty, stage };

  const central = depthGrid(hand, stage.central);
  depth.set(central);
  let wet = 0;
  let maxDepth = 0;
  for (let i = 0; i < depth.length; i += 1) {
    if (depth[i] > 0) {
      wet += 1;
      if (depth[i] > maxDepth) maxDepth = depth[i];
    }
  }

  // Boundary of the high-stage wet area: wet cells with a dry (or out-of-grid-safe) 4-neighbour.
  const hi = stage.high;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!(hand[i] < hi)) continue;
      const edge =
        (x > 0 && !(hand[i - 1] < hi)) ||
        (x < width - 1 && !(hand[i + 1] < hi)) ||
        (y > 0 && !(hand[i - width] < hi)) ||
        (y < height - 1 && !(hand[i + width] < hi));
      if (edge) highEdge[i] = 1;
    }
  }

  return {
    depth,
    highEdge,
    stage,
    q,
    nUsed,
    slope: solved.slope,
    maxDepth,
    wetShare: wet / depth.length,
    wetAreaKm2: (wet * solved.cellSizeM * solved.cellSizeM) / 1e6,
    seedWarning: solved.seedWarning,
  };
}
