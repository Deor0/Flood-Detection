import type { GumbelFit } from '@/model/gumbel';

/** What the page reads from `GET /api/flood`. Kept local so the UI does not depend on server files. */
export type Severity = 'normal' | 'watch' | 'warning' | 'severe' | 'unknown';

export type FloodData = {
  snapped: { lat: number; lng: number };
  /** Distance in km from the click to the river cell the data belongs to. */
  snapDistanceKm?: number;
  noRiver: boolean;
  series?: { days: string[]; discharge: (number | null)[] };
  climatology?: {
    years: number;
    q2: number | null;
    fit?: GumbelFit | null;
    /** Discharge (m3/s) at T = 2, 5, 20, 50, 100 years. */
    returnLevels?: { T: number; q: number }[];
    /** Bootstrap range of the current return period, in years. */
    returnPeriodRange?: { low: number; high: number };
    /** Long-term average flow, m3/s: the level the terrain already shows as water. */
    normalFlow?: number | null;
  };
  /** Today's severity and the forecast peak's. Older saved demo data may not have it. */
  severities?: { today: Severity; forecastPeak: Severity };
  current?: {
    discharge: number | null;
    returnPeriod: number | null;
    capped: boolean;
    severity: Severity;
    dischargeDate?: string | null;
    peakDate: string | null;
    peakDischarge?: number | null;
  };
  forecast?: {
    peakDischarge: number | null;
    peakDate: string | null;
    daysAhead: number | null;
    returnPeriod: number | null;
    capped: boolean;
    severity: Severity;
    ensemble?: {
      days: string[];
      min: (number | null)[];
      p25: (number | null)[];
      median: (number | null)[];
      p75: (number | null)[];
      max: (number | null)[];
    };
  };
  /** Short plain-language warnings about this result. */
  caveats?: string[];
  place?: string | null;
  attribution?: string;
};

export type Replay = {
  title?: string;
  note?: string;
  limitations: string[];
  sources: { name: string; url: string; license?: string }[];
  series: {
    name: string;
    unit?: string;
    source: string;
    asOf: string;
    days?: string[];
    values: number[];
  }[];
  timeline: { at: string; text: string; source: string }[];
  impacts: { label: string; value: string; asOf: string; source: string }[];
};
