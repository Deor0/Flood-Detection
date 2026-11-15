import type { GumbelFit } from '@/model/gumbel';
import type { Severity } from '@/model/severity';

export type { GumbelFit, Severity };

export const FLOOD_ATTRIBUTION = 'Flood data: Open-Meteo.com / Copernicus GloFAS';

/** Body of GET /api/flood. */
export type FloodResponse = {
  /** The river cell the data belongs to (may differ from the click). */
  snapped: { lat: number; lng: number };
  /**
   * Distance in km from the click to the snapped cell centre. Top level (not inside `snapped`)
   * because tests/api-flood.test.ts asserts `snapped` equals exactly { lat, lng }.
   */
  snapDistanceKm: number;
  /** True when no neighbouring cell carries any river flow. */
  noRiver: boolean;
  /** Recent days plus forecast, discharge in m3/s (null = no value). */
  series: { days: string[]; discharge: (number | null)[] };
  climatology: {
    /** Number of hydrological-year maxima used for the fit (current partial year excluded). */
    years: number;
    q2: number | null;
    fit: GumbelFit | null;
    /** Discharge (m3/s) at T = 2, 5, 20, 50, 100 years; empty when there is no fit. T=100 is an extrapolation beyond the record. */
    returnLevels: { T: number; q: number }[];
    /** Bootstrap 90% range of the current return period (years, uncapped); absent without a fit. */
    returnPeriodRange?: { low: number; high: number };
  };
  current: {
    discharge: number | null;
    returnPeriod: number | null;
    capped: boolean;
    /** Headline: the worse of today's severity and the forecast peak's. */
    severity: Severity;
    /** Day the `discharge` value belongs to (the latest non-null day up to today). */
    dischargeDate: string | null;
    /** Forecast peak day, strictly after today (UTC); null when there is no forecast. */
    peakDate: string | null;
    peakDischarge: number | null;
  };
  /** The highest forecast day (after today), classified against the same history. */
  forecast: {
    peakDischarge: number | null;
    peakDate: string | null;
    daysAhead: number | null;
    returnPeriod: number | null;
    capped: boolean;
    severity: Severity;
    /** Forecast spread for the next days (chosen river cell). Absent when the extra request fails. */
    ensemble?: {
      days: string[];
      min: (number | null)[];
      p25: (number | null)[];
      median: (number | null)[];
      p75: (number | null)[];
      max: (number | null)[];
    };
  };
  /** Short plain-language warnings about this result (snap distance, small river, ocean...). */
  caveats: string[];
  place?: string;
  attribution: string;
};
