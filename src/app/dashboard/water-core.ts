import { computeHand, findSeed } from '@/model/hand';
import { groundResolution } from '@/model/terrarium';

/** Pure, DOM-free part of the water fill. Runs in a Web Worker, or on the main thread as a fallback. */
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

export type SolveOutput = { hand: Float32Array; mainRiver: Uint8Array; seedFound: boolean };

/** About 0.5 km2 of upstream area marks a stream; the seed search reaches about 3 km. */
export function solveField(input: SolveInput): SolveOutput {
  const { elevation, width, height, lat, zoom } = input;
  const res = Math.max(1, groundResolution(lat, zoom));
  const streamThresholdCells = Math.max(50, Math.round(500_000 / (res * res)));
  const radius = Math.max(10, Math.round(3000 / res));

  const result = computeHand({ width, height, elevation }, { streamThresholdCells });
  const seed = findSeed(
    result.accumulation,
    result.isStream,
    width,
    height,
    Math.min(width - 1, Math.max(0, input.px)),
    Math.min(height - 1, Math.max(0, input.py)),
    radius,
  );

  // Keep only streams that carry a meaningful share of the seed river's flow, so a tiny gully
  // does not flood to the discharge of a big river.
  const mainRiver = new Uint8Array(width * height);
  if (seed >= 0) {
    const floor = result.accumulation[seed] * 0.2;
    for (let i = 0; i < mainRiver.length; i += 1) {
      if (result.isStream[i] && result.accumulation[i] >= floor) mainRiver[i] = 1;
    }
  }

  // Each cell drains to a stream along `receiver`; walk down once and remember the answer.
  const hand = Float32Array.from(result.hand);
  const drainsToMain = new Int8Array(width * height); // 0 unknown, 1 yes, -1 no
  const receiver = result.receiver as ArrayLike<number>;
  const path: number[] = [];
  for (let start = 0; start < hand.length; start += 1) {
    if (drainsToMain[start] !== 0) continue;
    path.length = 0;
    let cur = start;
    let verdict = -1;
    for (let guard = 0; guard < hand.length; guard += 1) {
      if (drainsToMain[cur] !== 0) {
        verdict = drainsToMain[cur];
        break;
      }
      path.push(cur);
      if (result.isStream[cur]) {
        verdict = mainRiver[cur] ? 1 : -1;
        break;
      }
      const next = receiver[cur];
      if (next < 0 || next === cur) break;
      cur = next;
    }
    for (const p of path) drainsToMain[p] = verdict;
  }
  for (let i = 0; i < hand.length; i += 1) if (drainsToMain[i] !== 1) hand[i] = Infinity;

  return { hand, mainRiver, seedFound: seed >= 0 };
}
