import { describe, expect, it } from 'vitest';
import {
  decodeTerrarium,
  groundResolution,
  tileForLatLng,
  tilesForWindow,
} from '@/model/terrarium';

describe('Terrarium tiles', () => {
  it('decodes elevation and the Kathmandu tile', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(133, 14, 0)).toBe(1294);
    expect(tileForLatLng(27.7, 85.32, 12)).toEqual({ x: 3018, y: 1719 });
    const metres = 156543.03392 * Math.cos((27.7 * Math.PI) / 180) / 2 ** 12;
    expect(groundResolution(27.7, 12)).toBeCloseTo(metres, 5);
    expect(groundResolution(27.7, 12)).toBeCloseTo(33.8, 1);
  });

  it('covers a 10 km window with a handful of tiles', () => {
    const tiles = tilesForWindow(27.7, 85.32, 5, 12);
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(9);
    expect(tiles).toContainEqual(tileForLatLng(27.7, 85.32, 12));
  });
});
