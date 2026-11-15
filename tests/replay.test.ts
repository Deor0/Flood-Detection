import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateReplay } from '@/model/replay';

const good = {
  limitations: [
    'Debris flows and landslide-dam or glacier-lake floods are not visible to a river model.',
  ],
  sources: [{ name: 'Copernicus EMS', url: 'https://example.com/emsr', license: 'CC BY' }],
  series: [{ name: 'rain', source: 'Open-Meteo', asOf: '2026-11-01', values: [0, 1.2] }],
  timeline: [
    { at: '2026-08-26T02:52:00Z', text: 'Onset', source: 'Report' },
    { at: '2026-08-28T00:00:00Z', text: 'Barrier lake overflow', source: 'Report' },
  ],
  impacts: [{ label: 'Buildings', value: '4,685', asOf: '2026-10-05', source: 'EMSR927' }],
};

describe('Nepal replay guard', () => {
  it('accepts a sourced fixture and rejects bad numbers, order, and a missing limitation', () => {
    expect(validateReplay(good)).toEqual({ ok: true });
    expect(validateReplay({ ...good, series: [{ ...good.series[0], values: [-1] }] }).ok).toBe(false);
    expect(
      validateReplay({
        ...good,
        timeline: [good.timeline[1], good.timeline[0]],
      }).ok,
    ).toBe(false);
    expect(validateReplay({ ...good, limitations: ['Rain only.'] }).ok).toBe(false);
  });

  it('accepts the checked-in Nepal replay file', () => {
    const json = JSON.parse(readFileSync('public/geo/nepal-2026/replay.json', 'utf8'));
    expect(validateReplay(json)).toEqual({ ok: true });
    expect(JSON.stringify(json)).toContain('2026-08-26');
    expect(JSON.stringify(json)).toContain('EMSR927');
  });
});
