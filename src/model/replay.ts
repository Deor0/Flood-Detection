export type ReplayCheck = { ok: true } | { ok: false; reason: string };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** Guards the checked-in replay file: every figure sourced and dated, limitations stated. */
export function validateReplay(json: unknown): ReplayCheck {
  const no = (reason: string): ReplayCheck => ({ ok: false, reason });
  if (!isRec(json)) return no('not an object');

  const { limitations, sources, series, timeline, impacts } = json;
  if (!Array.isArray(limitations) || limitations.length === 0 || !limitations.every(str))
    return no('limitations missing');
  const text = limitations.join(' ').toLowerCase();
  if (!/debris flow/.test(text) || !/landslide|glacier/.test(text))
    return no('limitations must mention debris flows and landslide-dam or glacier events');

  if (!Array.isArray(sources) || sources.length === 0) return no('sources missing');
  for (const s of sources)
    if (!isRec(s) || !str(s.name) || !str(s.url) || !str(s.license)) return no('bad source');

  if (!Array.isArray(series)) return no('series missing');
  for (const s of series) {
    if (!isRec(s) || !str(s.source) || !str(s.asOf) || !Array.isArray(s.values))
      return no('series needs source, asOf, values');
    if (
      !s.values.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))
    )
      return no('negative or invalid series value');
  }

  if (!Array.isArray(timeline) || timeline.length === 0) return no('timeline missing');
  let last = -Infinity;
  for (const t of timeline) {
    if (!isRec(t) || !str(t.text) || !str(t.source) || !str(t.at)) return no('bad timeline entry');
    const ms = Date.parse(t.at as string);
    if (Number.isNaN(ms)) return no('bad timeline date');
    if (ms < last) return no('timeline not ascending');
    last = ms;
  }

  if (!Array.isArray(impacts)) return no('impacts missing');
  for (const i of impacts)
    if (!isRec(i) || !str(i.label) || !str(i.value) || !str(i.asOf) || !str(i.source))
      return no('impact needs label, value, asOf, source');

  return { ok: true };
}
