import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth }));

import { GET as floodGet } from '@/app/api/flood/route';
import { GET as demGet } from '@/app/api/dem/route';

function get(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

beforeEach(() => {
  auth.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('flood and elevation routes', () => {
  it('refuses a signed-out caller and a bad coordinate', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await floodGet(get('/api/flood?lat=1&lng=2'))).status).toBe(401);

    auth.mockResolvedValue({ userId: 'user_1' });
    expect((await floodGet(get('/api/flood?lat=91&lng=0'))).status).toBe(400);
    expect((await floodGet(get('/api/flood?lat=0&lng=181'))).status).toBe(400);
    expect((await floodGet(get('/api/flood?lat=no&lng=0'))).status).toBe(400);
    expect((await floodGet(get('/api/flood'))).status).toBe(400);
  });

  it('returns severity, the snapped cell, and the attribution', async () => {
    auth.mockResolvedValue({ userId: 'user_1' });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          latitude: 27.7,
          longitude: 85.32,
          daily: {
            time: Array.from({ length: 400 }, (_, i) => `2020-01-${String((i % 28) + 1).padStart(2, '0')}`),
            river_discharge: Array.from({ length: 400 }, () => 10),
          },
        }),
        { status: 200 },
      ),
    );
    const response = await floodGet(get('/api/flood?lat=27.7&lng=85.32'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapped).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(body.series.discharge.length).toBeGreaterThan(0);
    expect(body.current).toMatchObject({ severity: expect.any(String) });
    expect(body.attribution).toMatch(/Open-Meteo/);
    expect(body.attribution).toMatch(/GloFAS/);
  });

  it('proxies a terrain tile only for a signed-in caller and a valid tile', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await demGet(get('/api/dem?z=12&x=3018&y=1719'))).status).toBe(401);

    auth.mockResolvedValue({ userId: 'user_1' });
    expect((await demGet(get('/api/dem?z=9&x=1&y=1'))).status).toBe(400);
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const ok = await demGet(get('/api/dem?z=12&x=3018&y=1719'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toMatch(/max-age=/);
  });
});
