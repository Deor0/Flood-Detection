import { describe, expect, it, vi } from 'vitest';
import { isUsable, NO_RIVER_MAX_AGE_MS } from '@/core/flood/climatologyCache';
import { dedupe } from '@/core/flood/inflight';
import { mapSettled, parseForecastStats, REACH_CONCURRENCY } from '@/model/geoglows';
import {
  compassDirection,
  normalFlowFor,
  splitSeverity,
  surgeLine,
  wayHomeLabel,
} from '@/app/dashboard/scenario';
import type { FloodData } from '@/app/dashboard/types';

const DAY = 24 * 60 * 60 * 1000;

describe('GEOGloWS forecast band', () => {
  it('keeps the lowest minimum and the highest maximum of each day', () => {
    const band = parseForecastStats({
      datetime: [
        '2026-11-16T00:00:00+00:00',
        '2026-11-16T12:00:00+00:00',
        '2026-11-17T00:00:00+00:00',
      ],
      flow_min: [80, 60, ''],
      flow_25p: [90, 70, 95],
      flow_med: [100, 80, 100],
      flow_75p: [110, 90, 105],
      flow_max: [120, 200, 130],
    });
    expect(band.days).toEqual(['2026-11-16', '2026-11-17']);
    expect(band.band.min).toEqual([60, null]);
    expect(band.band.max).toEqual([200, 130]);
    expect(band.band.median).toEqual([90, 100]);
    expect(band.discharge).toEqual([90, 100]);
  });
});

describe('bounded concurrency and in-flight dedupe', () => {
  it('runs at most the limit at once, keeps order and settles failures', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapSettled([1, 2, 3, 4, 5, 6, 7], REACH_CONCURRENCY, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      if (n === 4) throw new Error('boom');
      return n * 10;
    });
    expect(REACH_CONCURRENCY).toBe(3);
    expect(peak).toBe(3);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([
      10,
      20,
      30,
      'x',
      50,
      60,
      70,
    ]);
  });

  it('shares one promise per key and forgets it once settled (failures are not cached)', async () => {
    const map = new Map<string, Promise<number>>();
    const run = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 7;
    });
    const [a, b] = await Promise.all([dedupe(map, 'k', run), dedupe(map, 'k', run)]);
    expect([a, b]).toEqual([7, 7]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(0);

    const fail = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(dedupe(map, 'f', fail)).rejects.toThrow('down');
    expect(map.size).toBe(0);
    await expect(dedupe(map, 'f', fail)).rejects.toThrow('down');
    expect(fail).toHaveBeenCalledTimes(2);
  });
});

describe('climatology cache ages', () => {
  it('trusts a "no river" verdict for 7 days and a river history for 30', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    expect(NO_RIVER_MAX_AGE_MS).toBe(7 * DAY);
    expect(isUsable({ noRiver: true, updatedAt: ago(6) }, now)).toBe(true);
    expect(isUsable({ noRiver: true, updatedAt: ago(8) }, now)).toBe(false);
    expect(isUsable({ noRiver: false, updatedAt: ago(20) }, now)).toBe(true);
    expect(isUsable({ noRiver: false, updatedAt: ago(31) }, now)).toBe(false);
  });
});

const base: FloodData = {
  snapped: { lat: 0, lng: 0 },
  noRiver: false,
  series: {
    days: ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
    discharge: [10, 30, 20, null, 999],
  },
  current: {
    discharge: 20,
    returnPeriod: 6,
    capped: false,
    severity: 'severe',
    peakDate: null,
  },
  forecast: {
    peakDischarge: 999,
    peakDate: '2026-11-16',
    daysAhead: 1,
    returnPeriod: 25,
    capped: false,
    severity: 'severe',
  },
};

describe('flood desk display helpers', () => {
  it('uses the server normal flow, else the median of past days only', () => {
    expect(normalFlowFor({ ...base, climatology: { years: 40, q2: 1, normalFlow: 42 } })).toBe(42);
    expect(normalFlowFor(base, '2026-11-15')).toBe(20);
  });

  it('splits today and the next 15 days, with a fallback for older saved data', () => {
    expect(splitSeverity(base)).toEqual({ today: 'warning', forecastPeak: 'severe' });
    expect(
      splitSeverity({ ...base, severities: { today: 'watch', forecastPeak: 'normal' } }),
    ).toEqual({ today: 'watch', forecastPeak: 'normal' });
  });

  it('keeps plain words first in the surge line', () => {
    expect(surgeLine('warning', { value: 20, capped: false })).toBe(
      "Warning — Poseidon's surge: about a 1-in-20-year flow",
    );
    expect(surgeLine('severe', { value: 40, capped: true }, 'forecast')).toBe(
      "Severe — Poseidon's surge: more than a 1-in-40-year flow at the forecast peak",
    );
    expect(surgeLine('normal', { value: 1.2, capped: false })).toBeNull();
    expect(surgeLine('unknown', null)).toBeNull();
  });

  it('labels the way home with a computed distance and direction', () => {
    const from = { lat: 27.7, lng: 85.3 };
    expect(compassDirection(from, { lat: 27.705, lng: 85.305 })).toBe('NE');
    expect(compassDirection(from, { lat: 27.69, lng: 85.3 })).toBe('S');
    expect(compassDirection(from, { lat: 27.7, lng: 85.29 })).toBe('W');
    expect(wayHomeLabel(from, { lat: 27.704, lng: 85.3046 }, 637)).toBe(
      'Nearest high ground (Ithaca), ~640 m NE',
    );
    expect(wayHomeLabel(from, { lat: 27.71, lng: 85.3 }, 1234)).toBe(
      'Nearest high ground (Ithaca), ~1.2 km N',
    );
    expect(wayHomeLabel(from, from, 0)).toMatch(/stays dry/);
  });
});
