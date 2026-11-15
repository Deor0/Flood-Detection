'use client';

import { useId, useState } from 'react';
import styles from './nepal-impact.module.css';

/** About 7,600 people in the Copernicus EMS EMSR927 mapped area (estimate, as of 5 Oct 2026). */
const PEOPLE_IN_AREA = 7600;
const DEFAULT_WARNED = 50;
const DEFAULT_MOVED = 60;

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const clampPercent = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * An illustrative what-if. Plain arithmetic on two assumptions the reader controls; nothing here
 * is a forecast or a claim about what would have happened.
 */
export default function NepalImpact() {
  const uid = useId();
  const [warned, setWarned] = useState(DEFAULT_WARNED);
  const [moved, setMoved] = useState(DEFAULT_MOVED);

  const warnedPeople = Math.round((PEOPLE_IN_AREA * warned) / 100);
  const movedPeople = Math.round((PEOPLE_IN_AREA * warned * moved) / 10_000);
  const isDefault = warned === DEFAULT_WARNED && moved === DEFAULT_MOVED;

  return (
    <section className={styles.wrap} aria-labelledby={`${uid}-title`}>
      <p className={styles.badge}>ILLUSTRATIVE SCENARIO, NOT A CLAIM</p>
      <h3 id={`${uid}-title`} className={styles.heading}>
        What if the people in the mapped area had been warned?
      </h3>
      <p className={styles.help}>
        Simple arithmetic on two assumptions you set. They are not measurements or forecasts.
      </p>

      <div className={styles.controls}>
        <div className={styles.control}>
          <label htmlFor={`${uid}-warned`}>
            Receive a warning in time <strong>{warned}%</strong>
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
        <div className={styles.control}>
          <label htmlFor={`${uid}-moved`}>
            Of those, move to safety (assumption) <strong>{moved}%</strong>
          </label>
          <input
            id={`${uid}-moved`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={moved}
            onChange={(e) => setMoved(clampPercent(Number(e.target.value)))}
            aria-valuetext={`${moved} percent`}
          />
        </div>
      </div>

      <ul className={styles.bars} aria-label="People in the mapped area, warned, and moved">
        <li className={styles.barRow}>
          <span className={styles.barLabel}>In mapped area</span>
          <span className={styles.track} aria-hidden="true">
            <span className={`${styles.fill} ${styles.l1}`} style={{ width: '100%' }} />
          </span>
          <span className={styles.barValue}>{number.format(PEOPLE_IN_AREA)}</span>
        </li>
        <li className={styles.barRow}>
          <span className={styles.barLabel}>Warned</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={`${styles.fill} ${styles.l2}`}
              style={{ width: `${clampPercent(warned)}%` }}
            />
          </span>
          <span className={styles.barValue}>{number.format(warnedPeople)}</span>
        </li>
        <li className={styles.barRow}>
          <span className={styles.barLabel}>Moved</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={`${styles.fill} ${styles.l3}`}
              style={{ width: `${clampPercent((warned * moved) / 100)}%` }}
            />
          </span>
          <span className={styles.barValue}>{number.format(movedPeople)}</span>
        </li>
      </ul>

      <p className={styles.sum} aria-live="polite" aria-atomic="true">
        {number.format(PEOPLE_IN_AREA)} × {warned}% × {moved}% ={' '}
        <strong>{number.format(movedPeople)}</strong> people could have moved to safety, under these
        assumptions.
      </p>

      <button
        type="button"
        className={styles.reset}
        onClick={() => {
          setWarned(DEFAULT_WARNED);
          setMoved(DEFAULT_MOVED);
        }}
        disabled={isDefault}
      >
        Reset
      </button>
    </section>
  );
}
