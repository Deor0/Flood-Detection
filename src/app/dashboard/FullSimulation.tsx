'use client';

import { useEffect, useState } from 'react';
import type { SimulateResult } from '@/model/engine';
import styles from './dashboard.module.css';

type Props = {
  /** Result for the current point and flow, if one was run. */
  result: SimulateResult | null;
  running: boolean;
  startedAt: number | null;
  error: string;
  /** Whether the map shows the SFINCS run (true) or the quick estimate (false). */
  showRun: boolean;
  /** The chosen flow is at or below the river's typical level, so there is nothing to flood. */
  belowTypical: boolean;
  onRun: () => void;
  onShowRun: (show: boolean) => void;
  /** Switch the scenario to a 20-year flood. */
  onTryFlood: () => void;
};

const fmt = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en'));

/** "Full simulation (SFINCS)": runs the flood engine for the current flow and reports what it found. */
export function FullSimulation({
  result,
  running,
  startedAt,
  error,
  showRun,
  belowTypical,
  onRun,
  onShowRun,
  onTryFlood,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const elapsed = running && startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;

  return (
    <section className={styles.fullSim} aria-labelledby="full-sim-title">
      <h3 id="full-sim-title" className={styles.fullSimTitle}>
        Full simulation (SFINCS)
      </h3>
      <p className={styles.muted}>
        Runs the SFINCS flood model on 50 m terrain for 24 hours of this flow, letting the water
        move across the ground instead of filling it level. It can take 1 to 3 minutes.
      </p>
      <div className={styles.fullSimRow}>
        {belowTypical && !running ? (
          <button type="button" className={styles.try} onClick={onTryFlood}>
            Try a 20-year flood
          </button>
        ) : (
          <button type="button" className={styles.try} onClick={onRun} disabled={running}>
            {running ? `Running SFINCS… ${elapsed}s` : result ? 'Run again' : 'Run full simulation'}
          </button>
        )}
        {result && (
          <div role="group" aria-label="Map layer" className={styles.modes}>
            <button
              type="button"
              className={showRun ? styles.modeOn : styles.mode}
              aria-pressed={showRun}
              onClick={() => onShowRun(true)}
            >
              SFINCS model run
            </button>
            <button
              type="button"
              className={!showRun ? styles.modeOn : styles.mode}
              aria-pressed={!showRun}
              onClick={() => onShowRun(false)}
            >
              Quick estimate (HAND)
            </button>
          </div>
        )}
      </div>
      {belowTypical && !running && (
        <p className={styles.warnLine}>
          This flow is at or below this river&apos;s usual level, so the model has no extra water to
          spread and the map stays empty. Pick a bigger scenario (a forecast peak, a return period
          or a higher multiplier) to see flooding.
        </p>
      )}
      {error && <p className={styles.warnLine}>{error}</p>}
      {result && result.stats.floodedKm2 === 0 && (
        <p className={styles.warnLine}>No water spread outside the river at this flow.</p>
      )}
      {result && (
        <>
          <dl className={styles.facts}>
            <div>
              <dt>Flooded area (over 10 cm)</dt>
              <dd>{fmt(result.stats.floodedKm2)} km²</dd>
            </div>
            <div>
              <dt>Deepest water</dt>
              <dd>{fmt(result.stats.maxDepthM)} m</dd>
            </div>
            <div>
              <dt>Run time</dt>
              <dd>{Math.round(result.stats.runSeconds)} s</dd>
            </div>
          </dl>
          {result.warnings.map((w) => (
            <p key={w} className={styles.warnLine}>
              {w}
            </p>
          ))}
          <p className={styles.muted}>
            The model is fed the flow above this river&apos;s typical level, entering where the
            river crosses the 10 km box. Side streams are not included.
          </p>
          {result.attribution && <p className={styles.muted}>{result.attribution}</p>}
        </>
      )}
    </section>
  );
}
