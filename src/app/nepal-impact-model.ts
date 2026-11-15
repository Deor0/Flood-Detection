/**
 * Arithmetic for the Nepal what-if. Affected-population figures are Copernicus EMS EMSR927
 * estimates per area of interest (latest map of each area; they add up to the 7,600 headline).
 * Warning times and the share of people who could reach high ground in that time are
 * ILLUSTRATIVE ASSUMPTIONS, not measurements or forecasts.
 */

export type Area = {
  id: string;
  name: string;
  /** Plain position along the river, upstream first. */
  where: string;
  /** EMSR927 estimated affected population in this area of interest. */
  affected: number;
  /** Starting guess for the warning time, in minutes. Not a measured travel time. */
  defaultLead: number;
};

/** Upstream to downstream along the Bhote Koshi and Trishuli (EMSR927 areas with population estimates). */
export const AREAS: Area[] = [
  {
    id: 'timure',
    name: 'Timure',
    where: 'at the border, furthest upstream',
    affected: 450,
    defaultLead: 0,
  },
  { id: 'syapru', name: 'Syapru Besi', where: 'upstream', affected: 450, defaultLead: 15 },
  { id: 'bidur', name: 'Bidur', where: 'downstream, Trishuli', affected: 5000, defaultLead: 60 },
  {
    id: 'phosretar',
    name: 'Phosretar',
    where: 'further downstream',
    affected: 1700,
    defaultLead: 180,
  },
];

export type LeadOption = { minutes: number; label: string; share: number };

/** Assumed share of warned people who can reach high ground in the time they have. Illustrative. */
export const LEAD_OPTIONS: LeadOption[] = [
  { minutes: 0, label: 'No warning', share: 0 },
  { minutes: 15, label: '15 minutes', share: 0.25 },
  { minutes: 60, label: '1 hour', share: 0.5 },
  { minutes: 180, label: '3 hours', share: 0.75 },
  { minutes: 360, label: '6 hours or more', share: 0.9 },
];

export const TOTAL_AFFECTED = AREAS.reduce((sum, area) => sum + area.affected, 0);

export function shareForLead(minutes: number): number {
  let share = 0;
  for (const option of LEAD_OPTIONS) if (minutes >= option.minutes) share = option.share;
  return share;
}

const clampPercent = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

export type AreaResult = { id: string; affected: number; warned: number; moved: number };

/**
 * people warned = affected × warned%; people who could move = warned × share(lead time).
 * Totals are summed before rounding so they never drift from the per-area figures by more than
 * rounding.
 */
export function estimate(
  warnedPercent: number,
  leads: Record<string, number>,
): { areas: AreaResult[]; warned: number; moved: number } {
  const pct = clampPercent(warnedPercent) / 100;
  let warned = 0;
  let moved = 0;
  const areas = AREAS.map((area) => {
    const w = area.affected * pct;
    const m = w * shareForLead(leads[area.id] ?? area.defaultLead);
    warned += w;
    moved += m;
    return { id: area.id, affected: area.affected, warned: Math.round(w), moved: Math.round(m) };
  });
  return { areas, warned: Math.round(warned), moved: Math.round(moved) };
}

export const DEFAULT_LEADS: Record<string, number> = Object.fromEntries(
  AREAS.map((area) => [area.id, area.defaultLead]),
);
