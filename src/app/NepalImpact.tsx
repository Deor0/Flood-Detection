'use client';

import { useId, useState } from 'react';
import { AREAS, DEFAULT_LEADS, LEAD_OPTIONS, TOTAL_AFFECTED, estimate } from './nepal-impact-model';
import styles from './nepal-impact.module.css';

const DEFAULT_WARNED = 80;

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const clampPercent = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
const sameLeads = (a: Record<string, number>, b: Record<string, number>) =>
  AREAS.every((area) => a[area.id] === b[area.id]);

/**
 * An illustrative what-if. Plain arithmetic on assumptions the reader controls: how many people
 * get the warning, and how much time each area has. Upstream areas get minutes at most; areas
 * further downstream could get more. Nothing here is a forecast or a claim about what would have
 * happened.
 */
export default function NepalImpact() {
  const uid = useId();
  const [warned, setWarned] = useState(DEFAULT_WARNED);
  const [leads, setLeads] = useState<Record<string, number>>(DEFAULT_LEADS);

  const result = estimate(warned, leads);
  const movedPercent = TOTAL_AFFECTED ? (result.moved / TOTAL_AFFECTED) * 100 : 0;
  const isDefault = warned === DEFAULT_WARNED && sameLeads(leads, DEFAULT_LEADS);

  return (
    <section className={styles.wrap} aria-labelledby={`${uid}-title`}>
      <p className={styles.badge}>ILLUSTRATIVE SCENARIO, NOT A CLAIM</p>
      <h3 id={`${uid}-title`} className={styles.heading}>
        What if people had been warned, and how much time would they have had?
      </h3>
      <p className={styles.help}>
        A surge like this reaches the upstream villages first, within minutes, and the towns
        downstream later. Set how many people get a warning and how long each area has. The warning
        times and the share who could reach high ground in that time are assumptions, not measured
        travel times or forecasts.
      </p>

      <div className={styles.controls}>
        <div className={styles.control}>
          <label htmlFor={`${uid}-warned`}>
            Receive the warning <strong>{warned}%</strong>
          </label>
          <input
            id={`${uid}-warned`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={warned}
            onChange={(e) => setWarned(clampPercent(Number(e.target.value)))}
            aria-valuetext={`${warned} percent`}
          />
        </div>
      </div>

      <table className={styles.areas}>
        <caption className={styles.caption}>
          Warning time by area, upstream first (affected people: Copernicus EMS EMSR927 estimates)
        </caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Affected</th>
            <th scope="col">Warning time (assumption)</th>
            <th scope="col">Could move</th>
          </tr>
        </thead>
        <tbody>
          {AREAS.map((area, i) => (
            <tr key={area.id}>
              <th scope="row">
                {area.name}
                <span className={styles.where}>{area.where}</span>
              </th>
              <td>{number.format(area.affected)}</td>
              <td>
                <select
                  aria-label={`Warning time for ${area.name}`}
                  value={leads[area.id]}
                  onChange={(e) =>
                    setLeads((prev) => ({ ...prev, [area.id]: Number(e.target.value) }))
                  }
                >
                  {LEAD_OPTIONS.map((option) => (
                    <option key={option.minutes} value={option.minutes}>
                      {option.label} ({Math.round(option.share * 100)}% reach high ground)
                    </option>
                  ))}
                </select>
              </td>
              <td>{number.format(result.areas[i].moved)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={styles.bars} aria-label="People affected, warned, and who could move">
        <li className={styles.barRow}>
          <span className={styles.barLabel}>Affected</span>
          <span className={styles.track} aria-hidden="true">
            <span className={`${styles.fill} ${styles.l1}`} style={{ width: '100%' }} />
          </span>
          <span className={styles.barValue}>{number.format(TOTAL_AFFECTED)}</span>
        </li>
        <li className={styles.barRow}>
          <span className={styles.barLabel}>Warned</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={`${styles.fill} ${styles.l2}`}
              style={{ width: `${clampPercent(warned)}%` }}
            />
          </span>
          <span className={styles.barValue}>{number.format(result.warned)}</span>
        </li>
        <li className={styles.barRow}>
          <span className={styles.barLabel}>Could move</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={`${styles.fill} ${styles.l3}`}
              style={{ width: `${clampPercent(movedPercent)}%` }}
            />
          </span>
          <span className={styles.barValue}>{number.format(result.moved)}</span>
        </li>
      </ul>

      <p className={styles.sum} aria-live="polite" aria-atomic="true">
        Under these assumptions, about <strong>{number.format(result.moved)}</strong> of{' '}
        {number.format(TOTAL_AFFECTED)} affected people could have reached high ground. With no
        warning time, the answer is zero however many are warned.
      </p>

      <button
        type="button"
        className={styles.reset}
        onClick={() => {
          setWarned(DEFAULT_WARNED);
          setLeads(DEFAULT_LEADS);
        }}
        disabled={isDefault}
      >
        Reset
      </button>
    </section>
  );
}
