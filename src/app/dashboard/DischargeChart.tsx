import styles from './dashboard.module.css';

type Props = { days: string[]; discharge: (number | null)[]; q2: number | null | undefined };

/** Inline SVG of the last stretch of daily discharge, with the 2-year level as a dashed line. */
export function DischargeChart({ days, discharge, q2 }: Props) {
  const n = Math.min(days.length, 120);
  const d = days.slice(-n);
  const v = discharge.slice(-n);
  const nums = v.filter((x): x is number => x !== null);
  if (nums.length < 2) return <p className={styles.muted}>Not enough discharge data to chart.</p>;
  const W = 420;
  const H = 170;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const max = Math.max(...nums, q2 ?? 0) * 1.1 || 1;
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (val: number) => H - pad.b - (val / max) * (H - pad.t - pad.b);
  let path = '';
  let pen = false;
  v.forEach((val, i) => {
    if (val === null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(val).toFixed(1)}`;
    pen = true;
  });
  const fmt = (num: number) => (num >= 100 ? Math.round(num).toString() : num.toFixed(1));
  const today = new Date().toISOString().slice(0, 10);
  const todayIndex = d.indexOf(today);
  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="River discharge, last 120 days and forecast"
      >
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line-strong)" />
        <text
          x={pad.l - 6}
          y={y(max / 1.1) + 4}
          textAnchor="end"
          fontSize="13"
          fill="var(--ink-soft)"
        >
          {fmt(max / 1.1)}
        </text>
        <text x={pad.l - 6} y={H - pad.b} textAnchor="end" fontSize="13" fill="var(--ink-soft)">
          0
        </text>
        {q2 ? (
          <>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(q2)}
              y2={y(q2)}
              stroke="var(--ink-soft)"
              strokeDasharray="4 3"
            />
            <text x={W - pad.r} y={y(q2) - 4} textAnchor="end" fontSize="13" fill="var(--ink-soft)">
              2-year level {fmt(q2)}
            </text>
          </>
        ) : null}
        {todayIndex > 0 && (
          <line
            x1={x(todayIndex)}
            x2={x(todayIndex)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--line-strong)"
          />
        )}
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" />
        <text x={pad.l} y={H - 7} fontSize="13" fill="var(--ink-soft)">
          {d[0]}
        </text>
        <text x={W - pad.r} y={H - 7} textAnchor="end" fontSize="13" fill="var(--ink-soft)">
          {d[d.length - 1]}
        </text>
      </svg>
      <figcaption className={styles.muted}>
        Discharge, m³/s. Source: Open-Meteo / GloFAS.
      </figcaption>
    </figure>
  );
}
