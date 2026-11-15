import type { GumbelFit } from '@/model/gumbel';
import type { Severity } from '@/model/severity';

export type { GumbelFit, Severity };

export const FLOOD_ATTRIBUTION = 'Flood data: Open-Meteo.com / Copernicus GloFAS';

/** Body of GET /api/flood. */
export type FloodResponse = {
  /** The river cell the data belongs to (may differ from the click). */
  snapped: { lat: number; lng: number };
  /** True when no neighbouring cell carries any river flow. */
  noRiver: boolean;
  /** Recent days plus forecast, discharge in m3/s (null = no value). */
  series: { days: string[]; discharge: (number | null)[] };
  climatology: { years: number; q2: number | null; fit: GumbelFit | null };
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
  };
  place?: string;
  attribution: string;
};
