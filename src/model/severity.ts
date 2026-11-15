import { capReturnPeriod, fitGumbel, quantile, returnPeriod } from '@/model/gumbel';

export type Severity = 'normal' | 'watch' | 'warning' | 'severe' | 'unknown';

/** normal below 2 years, watch from 2, warning from 5, severe from 20. */
export function severityFromReturnPeriod(T: number): Severity {
  if (T >= 20) return 'severe';
  if (T >= 5) return 'warning';
  if (T >= 2) return 'watch';
  return 'normal';
}

export type Classification = {
  severity: Severity;
  /** Display value, capped at 40 years; null when the history is too short. */
  returnPeriod: number | null;
  capped: boolean;
  /** The 2-year discharge (bankfull proxy); null when unknown. */
  q2: number | null;
};

export function classifyDischarge(q: number, annualMax: number[]): Classification {
  const unknown: Classification = {
    severity: 'unknown',
    returnPeriod: null,
    capped: false,
    q2: null,
  };
  if (!Number.isFinite(q)) return unknown;
  const fit = fitGumbel(annualMax);
  if (!fit) return unknown;
  const raw = returnPeriod(q, fit);
  const shown = capReturnPeriod(raw);
  return {
    severity: severityFromReturnPeriod(raw),
    returnPeriod: shown.value,
    capped: shown.capped,
    q2: quantile(2, fit),
  };
}
