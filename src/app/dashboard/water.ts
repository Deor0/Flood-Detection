import { depthGrid } from '@/model/hand';
import { decodeTerrarium, tilesForWindow } from '@/model/terrarium';
import { RAMP_DEEP, RAMP_SHALLOW } from './ramp';
import {
  simulateField,
  solveField,
  type SimOptions,
  type SimResult,
  type SolveInput,
  type SolveOutput,
  type SolvedMeta,
} from './water-core';

export type { SimOptions, SimResult } from './water-core';

/**
 * SIMULATION: terrain-based water fill, computed in the browser from Terrarium tiles.
 *
 * Scenario API (what the dashboard UI should use):
 *   const terrain = await prepareTerrain(lat, lng, loadTile?, signal | { signal?, halfWidthKm? });
 *   const result  = await simulate(terrain, { q, nScale? });     // fast, repeat for every scenario
 *   const overlay = renderOverlay(terrain, result, { rampMax? }); // { url, bounds, ... } for the map
 *   terrain.dispose();                                           // when the next click replaces it
 */

const Z = 12;
const TILE = 256;

/** RGBA pixels (256 x 256 x 4) of one Terrarium tile. */
export type TileLoader = (
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
) => Promise<Uint8ClampedArray | Uint8Array>;

const NEVER_ABORTED = new AbortController().signal;

/** Fetches an image URL and returns its RGBA pixels. Also useful for a static demo loader. */
export async function fetchTileRgba(url: string, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Terrain tile failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap, 0, 0, TILE, TILE);
  return ctx.getImageData(0, 0, TILE, TILE).data;
}

/** Default loader: our own elevation proxy (public, cached). */
export const defaultTileLoader: TileLoader = (z, x, y, signal) =>
  fetchTileRgba(`/api/dem?z=${z}&x=${x}&y=${y}`, signal);

function tileLng(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
function tileLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

type Stitched = {
  elevation: Float32Array;
  width: number;
  height: number;
  px: number;
  py: number;
  minX: number;
  minY: number;
  /** [south, west, north, east] */
  bounds: [number, number, number, number];
};

async function stitchTerrain(
  lat: number,
  lng: number,
  loadTile: TileLoader,
  signal: AbortSignal | undefined,
  halfWidthKm: number,
): Promise<Stitched> {
  const tiles = tilesForWindow(lat, lng, halfWidthKm, Z);
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = Math.max(...ys) - minY + 1;
  const width = cols * TILE;
  const height = rows * TILE;
  const elevation = new Float32Array(width * height);

  const data = await Promise.all(tiles.map((t) => loadTile(Z, t.x, t.y, signal ?? NEVER_ABORTED)));
  tiles.forEach((t, i) => {
    const px = data[i];
    const ox = (t.x - minX) * TILE;
    const oy = (t.y - minY) * TILE;
    for (let r = 0; r < TILE; r += 1) {
      for (let c = 0; c < TILE; c += 1) {
        const k = (r * TILE + c) * 4;
        elevation[(oy + r) * width + ox + c] = decodeTerrarium(px[k], px[k + 1], px[k + 2]);
      }
    }
  });

  const north = tileLat(minY, Z);
  const south = tileLat(minY + rows, Z);
  const west = tileLng(minX, Z);
  const east = tileLng(minX + cols, Z);
  return {
    elevation,
    width,
    height,
    px: Math.round(((lng - west) / (east - west)) * width),
    py: Math.round(((north - lat) / (north - south)) * height),
    minX,
    minY,
    bounds: [south, west, north, east],
  };
}

/** Grid pixel of a point inside a prepared window (exact in web Mercator), or null outside it. */
export function pixelOf(
  terrain: Pick<TerrainHandle, 'width' | 'height' | 'geo'>,
  lat: number,
  lng: number,
): { x: number; y: number } | null {
  const { minX, minY, z } = terrain.geo;
  const n = 2 ** z;
  const tx = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const ty = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x = Math.round((tx - minX) * TILE);
  const y = Math.round((ty - minY) * TILE);
  if (!(x >= 0 && y >= 0 && x < terrain.width && y < terrain.height)) return null;
  return { x, y };
}

/** Centre of a grid pixel as latitude and longitude. */
export function latLngOf(
  terrain: Pick<TerrainHandle, 'geo'>,
  x: number,
  y: number,
): { lat: number; lng: number } {
  const { minX, minY, z } = terrain.geo;
  return { lat: tileLat(minY + (y + 0.5) / TILE, z), lng: tileLng(minX + (x + 0.5) / TILE, z) };
}

// ---------------------------------------------------------------------------------------------
// Prepared terrain: HAND solved once, scenarios simulated cheaply
// ---------------------------------------------------------------------------------------------

export type Terrain = TerrainHandle;

export type TerrainHandle = {
  width: number;
  height: number;
  /** [south, west, north, east] of the whole stitched window. */
  bounds: [number, number, number, number];
  /** Side of the square window in kilometres (about 10). Say so in the UI. */
  windowKm: number;
  seedFound: boolean;
  /** Set when the fill may follow a different channel than the river-flow point's. */
  seedWarning?: string;
  slope: number;
  slopeSource: 'dem' | 'default';
  cellSizeM: number;
  reachLengthM: number;
  seedDistM: number | null;
  nearestStreamM: number | null;
  /** Window origin in Terrarium tile coordinates (z12), used to place cropped overlays exactly. */
  geo: { minX: number; minY: number; z: number };
  /** Fast: reuses the cached terrain. Rejects with an AbortError after `dispose`. */
  simulate(options: SimOptions): Promise<SimResult>;
  /** Stops the worker. Call when a new click replaces this terrain. */
  dispose(): void;
};

type Backend = {
  meta: SolvedMeta;
  simulate(options: SimOptions): Promise<SimResult>;
  dispose(): void;
};

function localBackend(input: SolveInput): Backend {
  const solved: SolveOutput = solveField(input);
  const { hand: _h, mainRiver: _m, reachMask: _r, ...meta } = solved;
  void _h;
  void _m;
  void _r;
  return {
    meta,
    simulate: (options) => {
      try {
        return Promise.resolve(simulateField(solved, options));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    dispose: () => {},
  };
}

type Pending = { resolve: (r: SimResult) => void; reject: (e: Error) => void };

/** Persistent worker backend; falls back to the main thread if workers are unavailable or fail. */
function workerBackend(input: SolveInput, signal: AbortSignal | undefined): Promise<Backend> {
  if (typeof Worker === 'undefined') return Promise.resolve(localBackend(input));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./hand.worker.ts', import.meta.url));
    } catch {
      resolve(localBackend(input));
      return;
    }
    const pending = new Map<number, Pending>();
    let nextId = 1;
    let ready = false;
    let disposed = false;
    const abortError = () => new DOMException('Aborted', 'AbortError');

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
      for (const p of pending.values()) p.reject(abortError());
      pending.clear();
    };
    const onAbort = () => {
      dispose();
      if (!ready) reject(abortError());
    };
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: 'solved'; ok: boolean; meta?: SolvedMeta; error?: string }
        | { type: 'simulated'; id: number; ok: boolean; result?: SimResult; error?: string };
      if (m.type === 'solved') {
        if (!m.ok || !m.meta) {
          dispose();
          reject(new Error(m.error ?? 'Terrain calculation failed'));
          return;
        }
        ready = true;
        resolve({
          meta: m.meta,
          simulate: (options) =>
            new Promise<SimResult>((res, rej) => {
              if (disposed) {
                rej(abortError());
                return;
              }
              const id = nextId++;
              pending.set(id, { resolve: res, reject: rej });
              worker.postMessage({ type: 'simulate', id, options });
            }),
          dispose,
        });
      } else if (m.type === 'simulated') {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.ok && m.result) p.resolve(m.result);
        else p.reject(new Error(m.error ?? 'Simulation failed'));
      }
    };
    worker.onerror = () => {
      // The worker could not start (for example blocked by the browser): compute here instead.
      if (ready || disposed) return;
      dispose();
      try {
        resolve(localBackend(input));
      } catch (err) {
        reject(err);
      }
    };
    worker.postMessage({ type: 'solve', input });
  });
}

/** Fast: reuses the cached terrain, so call it for every scenario change. */
export function simulate(terrain: TerrainHandle, options: SimOptions): Promise<SimResult> {
  return terrain.simulate(options);
}

export async function prepareTerrain(
  lat: number,
  lng: number,
  loadTile: TileLoader = defaultTileLoader,
  optsOrSignal: AbortSignal | { signal?: AbortSignal; halfWidthKm?: number } = {},
): Promise<TerrainHandle> {
  const opts: { signal?: AbortSignal; halfWidthKm?: number } =
    typeof AbortSignal !== 'undefined' && optsOrSignal instanceof AbortSignal
      ? { signal: optsOrSignal }
      : (optsOrSignal as { signal?: AbortSignal; halfWidthKm?: number });
  const halfWidthKm = opts.halfWidthKm ?? 5;
  const t = await stitchTerrain(lat, lng, loadTile, opts.signal, halfWidthKm);
  const backend = await workerBackend(
    {
      elevation: t.elevation,
      width: t.width,
      height: t.height,
      px: t.px,
      py: t.py,
      lat,
      zoom: Z,
    },
    opts.signal,
  );
  const m = backend.meta;
  return {
    width: t.width,
    height: t.height,
    bounds: t.bounds,
    windowKm: halfWidthKm * 2,
    seedFound: m.seedFound,
    seedWarning: m.seedWarning,
    slope: m.slope,
    slopeSource: m.slopeSource,
    cellSizeM: m.cellSizeM,
    reachLengthM: m.reachLengthM,
    seedDistM: m.seedDistM,
    nearestStreamM: m.nearestStreamM,
    geo: { minX: t.minX, minY: t.minY, z: Z },
    simulate: backend.simulate,
    dispose: backend.dispose,
  };
}

// ---------------------------------------------------------------------------------------------
// Overlay rendering
// ---------------------------------------------------------------------------------------------

export type Overlay = {
  /** PNG data URL; empty when nothing is wet. */
  url: string;
  /** [south, west, north, east] of the cropped image (exact in the map's projection). */
  bounds: [number, number, number, number];
  /** Depth at which the ramp is darkest, in metres. Use it for the map legend. */
  rampMax: number;
  maxDepth: number;
  wetShare: number;
};

/**
 * Teal ramp: shallow is a saturated teal, deep is dark and solid. The dashed outline marks the
 * upper edge of the likely range (high-stage contour). The image is cropped to the wet area, so
 * drawing it stays cheap for small floods.
 */
export function renderOverlay(
  terrain: Pick<TerrainHandle, 'width' | 'height' | 'bounds' | 'geo'>,
  result: SimResult,
  opts: { rampMax?: number; outline?: boolean } = {},
): Overlay {
  const { width, height } = terrain;
  const rampMax = opts.rampMax && opts.rampMax > 0 ? opts.rampMax : Math.max(result.maxDepth, 0.5);
  const outline = opts.outline !== false;
  const none: Overlay = {
    url: '',
    bounds: terrain.bounds,
    rampMax,
    maxDepth: result.maxDepth,
    wetShare: result.wetShare,
  };

  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (result.depth[i] > 0 || (outline && result.highEdge[i])) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return none;
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(width - 1, x1 + 1);
  y1 = Math.min(height - 1, y1 + 1);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  const canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return none;
  const image = ctx.createImageData(bw, bh);
  for (let y = 0; y < bh; y += 1) {
    for (let x = 0; x < bw; x += 1) {
      const i = (y + y0) * width + (x + x0);
      const o = (y * bw + x) * 4;
      const d = result.depth[i];
      if (d > 0) {
        const t = Math.min(1, d / rampMax);
        image.data[o] = Math.round(RAMP_SHALLOW[0] + (RAMP_DEEP[0] - RAMP_SHALLOW[0]) * t);
        image.data[o + 1] = Math.round(RAMP_SHALLOW[1] + (RAMP_DEEP[1] - RAMP_SHALLOW[1]) * t);
        image.data[o + 2] = Math.round(RAMP_SHALLOW[2] + (RAMP_DEEP[2] - RAMP_SHALLOW[2]) * t);
        image.data[o + 3] = Math.round(185 + 55 * t);
      }
      // Dashed outline: every other 4-pixel run along the boundary.
      if (outline && result.highEdge[i] && (((x + y) >> 2) & 1) === 0) {
        image.data[o] = 10;
        image.data[o + 1] = 50;
        image.data[o + 2] = 70;
        image.data[o + 3] = 235;
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  const { minX, minY, z } = terrain.geo;
  const north = tileLat(minY + y0 / TILE, z);
  const south = tileLat(minY + (y1 + 1) / TILE, z);
  const west = tileLng(minX + x0 / TILE, z);
  const east = tileLng(minX + (x1 + 1) / TILE, z);
  return {
    url: canvas.toDataURL('image/png'),
    bounds: [south, west, north, east],
    rampMax,
    maxDepth: result.maxDepth,
    wetShare: result.wetShare,
  };
}

// ---------------------------------------------------------------------------------------------
// Legacy one-shot API (kept so the current FloodDesk keeps working until the UI moves over)
// ---------------------------------------------------------------------------------------------

export type WaterField = {
  width: number;
  height: number;
  hand: Float32Array;
  /** [south, west, north, east] */
  bounds: [number, number, number, number];
  /** Pixels belonging to the stream network connected to the seed river. */
  mainRiver: Uint8Array;
  seedFound: boolean;
};

/** Fetches terrain around the point, stitches it, and computes height above nearest drainage. */
export async function buildWaterField(
  lat: number,
  lng: number,
  signal: AbortSignal,
  halfWidthKm = 5,
): Promise<WaterField> {
  const t = await stitchTerrain(lat, lng, defaultTileLoader, signal, halfWidthKm);
  const solved = await solveLegacy(
    {
      elevation: t.elevation,
      width: t.width,
      height: t.height,
      px: t.px,
      py: t.py,
      lat,
      zoom: Z,
    },
    signal,
  );
  return {
    width: t.width,
    height: t.height,
    hand: solved.hand,
    bounds: t.bounds,
    mainRiver: solved.mainRiver,
    seedFound: solved.seedFound,
  };
}

function solveLegacy(
  input: SolveInput,
  signal: AbortSignal,
): Promise<Pick<SolveOutput, 'hand' | 'mainRiver' | 'seedFound'>> {
  const local = () => {
    const out = solveField(input);
    return { hand: out.hand, mainRiver: out.mainRiver, seedFound: out.seedFound };
  };
  if (typeof Worker === 'undefined') return Promise.resolve(local());
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./hand.worker.ts', import.meta.url));
    } catch {
      resolve(local());
      return;
    }
    const done = () => {
      worker.terminate();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      done();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as {
        ok: boolean;
        error?: string;
        hand?: Float32Array;
        mainRiver?: Uint8Array;
        seedFound?: boolean;
      };
      done();
      if (m.ok && m.hand && m.mainRiver) {
        resolve({ hand: m.hand, mainRiver: m.mainRiver, seedFound: !!m.seedFound });
      } else {
        reject(new Error(m.error ?? 'Terrain calculation failed'));
      }
    };
    worker.onerror = () => {
      done();
      try {
        resolve(local());
      } catch (err) {
        reject(err);
      }
    };
    worker.postMessage({ type: 'legacy', input });
  });
}

/** Legacy: teal ramp for an assumed rise above the nearest stream. Returns a PNG data URL. */
export function renderDepth(field: WaterField, rise: number): { url: string; wetShare: number } {
  const depth = depthGrid(field.hand, rise);
  const canvas = document.createElement('canvas');
  canvas.width = field.width;
  canvas.height = field.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { url: '', wetShare: 0 };
  const image = ctx.createImageData(field.width, field.height);
  let wet = 0;
  const top = Math.max(rise, 0.5);
  for (let i = 0; i < depth.length; i += 1) {
    const d = depth[i];
    if (d <= 0) continue;
    wet += 1;
    const t = Math.min(1, d / top);
    image.data[i * 4] = Math.round(RAMP_SHALLOW[0] + (RAMP_DEEP[0] - RAMP_SHALLOW[0]) * t);
    image.data[i * 4 + 1] = Math.round(RAMP_SHALLOW[1] + (RAMP_DEEP[1] - RAMP_SHALLOW[1]) * t);
    image.data[i * 4 + 2] = Math.round(RAMP_SHALLOW[2] + (RAMP_DEEP[2] - RAMP_SHALLOW[2]) * t);
    image.data[i * 4 + 3] = Math.round(185 + 55 * t);
  }
  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL('image/png'), wetShare: wet / depth.length };
}
