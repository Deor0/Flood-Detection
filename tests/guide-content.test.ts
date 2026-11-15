import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARE_NOTES,
  EMERGENCY_NUMBERS,
  MOUNTAIN_TIPS,
  PHASES,
  SOURCES,
  WATER_DEPTHS,
  WHY_IT_MATTERS,
} from '@/app/guide/guide-content';

const ids = new Set(SOURCES.map((s) => s.id));

describe('Flood Guide content', () => {
  it('every cited source id exists in SOURCES, and source ids are unique', () => {
    expect(ids.size).toBe(SOURCES.length);
    const cited = [
      ...PHASES.flatMap((p) => p.tips),
      ...MOUNTAIN_TIPS,
      ...CARE_NOTES,
      ...WATER_DEPTHS,
      ...WHY_IT_MATTERS,
    ]
      .map((t) => t.source)
      .filter((s): s is string => Boolean(s));
    for (const id of cited) expect(ids, `unknown source "${id}"`).toContain(id);
  });

  it('every source has an https URL', () => {
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });

  it('puts During first, then Before, then After, with the Odyssey subtitles', () => {
    expect(PHASES.map((p) => p.id)).toEqual(['during', 'before', 'after']);
    expect(PHASES.map((p) => p.theme)).toEqual(['The storm', 'Rig the ship', 'The road to Ithaca']);
  });

  it('During tells people what to do if trapped, and never to climb into a closed attic', () => {
    const during = PHASES[0].tips.map((t) => t.text).join(' ');
    expect(during).toMatch(/trapped/i);
    expect(during).toMatch(/highest/i);
    expect(during).toMatch(/closed attic/i);
    expect(during).toMatch(/911/);
  });

  it('offers a tel: emergency number for the US', () => {
    expect(EMERGENCY_NUMBERS.map((e) => e.tel)).toContain('911');
  });

  it('describes the vehicle figure as drownings, not all deaths', () => {
    const vehicle = WHY_IT_MATTERS.find((s) => s.source === 'nws-tadd');
    expect(vehicle?.label).toMatch(/drownings/);
    const all = JSON.stringify([PHASES, WHY_IT_MATTERS, SOURCES]);
    expect(all).not.toMatch(/deaths are in vehicles swept downstream/);
  });

  it('cites the kit water figure to Ready.gov, not the Red Cross', () => {
    const kit = PHASES.flatMap((p) => p.tips).find((t) => /gallon/.test(t.why ?? ''));
    expect(kit?.source).toBe('ready-kit');
  });

  it('has a mountain-floods section that is fully sourced', () => {
    expect(MOUNTAIN_TIPS.length).toBeGreaterThan(0);
    for (const tip of MOUNTAIN_TIPS) expect(tip.source).toBeTruthy();
    expect(MOUNTAIN_TIPS.map((t) => t.text).join(' ')).toMatch(/uphill/i);
  });
});

describe('Nepal record', () => {
  const page = readFileSync('src/app/nepal/page.tsx', 'utf8');
  const replay = readFileSync('public/geo/nepal-2026/replay.json', 'utf8');

  it('matches the EMSR927 cause and drops the unconfirmed death toll', () => {
    for (const text of [page, replay]) {
      expect(text).toMatch(/glacial lake outburst/i);
      expect(text).not.toMatch(/rock-and-ice slope failure/i);
      expect(text).not.toMatch(/1,400/);
    }
  });

  it('no longer uses the vehicle statistic, and links to the mountain-floods guide', () => {
    expect(page).not.toMatch(/vehicles swept downstream/);
    expect(page).toContain('/guide#mountain');
  });
});
