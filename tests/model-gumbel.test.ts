import { describe, expect, it } from 'vitest';
import {
  annualMaxima,
  capReturnPeriod,
  empiricalReturnPeriod,
  fitGumbel,
  lMoments,
  quantile,
  returnPeriod,
} from '@/model/gumbel';

function yearDays(year: number, count: number, value: number, spike?: number) {
  const days: string[] = [];
  const values: (number | null)[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(year, 0, 1));
    date.setUTCDate(date.getUTCDate() + i);
    days.push(date.toISOString().slice(0, 10));
    values.push(i === 0 && spike !== undefined ? spike : value);
  }
  return { days, values };
}

describe('annual maxima', () => {
  it('keeps one maximum per year and drops a year with fewer than 300 valid days', () => {
    const full = yearDays(2020, 301, 1, 9);
    full.values[10] = null;
    const short = yearDays(2021, 299, 50);
    const next = yearDays(2022, 300, 4);
    const maxima = annualMaxima(
      [...full.days, ...short.days, ...next.days],
      [...full.values, ...short.values, ...next.values],
    );
    expect(maxima).toEqual([9, 4]);
  });
});

describe('Gumbel fit', () => {
  const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('matches the L-moment definitions', () => {
    const moments = lMoments([1, 2, 3, 4]);
    expect(moments.l1).toBeCloseTo(2.5, 10);
    expect(moments.l2).toBeCloseTo(5 / 6, 10);
  });

  it('returns null when there are fewer than 10 maxima or the scale is not positive', () => {
    expect(fitGumbel([1, 2, 3])).toBeNull();
    expect(fitGumbel(Array(10).fill(3))).toBeNull();
  });

  it('fits the sample, and quantile and return period undo each other', () => {
    const fit = fitGumbel(sample);
    expect(fit).not.toBeNull();
    if (!fit) return;
    const moments = lMoments(sample);
    expect(fit.beta).toBeCloseTo(moments.l2 / Math.LN2, 8);
    expect(fit.mu).toBeCloseTo(moments.l1 - 0.5772156649 * fit.beta, 8);
    for (const t of [2, 5, 20]) {
      expect(returnPeriod(quantile(t, fit), fit)).toBeCloseTo(t, 5);
    }
    expect(returnPeriod(quantile(5, fit), fit)).toBeGreaterThan(returnPeriod(quantile(2, fit), fit));
  });

  it('caps the displayed return period at 40 years', () => {
    expect(capReturnPeriod(12)).toEqual({ value: 12, capped: false });
    expect(capReturnPeriod(40)).toEqual({ value: 40, capped: false });
    expect(capReturnPeriod(100)).toEqual({ value: 40, capped: true });
  });

  it('uses the Weibull plotting position', () => {
    expect(empiricalReturnPeriod(3, [1, 2, 3, 4])).toBeCloseTo(2.5, 10);
    expect(empiricalReturnPeriod(4, [1, 2, 3, 4])).toBeCloseTo(5, 10);
  });
});
