import { describe, expect, it } from 'vitest';
import { classifyDischarge, severityFromReturnPeriod } from '@/model/severity';

describe('severity from return period', () => {
  it('uses the 2, 5 and 20 year boundaries', () => {
    expect(severityFromReturnPeriod(1.999)).toBe('normal');
    expect(severityFromReturnPeriod(2)).toBe('watch');
    expect(severityFromReturnPeriod(4.999)).toBe('watch');
    expect(severityFromReturnPeriod(5)).toBe('warning');
    expect(severityFromReturnPeriod(19.999)).toBe('warning');
    expect(severityFromReturnPeriod(20)).toBe('severe');
  });

  it('stays unknown when fewer than 10 yearly maxima exist', () => {
    const result = classifyDischarge(100, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.severity).toBe('unknown');
    expect(result.returnPeriod).toBeNull();
  });

  it('returns a capped return period and the 2-year discharge when history is long enough', () => {
    const annual = [10, 12, 11, 13, 14, 9, 15, 16, 8, 20];
    const result = classifyDischarge(40, annual);
    expect(result.severity).not.toBe('unknown');
    expect(typeof result.returnPeriod).toBe('number');
    expect(typeof result.q2).toBe('number');
    expect(typeof result.capped).toBe('boolean');
    if (result.returnPeriod !== null && result.returnPeriod > 40) {
      expect(result.capped).toBe(true);
    }
  });
});
