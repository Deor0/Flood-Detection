import { describe, expect, it } from 'vitest';
import {
  AREAS,
  DEFAULT_LEADS,
  LEAD_OPTIONS,
  TOTAL_AFFECTED,
  estimate,
  shareForLead,
} from '@/app/nepal-impact-model';

const leadsAll = (minutes: number) => Object.fromEntries(AREAS.map((a) => [a.id, minutes]));

describe('Nepal what-if arithmetic', () => {
  it('per-area affected estimates add up to the EMSR927 headline of 7,600', () => {
    expect(TOTAL_AFFECTED).toBe(7600);
  });

  it('lists areas upstream first', () => {
    expect(AREAS[0].name).toBe('Timure');
    expect(AREAS.at(-1)?.name).toBe('Phosretar');
  });

  it('maps a warning time to the assumed share, stepping down to the nearest option', () => {
    expect(shareForLead(0)).toBe(0);
    expect(shareForLead(15)).toBe(0.25);
    expect(shareForLead(59)).toBe(0.25);
    expect(shareForLead(60)).toBe(0.5);
    expect(shareForLead(10_000)).toBe(LEAD_OPTIONS.at(-1)?.share);
    expect(shareForLead(-5)).toBe(0);
  });

  it('with no warning time nobody can move, however many are warned', () => {
    expect(estimate(100, leadsAll(0)).moved).toBe(0);
  });

  it('never claims everyone could move', () => {
    const best = estimate(100, leadsAll(360));
    expect(best.warned).toBe(7600);
    expect(best.moved).toBe(Math.round(7600 * 0.9));
    expect(best.moved).toBeLessThan(TOTAL_AFFECTED);
  });

  it('scales each area by warned% × share(lead time)', () => {
    const r = estimate(50, { timure: 0, syapru: 15, bidur: 60, phosretar: 180 });
    expect(r.areas.map((a) => a.moved)).toEqual([0, 56, 1250, 638]);
    expect(r.warned).toBe(3800);
    expect(r.moved).toBe(Math.round(450 * 0.5 * 0.25 + 5000 * 0.5 * 0.5 + 1700 * 0.5 * 0.75));
  });

  it('clamps out-of-range percentages and falls back to default lead times', () => {
    expect(estimate(150, DEFAULT_LEADS)).toEqual(estimate(100, DEFAULT_LEADS));
    expect(estimate(-10, DEFAULT_LEADS).warned).toBe(0);
    expect(estimate(Number.NaN, DEFAULT_LEADS).moved).toBe(0);
    expect(estimate(80, {})).toEqual(estimate(80, DEFAULT_LEADS));
  });
});
