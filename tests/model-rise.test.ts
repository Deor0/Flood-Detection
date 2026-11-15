import { describe, expect, it } from 'vitest';
import { riseAboveBankfull } from '@/model/rise';

describe('rise above bankfull', () => {
  it('is zero at bankfull, about 2.48 m at five times bankfull, and zero for bad inputs', () => {
    expect(riseAboveBankfull(10, 10)).toBe(0);
    expect(riseAboveBankfull(5, 10)).toBe(0);
    expect(riseAboveBankfull(50, 10)).toBeCloseTo(2 * (Math.sqrt(5) - 1), 5);
    expect(riseAboveBankfull(10, 0)).toBe(0);
    expect(riseAboveBankfull(Number.NaN, 10)).toBe(0);
    expect(riseAboveBankfull(30, 10)).toBeGreaterThan(riseAboveBankfull(20, 10));
  });
});
