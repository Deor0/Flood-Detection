import styles from './dashboard.module.css';

/** The six statements that must always be on screen next to the numbers. */
export function Disclaimers() {
  return (
    <section className={styles.disclaimers} aria-label="Limits of this tool">
      <h2 className={styles.h2}>Read before you rely on this</h2>
      <ol>
        <li>This is an educational simulation, not an official forecast or warning.</li>
        <li>
          Severity is GloFAS river discharge compared with that river cell&apos;s own 1984-present
          history.
        </li>
        <li>
          Water depth comes from an assumed channel roughness (adjustable in the scenario panel) and
          a slope read from the terrain. Bankfull, the level where a river leaves its banks, is
          estimated and not surveyed, so depths are a likely range, not a measurement.
        </li>
        <li>Elevation is about 30 m resolution with errors of several metres.</li>
        <li>
          Landslides, debris flows and glacial-lake floods are not represented; a river model cannot
          see them.
        </li>
        <li>Building and population counts are estimates.</li>
      </ol>
    </section>
  );
}
