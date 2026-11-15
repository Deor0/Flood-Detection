import { quantile, type GumbelFit } from '@/model/gumbel';
import styles from './dashboard.module.css';

type Ensemble = {
  days: string[];
  min: (number | null)[];
  p25: (number | null)[];
  median: (number | null)[];
  p75: (number | null)[];
  max: (number | null)[];
};

type Props = {
  days: string[];
  discharge: (number | null)[];
  q2: number | null | undefined;
  fit?: GumbelFit | null;
  ensemble?: Ensemble;
  /** The day the map is showing (ISO date), drawn as a marker. */
  markerDate?: string | null;
  today?: string;
};

const LEVELS = [2, 5, 20, 40] as const;

/** A "nice" step so axis ticks land on round numbers. */
function niceStep(max: number, count: number) {
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

const fmt = (num: number) =>
  num >= 100 ? Math.round(num).toLocaleString('en') : num >= 10 ? num.toFixed(0) : num.toFixed(1);

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * Inline SVG of daily discharge. Past days are a solid line, forecast days are dashed with the
 * ensemble spread behind them, and the 2, 5, 20 and 40-year levels are thin reference lines.
 */
export function DischargeChart({ days, discharge, q2, fit, ensemble, markerDate, today }: Props) {
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  const n = Math.min(days.length, 140);
  const d = days.slice(-n);
  const v = discharge.slice(-n);
  const nums = v.filter((x): x is number => x !== null);
  if (nums.length < 2) return <p className={styles.muted}>Not enough discharge data to chart.</p>;

  const levels: { T: number; q: number }[] = [];
  if (fit) for (const T of LEVELS) levels.push({ T, q: quantile(T, fit) });
  else if (q2) levels.push({ T: 2, q: q2 });

  const ensMax = ensemble ? ensemble.max.filter((x): x is number => x !== null) : [];
  const dataMax = Math.max(...nums, ...ensMax, q2 ?? 0);
  // Only stretch the axis to the 5-year level; 20 and 40 are drawn when they fit.
  const top = dataMax * 1.12 || 1;
  const step = niceStep(top, 4);
  const axisMax = Math.ceil(top / step) * step;

  const W = 480;
  const H = 230;
  const pad = { l: 52, r: 10, t: 12, b: 34 };
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (val: number) => H - pad.b - (val / axisMax) * (H - pad.t - pad.b);

  const todayIndex = d.indexOf(todayIso);
  const splitAt = todayIndex >= 0 ? todayIndex : n - 1;
  const pastCount = splitAt + 1;
  const futureCount = n - pastCount;

  const lineFor = (from: number, to: number) => {
    let path = '';
    let pen = false;
    for (let i = from; i <= to; i += 1) {
      const val = v[i];
      if (val === null) {
        pen = false;
        continue;
      }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(val).toFixed(1)}`;
      pen = true;
    }
    return path;
  };
  const past = lineFor(0, splitAt);
  const future = lineFor(splitAt, n - 1);

  // Ensemble band, drawn only where the chart has a matching day.
  const band = (lo: (number | null)[], hi: (number | null)[]) => {
    if (!ensemble) return '';
    const idx: number[] = [];
    ensemble.days.forEach((day, k) => {
      const i = d.indexOf(day);
      if (i >= 0 && lo[k] != null && hi[k] != null) idx.push(k);
    });
    if (idx.length < 2) return '';
    const up = idx.map(
      (k) => `${x(d.indexOf(ensemble.days[k])).toFixed(1)} ${y(hi[k] as number).toFixed(1)}`,
    );
    const down = [...idx]
      .reverse()
      .map((k) => `${x(d.indexOf(ensemble.days[k])).toFixed(1)} ${y(lo[k] as number).toFixed(1)}`);
    return `M${up.join('L')}L${down.join('L')}Z`;
  };
  const outer = ensemble ? band(ensemble.min, ensemble.max) : '';
  const inner = ensemble ? band(ensemble.p25, ensemble.p75) : '';

  const yTicks: number[] = [];
  for (let t = 0; t <= axisMax + 1e-9; t += step) yTicks.push(t);
  const xTickIdx = [
    0,
    Math.round((n - 1) / 4),
    Math.round((n - 1) / 2),
    Math.round(((n - 1) * 3) / 4),
    n - 1,
  ];
  const markerIndex = markerDate ? d.indexOf(markerDate) : -1;

  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`River discharge in cubic metres per second: ${pastCount} days up to today and ${futureCount} forecast days, with 2, 5, 20 and 40-year reference levels.`}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="13" fill="var(--ink-soft)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {outer && <path d={outer} fill="var(--primary)" opacity="0.14" />}
        {inner && <path d={inner} fill="var(--primary)" opacity="0.22" />}
        {levels
          .filter((l) => l.q <= axisMax)
          .map((l) => (
            <g key={l.T}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(l.q)}
                y2={y(l.q)}
                stroke="var(--ink-soft)"
                strokeDasharray="2 4"
                strokeWidth="1"
              />
              <text
                x={W - pad.r}
                y={y(l.q) - 3}
                textAnchor="end"
                fontSize="12"
                fill="var(--ink-soft)"
              >
                {l.T}-year {fmt(l.q)}
              </text>
            </g>
          ))}
        {todayIndex > 0 && (
          <>
            <line
              x1={x(todayIndex)}
              x2={x(todayIndex)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--line-strong)"
            />
            <text
              x={x(todayIndex) - 4}
              y={pad.t + 10}
              textAnchor="end"
              fontSize="12"
              fill="var(--ink-soft)"
            >
              today
            </text>
          </>
        )}
        {markerIndex >= 0 && (
          <line
            x1={x(markerIndex)}
            x2={x(markerIndex)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--ink)"
            strokeWidth="2"
          />
        )}
        <path d={past} fill="none" stroke="var(--primary)" strokeWidth="2" />
        <path
          d={future}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line-strong)" />
        {xTickIdx.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={H - 12}
            textAnchor={k === 0 ? 'start' : k === xTickIdx.length - 1 ? 'end' : 'middle'}
            fontSize="12"
            fill="var(--ink-soft)"
          >
            {shortDate(d[i])}
          </text>
        ))}
      </svg>
      <figcaption className={styles.muted}>
        Discharge, m³/s. Solid line: past days. Dashed line: forecast
        {ensemble ? ', with the shaded spread of the forecast ensemble' : ''}. Dotted lines: how big
        a 2, 5, 20 and 40-year flow is on this river. Source: Open-Meteo / GloFAS.
      </figcaption>
    </figure>
  );
}
