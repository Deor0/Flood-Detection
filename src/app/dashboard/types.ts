/** What the page reads from `GET /api/flood`. Kept local so the UI does not depend on server files. */
export type Severity = 'normal' | 'watch' | 'warning' | 'severe' | 'unknown';

export type FloodData = {
  snapped: { lat: number; lng: number };
  noRiver: boolean;
  series?: { days: string[]; discharge: (number | null)[] };
  climatology?: { years: number; q2: number | null };
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
  };
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
