import type { ProgramCategory } from '@/db/schema';

export const CATEGORY_LABELS: Record<ProgramCategory, string> = {
  first_aid_cpr: 'First Aid & CPR',
  flood_landslide_safety: 'Flood & Landslide Safety',
  volunteer_briefing: 'Volunteer Briefings',
  evacuation_drill: 'Evacuation Drills',
  water_sanitation: 'Water Sanitation',
  shelter: 'Shelter',
  supplies: 'Supplies',
  rides: 'Rides',
  cleanup_crew: 'Cleanup crew',
};

/**
 * Odyssey subtitles for the flood mutual-aid categories (xenia: taking in the traveller). The plain
 * label always comes first; the theme is only a subtitle.
 */
export const CATEGORY_THEMES: Partial<Record<ProgramCategory, string>> = {
  shelter: 'Hearth',
  supplies: "Eumaeus's larder",
  rides: 'Phaeacian ship',
  cleanup_crew: 'Join the crew',
};

/** "Shelter — Hearth", or the plain label when the category has no theme. */
export const categoryOption = (c: ProgramCategory) =>
  CATEGORY_THEMES[c] ? `${CATEGORY_LABELS[c]} — ${CATEGORY_THEMES[c]}` : CATEGORY_LABELS[c];

/** Singular badge text on a program card. */
export const CATEGORY_BADGES: Record<ProgramCategory, string> = {
  first_aid_cpr: 'FIRST AID & CPR',
  flood_landslide_safety: 'FLOOD & LANDSLIDE SAFETY',
  volunteer_briefing: 'VOLUNTEER BRIEFING',
  evacuation_drill: 'EVACUATION DRILL',
  water_sanitation: 'WATER SANITATION',
  shelter: 'SHELTER',
  supplies: 'SUPPLIES',
  rides: 'RIDES',
  cleanup_crew: 'CLEANUP CREW',
};

/** Categories where attending means volunteering, so the button reads "Join the crew". */
const CREW_CATEGORIES: ReadonlySet<ProgramCategory> = new Set([
  'volunteer_briefing',
  'cleanup_crew',
]);

export const registerLabel = (c: ProgramCategory) =>
  CREW_CATEGORIES.has(c) ? 'Join the crew' : 'Register';
