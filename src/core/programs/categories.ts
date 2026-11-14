import type { ProgramCategory } from '@/db/schema';

export const CATEGORY_LABELS: Record<ProgramCategory, string> = {
  first_aid_cpr: 'First Aid & CPR',
  flood_landslide_safety: 'Flood & Landslide Safety',
  volunteer_briefing: 'Volunteer Briefings',
  evacuation_drill: 'Evacuation Drills',
  water_sanitation: 'Water Sanitation',
};

/** Singular badge text on a program card. */
export const CATEGORY_BADGES: Record<ProgramCategory, string> = {
  first_aid_cpr: 'FIRST AID & CPR',
  flood_landslide_safety: 'FLOOD & LANDSLIDE SAFETY',
  volunteer_briefing: 'VOLUNTEER BRIEFING',
  evacuation_drill: 'EVACUATION DRILL',
  water_sanitation: 'WATER SANITATION',
};
