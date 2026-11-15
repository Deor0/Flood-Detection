import { describe, expect, it } from 'vitest';
import { computeHand, depthGrid, findSeed } from '@/model/hand';

function grid(width: number, height: number, elevation: number[]) {
  return { width, height, elevation: Float32Array.from(elevation) };
}

describe('height above nearest drainage', () => {
  it('wets a V-shaped valley from the centre outward and leaves the banks dry', () => {
    const result = computeHand(grid(5, 1, [5, 3, 1, 3, 5]), { streamThresholdCells: 1 });
    expect(Array.from(result.hand)).toEqual([4, 2, 0, 2, 4]);
    expect(Array.from(depthGrid(result.hand, 3))).toEqual([0, 1, 3, 1, 0]);
  });

  it('keeps a pit behind a ridge dry until the rise clears the ridge', () => {
    const result = computeHand(grid(5, 1, [1, 8, 2, 9, 9]), { streamThresholdCells: 1 });
    expect(result.hand[2]).toBeGreaterThanOrEqual(7);
    expect(depthGrid(result.hand, 3)[2]).toBe(0);
    expect(depthGrid(result.hand, result.hand[2] + 1)[2]).toBeGreaterThan(0);
  });

  it('stays dry and finite when nothing is a stream', () => {
    const result = computeHand(grid(3, 1, [4, 2, 3]), { streamThresholdCells: 1_000_000 });
    expect(Array.from(depthGrid(result.hand, 5))).toEqual([0, 0, 0]);
    const again = computeHand(grid(3, 1, [4, 2, 3]), { streamThresholdCells: 1_000_000 });
    expect(Array.from(again.hand)).toEqual(Array.from(result.hand));
  });

  it('handles a single column and a flat plain', () => {
    const column = computeHand(grid(1, 4, [4, 3, 2, 1]), { streamThresholdCells: 1 });
    expect(column.hand).toHaveLength(4);
    expect(Array.from(column.hand).every((n) => Number.isFinite(n) || n === Infinity)).toBe(true);
    const plain = computeHand(grid(3, 3, Array(9).fill(5)), { streamThresholdCells: 1 });
    expect(Array.from(depthGrid(plain.hand, 0)).every((n) => n === 0)).toBe(true);
  });

  it('picks the largest stream inside the radius', () => {
    const accumulation = Float32Array.from([0, 5, 9, 2]);
    const isStream = [false, true, true, false];
    expect(findSeed(accumulation, isStream, 4, 1, 0, 0, 3)).toBe(2);
    expect(findSeed(accumulation, isStream, 4, 1, 0, 0, 0)).toBe(-1);
  });
});
