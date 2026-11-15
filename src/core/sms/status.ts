import { normalizeName } from '@/core/missing/names';
import demoIndex from '../../../public/geo/demo/index.json';
import bagmati from '../../../public/geo/demo/bagmati-kathmandu/flood.json';
import trishuli from '../../../public/geo/demo/trishuli-rasuwa/flood.json';
import mississippi from '../../../public/geo/demo/mississippi-st-louis/flood.json';
import rhine from '../../../public/geo/demo/rhine-cologne/flood.json';
import indus from '../../../public/geo/demo/indus-sukkur/flood.json';

/**
 * STATUS by text, with no internet on the phone and no live call from the server: the answer comes
 * from the river snapshots saved for the demo places (public/geo/demo), bundled into the server
 * code so it works on read-only hosting. Always labelled as a simulation with its save date.
 */

type Snapshot = {
  current: {
    discharge: number | null;
    severity: string;
    dischargeDate: string | null;
  };
  forecast: { severity: string; peakDate: string | null; peakDischarge: number | null };
  climatology: { q2: number | null };
};

type Place = { slug: string; name: string; words: string[]; data: Snapshot };

const DATA: Record<string, Snapshot> = {
  'bagmati-kathmandu': bagmati as Snapshot,
  'trishuli-rasuwa': trishuli as Snapshot,
  'mississippi-st-louis': mississippi as Snapshot,
  'rhine-cologne': rhine as Snapshot,
  'indus-sukkur': indus as Snapshot,
};

/** Extra names people text for the same place. */
const EXTRA: Record<string, string[]> = {
  'bagmati-kathmandu': ['ktm', 'kathmandu valley', 'lalitpur', 'patan'],
  'trishuli-rasuwa': ['trisuli', 'bhote koshi', 'dhunche', 'syaphrubesi'],
  'mississippi-st-louis': ['saint louis', 'stl'],
  'rhine-cologne': ['koln', 'rhein'],
  'indus-sukkur': ['sukkar'],
};

const STOP = new Set(['st', 'saint', 'river', 'the']);

export const STATUS_PLACES: Place[] = demoIndex.presets
  .filter((p) => DATA[p.slug])
  .map((p) => {
    const parts = normalizeName(p.name).split(' ');
    const words = [
      normalizeName(p.name),
      ...parts.filter((w) => w.length >= 3 && !STOP.has(w)),
      ...(EXTRA[p.slug] ?? []),
    ];
    // "St Louis" is only a match as a pair, never "st" alone.
    if (p.slug === 'mississippi-st-louis') words.push('st louis');
    return { slug: p.slug, name: p.name, words, data: DATA[p.slug] };
  });

export function findStatusPlace(query: string): Place | null {
  const q = normalizeName(query);
  if (!q) return null;
  const tokens = q.split(' ');
  for (const place of STATUS_PLACES) {
    for (const w of place.words) {
      if (q === w) return place;
      if (w.includes(' ') ? ` ${q} `.includes(` ${w} `) : tokens.includes(w)) return place;
    }
  }
  return null;
}

const LEVEL: Record<string, string> = {
  normal: 'NORMAL',
  watch: 'WATCH (high)',
  warning: 'WARNING (very high)',
  severe: 'SEVERE (extreme)',
  unknown: 'UNKNOWN',
};

function shortDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function flow(q: number | null): string {
  if (q === null || !Number.isFinite(q)) return '?';
  return q >= 100 ? String(Math.round(q)) : String(Math.round(q * 10) / 10);
}

export const HIGHER_GROUND = 'If water is rising, go to higher ground now.';
export const STATUS_LABEL = 'SIMULATION, not an official forecast.';

export function statusReply(args: string): string {
  if (!args) return 'Send STATUS <place>, for example: STATUS Kathmandu';
  const place = findStatusPlace(args);
  if (!place) {
    const known = STATUS_PLACES.map((p) => p.name.split(',').pop()?.trim()).join(', ');
    return `No river data for ${args.slice(0, 40)} by text. Saved places: ${known}. ${HIGHER_GROUND}`;
  }
  const { current, forecast, climatology } = place.data;
  const saved = shortDate(current.dischargeDate);
  const pct =
    current.discharge !== null && climatology.q2
      ? ` (${Math.round((current.discharge / climatology.q2) * 100)}% of a 2-year flood)`
      : '';
  const peak = forecast.peakDate
    ? ` Forecast peak ${shortDate(forecast.peakDate)}: ${LEVEL[forecast.severity] ?? 'UNKNOWN'}.`
    : '';
  return `${STATUS_LABEL} ${place.name}${saved ? `, saved ${saved}` : ''}: river ${LEVEL[current.severity] ?? 'UNKNOWN'}, ${flow(current.discharge)} m3/s${pct}.${peak} ${HIGHER_GROUND}`;
}
