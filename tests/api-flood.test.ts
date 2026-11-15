import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  geoglowsForecastStats,
  geoglowsRetrospective,
  geoglowsRiverId,
  jsonResponse,
  openMeteoCell,
} from './fixtures/flood';

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth }));

import { GET as floodGet } from '@/app/api/flood/route';
import { GET as demGet } from '@/app/api/dem/route';

const TODAY = '2026-11-15';

function get(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

const ymd = (compact: string) =>
  `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;

/** GEOGloWS replies by endpoint, shaped like the real service. */
function geoglows(url: URL): Response {
  if (url.pathname.endsWith('/getriverid')) return jsonResponse(geoglowsRiverId());
  if (url.pathname.includes('/retrospectivedaily/')) {
    const start = ymd(url.searchParams.get('start_date') ?? '19840101');
    const end = ymd(url.searchParams.get('end_date') ?? TODAY.replace(/-/g, ''));
    // The service lags a few days behind today.
    const last = end > '2026-11-10' ? '2026-11-10' : end;
    return jsonResponse(geoglowsRetrospective(start, last));
  }
  if (url.pathname.includes('/forecaststats/')) return jsonResponse(geoglowsForecastStats(TODAY));
  return jsonResponse({ error: 'not found' }, 404);
}

/** Open-Meteo flood replies: one object, or an array for several points. */
function openMeteo(url: URL): Response {
  // The ensemble request asks for the spread fields; answer it with an error (no band).
  if (url.searchParams.get('daily')?.includes('river_discharge_min')) {
    return jsonResponse({ error: true, reason: 'no ensemble' }, 400);
  }
  const lats = (url.searchParams.get('latitude') ?? '').split(',').map(Number);
  const lngs = (url.searchParams.get('longitude') ?? '').split(',').map(Number);
  const start = url.searchParams.get('start_date') ?? '2026-09-16';
  const end = url.searchParams.get('end_date') ?? '2026-11-30';
  const cells = lats.map((lat, i) => openMeteoCell(lat, lngs[i], start, end));
  return jsonResponse(cells.length === 1 ? cells[0] : cells);
}

type Route = 'ok' | 'down';

/** Routes the mocked fetch by host so each service gets its own recorded-shape reply. */
function mockServices({ geoglows: g = 'ok' as Route } = {}) {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.hostname === 'geoglows.ecmwf.int') {
      return g === 'ok' ? geoglows(url) : jsonResponse({ error: 'down' }, 500);
    }
    if (url.hostname === 'flood-api.open-meteo.com') return openMeteo(url);
    if (url.hostname === 'nominatim.openstreetmap.org') return jsonResponse({ name: 'Testville' });
    return jsonResponse({ error: 'unexpected host' }, 404);
  });
}

beforeEach(() => {
  auth.mockReset();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubEnv('DATABASE_URL', '');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('flood and elevation routes', () => {
  it('answers a signed-out caller and refuses a bad coordinate', async () => {
    auth.mockResolvedValue({ userId: null });
    mockServices();
    expect((await floodGet(get('/api/flood?lat=10&lng=20'))).status).toBe(200);

    expect((await floodGet(get('/api/flood?lat=91&lng=0'))).status).toBe(400);
    expect((await floodGet(get('/api/flood?lat=0&lng=181'))).status).toBe(400);
    expect((await floodGet(get('/api/flood?lat=no&lng=0'))).status).toBe(400);
    expect((await floodGet(get('/api/flood'))).status).toBe(400);
  });

  it('returns severity, the snapped cell, and the GEOGloWS attribution', async () => {
    mockServices();
    const response = await floodGet(get('/api/flood?lat=27.7&lng=85.32'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.noRiver).toBe(false);
    expect(body.snapped).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(body.series.discharge.length).toBeGreaterThan(0);
    expect(body.current).toMatchObject({ severity: expect.any(String) });
    expect(body.severities).toEqual({
      today: expect.any(String),
      forecastPeak: expect.any(String),
    });
    expect(body.climatology.years).toBeGreaterThanOrEqual(40);
    expect(body.climatology.normalFlow).toBeGreaterThan(0);
    expect(body.attribution).toMatch(/GEOGloWS/);
    // The forecast band keeps the day's extremes, not hourly averages.
    const band = body.forecast.ensemble;
    expect(band.days.length).toBeGreaterThan(10);
    const i = 1;
    expect(band.min[i]).toBeLessThanOrEqual(band.p25[i]);
    expect(band.max[i]).toBeGreaterThanOrEqual(band.p75[i]);

    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/getriverid'))).toBe(true);
    expect(urls.some((u) => u.includes('/retrospectivedaily/'))).toBe(true);
    expect(urls.some((u) => u.includes('/forecaststats/'))).toBe(true);
    expect(urls.some((u) => u.includes('open-meteo'))).toBe(false);
  });

  it('falls back to Open-Meteo when GEOGloWS fails', async () => {
    mockServices({ geoglows: 'down' });
    const response = await floodGet(get('/api/flood?lat=-3.1&lng=-60.02'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.noRiver).toBe(false);
    expect(body.attribution).toMatch(/Open-Meteo/);
    expect(body.attribution).toMatch(/GloFAS/);
    expect(body.current).toMatchObject({ severity: expect.any(String) });
    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('geoglows'))).toBe(true);
    expect(urls.some((u) => u.includes('open-meteo'))).toBe(true);
  });

  it('shares one upstream lookup between two clicks on the same cell', async () => {
    mockServices();
    const [a, b] = await Promise.all([
      floodGet(get('/api/flood?lat=45.001&lng=7.001')),
      floodGet(get('/api/flood?lat=45.002&lng=7.002')),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const full = vi
      .mocked(fetch)
      .mock.calls.map((c) => String(c[0]))
      .filter((u) => u.includes('/retrospectivedaily/') && u.includes('start_date=19840101'));
    expect(full).toHaveLength(1);
  });

  it('proxies a terrain tile for anyone, and only a valid tile', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await demGet(get('/api/dem?z=9&x=1&y=1'))).status).toBe(400);
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const ok = await demGet(get('/api/dem?z=12&x=3018&y=1719'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toMatch(/max-age=/);
  });
});
