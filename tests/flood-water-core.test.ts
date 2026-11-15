import { describe, expect, it } from 'vitest';
import { findHighGround, simulateField, type SolveOutput } from '@/app/dashboard/water-core';
import { stageForDischarge } from '@/model/rating';

const W = 61;
const H = 61;
const CELL = 30;
const RIVER_X = 30;

/** A straight V valley running north-south: HAND rises 0.5 m per cell away from the river. */
function valley(): SolveOutput {
  const hand = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) hand[y * W + x] = Math.abs(x - RIVER_X) * 0.5;
  }
  const mainRiver = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) mainRiver[y * W + RIVER_X] = 1;
  return {
    hand,
    mainRiver,
    reachMask: new Uint8Array(W * H).fill(1),
    width: W,
    height: H,
    seedFound: true,
    seedDistM: 0,
    nearestStreamM: 0,
    slope: 0.001,
    slopeSource: 'dem',
    cellSizeM: CELL,
    reachStreamCells: H,
    reachLengthM: H * CELL,
    px: RIVER_X,
    py: 30,
  };
}

const wetCells = (depth: Float32Array) => depth.reduce((n, d) => n + (d > 0 ? 1 : 0), 0);

describe('water fill: excess stage over the normal river level', () => {
  it('draws nothing when the flow is the normal flow', () => {
    const sim = simulateField(valley(), { q: 400, qBase: 400 });
    expect(sim.stage).toEqual({ low: 0, central: 0, high: 0 });
    expect(sim.baseStage).toBeGreaterThan(0);
    expect(wetCells(sim.depth)).toBe(0);
    expect(sim.highGround).toBeNull();
  });

  it('floods only by stage(Q) - stage(Q_base)', () => {
    const solved = valley();
    const rating = {
      hand: solved.hand,
      reachMask: solved.reachMask,
      cellSizeM: CELL,
      slope: solved.slope,
      n: 0.05,
    };
    const full = stageForDischarge({ ...rating, q: 2000 }).central;
    const base = stageForDischarge({ ...rating, q: 400 }).central;

    const sim = simulateField(solved, { q: 2000, qBase: 400 });
    expect(sim.qBase).toBe(400);
    expect(sim.baseStage).toBeCloseTo(base, 6);
    expect(sim.stage.central).toBeCloseTo(full - base, 6);
    expect(sim.stage.low).toBeLessThanOrEqual(sim.stage.central);
    expect(sim.stage.high).toBeGreaterThanOrEqual(sim.stage.central);

    const old = simulateField(solved, { q: 2000 });
    expect(old.stage.central).toBeCloseTo(full, 6);
    expect(wetCells(sim.depth)).toBeLessThan(wetCells(old.depth));
    expect(wetCells(sim.depth)).toBeGreaterThan(0);
  });

  it('ignores a bad or missing Q_base', () => {
    const a = simulateField(valley(), { q: 1000 });
    const b = simulateField(valley(), { q: 1000, qBase: Number.NaN });
    const c = simulateField(valley(), { q: 1000, qBase: -5 });
    expect(b.stage.central).toBeCloseTo(a.stage.central, 9);
    expect(c.stage.central).toBeCloseTo(a.stage.central, 9);
    expect(a.baseStage).toBe(0);
  });

  it('lower flow than normal never draws negative water', () => {
    const sim = simulateField(valley(), { q: 100, qBase: 400 });
    expect(sim.stage.central).toBe(0);
    expect(wetCells(sim.depth)).toBe(0);
  });
});

describe('way home: nearest high ground', () => {
  it('finds the nearest dry cell above the high stage plus a margin', () => {
    const solved = valley();
    const sim = simulateField(solved, { q: 2000, qBase: 400 });
    const hg = sim.highGround;
    expect(hg).not.toBeNull();
    if (!hg) return;
    expect(solved.hand[hg.y * W + hg.x]).toBeGreaterThanOrEqual(sim.stage.high + 1);
    // Straight across the valley from the river: same row, and the distance is computed.
    expect(hg.y).toBe(30);
    expect(hg.distM).toBeCloseTo(Math.abs(hg.x - RIVER_X) * CELL, 6);
    // Its riverward neighbour is dry too (no lone pixel), and one step nearer would not be.
    const need = sim.stage.high + 1;
    const d = Math.abs(hg.x - RIVER_X);
    expect((d - 1) * 0.5).toBeGreaterThanOrEqual(need);
    expect((d - 2) * 0.5).toBeLessThan(need);
  });

  it('starts from the given origin', () => {
    const solved = valley();
    const sim = simulateField(solved, { q: 2000, qBase: 400, origin: { x: 35, y: 10 } });
    expect(sim.highGround).toMatchObject({ fromX: 35, fromY: 10, y: 10 });
    expect(sim.highGround!.x).toBeGreaterThan(RIVER_X);
  });

  it('skips a lone dry pixel and returns null when nothing in the window is dry', () => {
    const hand = new Float32Array(25).fill(0);
    hand[12] = 100; // one dry pixel in the middle, all neighbours wet
    expect(findHighGround(hand, 5, 5, 0, 0, 1, 30)).toBeNull();
    const flat = new Float32Array(25).fill(Infinity);
    expect(findHighGround(flat, 5, 5, 2, 2, 1, 30)).toMatchObject({ x: 2, y: 2, distM: 0 });
  });
});
