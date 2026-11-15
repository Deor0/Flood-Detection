/**
 * HAND (Height Above Nearest Drainage) on a small DEM grid.
 *
 * Steps: priority-flood fill (Barnes 2014) from the outlets, flow accumulation in reverse pop order,
 * stream cells, then HAND = filled elevation minus the filled elevation of the stream cell the cell
 * drains to. Deterministic: ties in the queue break by insertion order.
 *
 * Choices the tests lock in (see tests/model-hand.test.ts):
 * - Outlets are edge cells with no strictly lower neighbour. If there are none (a closed bowl), the
 *   lowest cell is the outlet. A V valley whose rim is the grid edge therefore keeps its river.
 * - `accumulation` counts the cell itself plus every cell draining through it; a cell is a stream when
 *   the cells strictly upstream of it number more than `streamThresholdCells`.
 * - A cell's drainage is the first stream downstream whose ground is not higher than the cell's own
 *   ground (a ridge cell that carries a filled pit's spill is not that pit's river).
 */

export type Grid = { width: number; height: number; elevation: Float32Array };

export type HandResult = {
  filled: Float32Array;
  hand: Float32Array;
  accumulation: Float32Array;
  isStream: Uint8Array;
  /** Index of the cell each cell drains to, -1 for outlets. */
  receiver: Int32Array;
};

const EPSILON = 1e-5;

class MinHeap {
  private keys: number[] = [];
  private seqs: number[] = [];
  private cells: number[] = [];
  private counter = 0;
  get size() {
    return this.cells.length;
  }
  private less(i: number, j: number) {
    return (
      this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.seqs[i] < this.seqs[j])
    );
  }
  private swap(i: number, j: number) {
    [this.keys[i], this.keys[j]] = [this.keys[j], this.keys[i]];
    [this.seqs[i], this.seqs[j]] = [this.seqs[j], this.seqs[i]];
    [this.cells[i], this.cells[j]] = [this.cells[j], this.cells[i]];
  }
  push(key: number, cell: number) {
    this.keys.push(key);
    this.seqs.push(this.counter++);
    this.cells.push(cell);
    let i = this.cells.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.cells[0];
    const last = this.cells.length - 1;
    this.swap(0, last);
    this.keys.pop();
    this.seqs.pop();
    this.cells.pop();
    let i = 0;
    const n = this.cells.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

const NEIGHBOURS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function computeHand(grid: Grid, opts: { streamThresholdCells: number }): HandResult {
  const { width, height, elevation } = grid;
  const n = width * height;
  const filled = new Float64Array(n);
  const receiver = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const order: number[] = [];
  const heap = new MinHeap();

  const hasLowerNeighbour = (x: number, y: number) => {
    const e = elevation[y * width + x];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (elevation[ny * width + nx] < e) return true;
    }
    return false;
  };

  // Outlets.
  const seeds: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // A one-row (or one-column) grid is a transect: only its two ends are edges.
      const edge =
        height === 1
          ? x === 0 || x === width - 1
          : width === 1
            ? y === 0 || y === height - 1
            : x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (edge && !hasLowerNeighbour(x, y)) seeds.push(y * width + x);
    }
  }
  if (seeds.length === 0 && n > 0) {
    let low = 0;
    for (let i = 1; i < n; i += 1) if (elevation[i] < elevation[low]) low = i;
    seeds.push(low);
  }
  for (const s of seeds) {
    closed[s] = 1;
    filled[s] = elevation[s];
    heap.push(filled[s], s);
  }

  // Priority flood.
  while (heap.size > 0) {
    const c = heap.pop();
    order.push(c);
    const cx = c % width;
    const cy = (c - cx) / width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (closed[ni]) continue;
      closed[ni] = 1;
      receiver[ni] = c;
      filled[ni] = elevation[ni] > filled[c] ? elevation[ni] : filled[c] + EPSILON;
      heap.push(filled[ni], ni);
    }
  }

  // Accumulation (cell itself included), upstream cells before downstream ones.
  const accumulation = new Float32Array(n);
  for (const c of order) accumulation[c] = 1;
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const c = order[k];
    const r = receiver[c];
    if (r >= 0) accumulation[r] += accumulation[c];
  }

  const isStream = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (closed[i] && accumulation[i] - 1 > opts.streamThresholdCells) isStream[i] = 1;
  }

  // The nearest stream at or below each cell, then skip streams higher than the cell's own ground.
  const firstStream = new Int32Array(n).fill(-1);
  for (const c of order) {
    if (isStream[c]) firstStream[c] = c;
    else if (receiver[c] >= 0) firstStream[c] = firstStream[receiver[c]];
  }
  const hand = new Float32Array(n).fill(Infinity);
  for (const c of order) {
    let s = firstStream[c];
    while (s >= 0 && elevation[s] > elevation[c]) {
      const r = receiver[s];
      s = r >= 0 ? firstStream[r] : -1;
    }
    if (s >= 0) hand[c] = Math.max(0, filled[c] - filled[s]);
  }

  return { filled: Float32Array.from(filled), hand, accumulation, isStream, receiver };
}

/** The stream cell with the largest accumulation within the radius, or -1. */
export function findSeed(
  accumulation: ArrayLike<number>,
  isStream: ArrayLike<boolean | number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radiusCells: number,
): number {
  let best = -1;
  let bestAcc = -Infinity;
  const r = Math.ceil(radiusCells);
  for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy += 1) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx += 1) {
      if ((xx - x) ** 2 + (yy - y) ** 2 > radiusCells ** 2) continue;
      const i = yy * width + xx;
      if (!isStream[i]) continue;
      if (accumulation[i] > bestAcc) {
        bestAcc = accumulation[i];
        best = i;
      }
    }
  }
  return best;
}

/** Water depth for a river rise: rise - hand where hand < rise, otherwise 0. */
export function depthGrid(hand: ArrayLike<number>, rise: number): Float32Array {
  const out = new Float32Array(hand.length);
  for (let i = 0; i < hand.length; i += 1) if (hand[i] < rise) out[i] = rise - hand[i];
  return out;
}
