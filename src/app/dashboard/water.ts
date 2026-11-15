import { depthGrid } from '@/model/hand';
import { decodeTerrarium, tilesForWindow } from '@/model/terrarium';
import { solveField, type SolveInput, type SolveOutput } from './water-core';

/** SIMULATION: terrain-based water fill, computed in the browser from Terrarium tiles. */
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

const Z = 12;
const TILE = 256;

function tileLng(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
function tileLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

async function loadTile(z: number, x: number, y: number, signal: AbortSignal) {
  const res = await fetch(`/api/dem?z=${z}&x=${x}&y=${y}`, { signal });
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

/** Fetches terrain around the point, stitches it, and computes height above nearest drainage. */
export async function buildWaterField(
  lat: number,
  lng: number,
  signal: AbortSignal,
  halfWidthKm = 5,
): Promise<WaterField> {
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

  const data = await Promise.all(tiles.map((t) => loadTile(Z, t.x, t.y, signal)));
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

  const px = Math.round(((lng - west) / (east - west)) * width);
  const py = Math.round(((north - lat) / (north - south)) * height);
  const solved = await solve({ elevation, width, height, px, py, lat, zoom: Z }, signal);

  return {
    width,
    height,
    hand: solved.hand,
    bounds: [south, west, north, east],
    mainRiver: solved.mainRiver,
    seedFound: solved.seedFound,
  };
}

/** Runs the heavy maths in a Web Worker; falls back to the main thread if workers are unavailable. */
function solve(input: SolveInput, signal: AbortSignal): Promise<SolveOutput> {
  if (typeof Worker === 'undefined') return Promise.resolve(solveField(input));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./hand.worker.ts', import.meta.url));
    } catch {
      resolve(solveField(input));
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
    worker.onmessage = (
      e: MessageEvent<{ ok: boolean; error?: string } & Partial<SolveOutput>>,
    ) => {
      done();
      if (e.data.ok && e.data.hand && e.data.mainRiver) {
        resolve({ hand: e.data.hand, mainRiver: e.data.mainRiver, seedFound: !!e.data.seedFound });
      } else {
        reject(new Error(e.data.error ?? 'Terrain calculation failed'));
      }
    };
    worker.onerror = () => {
      // Worker failed to start (for example blocked by the browser): compute here instead.
      done();
      try {
        resolve(solveField(input));
      } catch (err) {
        reject(err);
      }
    };
    worker.postMessage(input);
  });
}

/** Teal ramp: shallow is a saturated teal, deep is dark and solid. Returns a PNG data URL. */
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
    // Saturated teal, clearly different from the pale blue OpenStreetMap uses for water.
    image.data[i * 4] = Math.round(0 + 6 * t);
    image.data[i * 4 + 1] = Math.round(158 - 100 * t);
    image.data[i * 4 + 2] = Math.round(150 - 62 * t);
    image.data[i * 4 + 3] = Math.round(185 + 55 * t);
  }
  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL('image/png'), wetShare: wet / depth.length };
}
