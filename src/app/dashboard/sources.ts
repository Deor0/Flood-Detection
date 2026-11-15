import { defaultTileLoader, type TileLoader } from './water';
import type { FloodData } from './types';

export type { TileLoader };

/** Where the desk gets its data: live routes by default, saved files for the public demo. */
export type FloodSource = {
  loadFlood: (lat: number, lng: number, signal: AbortSignal) => Promise<FloodData>;
  loadTile: TileLoader;
};

const TILE = 256;

/** Decodes a PNG tile into RGBA bytes (used by the public demo's saved tiles). */
export async function decodeTile(blob: Blob): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap, 0, 0, TILE, TILE);
  return ctx.getImageData(0, 0, TILE, TILE).data;
}

export const liveSource: FloodSource = {
  async loadFlood(lat, lng, signal) {
    const res = await fetch(`/api/flood?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, { signal });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Please sign in again.');
      // The server explains itself (for example a rate limit); show that, not just the number.
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const reason = typeof body?.error === 'string' ? body.error : null;
      throw new Error(reason ?? `The flood service answered ${res.status}.`);
    }
    return (await res.json()) as FloodData;
  },
  loadTile: defaultTileLoader,
};
