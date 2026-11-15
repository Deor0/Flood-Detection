/** AWS Terrarium elevation tiles: decoding and Web Mercator tile maths. */

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export function tileForLatLng(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const max = n - 1;
  return { x: Math.min(max, Math.max(0, x)), y: Math.min(max, Math.max(0, y)) };
}

/** Metres per pixel of a 256 px tile at this latitude and zoom. */
export function groundResolution(lat: number, z: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** Every tile that covers a square window of +-halfWidthKm around the point. */
export function tilesForWindow(
  lat: number,
  lng: number,
  halfWidthKm: number,
  z: number,
): { x: number; y: number }[] {
  const dLat = halfWidthKm / 111.32;
  const dLng = halfWidthKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const north = Math.min(85.05, lat + dLat);
  const south = Math.max(-85.05, lat - dLat);
  const nw = tileForLatLng(north, Math.max(-180, lng - dLng), z);
  const se = tileForLatLng(south, Math.min(179.999999, lng + dLng), z);
  const tiles: { x: number; y: number }[] = [];
  for (let y = nw.y; y <= se.y; y += 1) {
    for (let x = nw.x; x <= se.x; x += 1) tiles.push({ x, y });
  }
  return tiles;
}
