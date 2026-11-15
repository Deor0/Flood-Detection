'use client';

import { RETURN_PERIODS, type ResolvedScenario, type ScenarioState } from './scenario';
import type { FloodData } from './types';
import styles from './dashboard.module.css';

type Props = {
  data: FloodData;
  state: ScenarioState;
  onChange: (patch: Partial<ScenarioState>) => void;
  onReset: () => void;
  resolved: ResolvedScenario;
  /** Last forecast day available (0 when there is no forecast). */
  maxDay: number;
  computing: boolean;
  /** Label of the saved scenario A, if any. */
  savedA: string | null;
  compareOn: boolean;
  canSave: boolean;
  onSaveA: () => void;
  onClearA: () => void;
  onToggleCompare: (on: boolean) => void;
};

const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en') : n.toFixed(1));

/** Controls for the experiments: forecast day, return period, flow multiplier, breach flow, compare. */
export function ScenarioPanel({
  data,
  state,
  onChange,
  onReset,
  resolved,
  maxDay,
  computing,
  savedA,
  compareOn,
  canSave,
  onSaveA,
  onClearA,
  onToggleCompare,
}: Props) {
  const levels = data.climatology?.returnLevels ?? [];
  const hasLevels = levels.length > 0;
  const q2 = data.climatology?.q2 ?? null;
  const defaultExtra = q2 ? Math.round(q2 * 10) : 1000;

  return (
    <section className={styles.scenario} aria-labelledby="scenario-title">
      <div className={styles.scenarioHead}>
        <h3 id="scenario-title" className={styles.h3}>
          Try a scenario
        </h3>
        <button type="button" className={styles.linkButton} onClick={onReset}>
          Reset
        </button>
      </div>

      <p className={styles.showing} role="status" aria-live="polite">
        {resolved.summary}
        {computing ? ' (updating the map…)' : ''}
      </p>
      {resolved.spread && resolved.spread.min != null && resolved.spread.max != null && (
        <p className={styles.muted}>
          Forecast range that day, from the forecast ensemble: {fmt(resolved.spread.min)} to{' '}
          {fmt(resolved.spread.max)} m³/s. The map uses the middle value.
        </p>
      )}

      <fieldset className={styles.fieldset}>
        <legend>What flow to simulate</legend>
        <label className={styles.choice}>
          <input
            type="radio"
            name="basis"
            checked={state.basis === 'forecast'}
            onChange={() => onChange({ basis: 'forecast' })}
          />
          A day in the forecast
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name="basis"
            checked={state.basis === 'return'}
            disabled={!hasLevels}
            onChange={() => onChange({ basis: 'return' })}
          />
          A flood of a chosen size
          {!hasLevels && ' (needs more river history)'}
        </label>
      </fieldset>

      {state.basis === 'forecast' ? (
        <label className={styles.slider}>
          Forecast day:{' '}
          {state.day === 0 ? 'today' : `in ${state.day} ${state.day === 1 ? 'day' : 'days'}`}
          <input
            type="range"
            min={0}
            max={Math.max(maxDay, 1)}
            step={1}
            value={Math.min(state.day, Math.max(maxDay, 1))}
            disabled={maxDay === 0}
            onChange={(e) => onChange({ day: Number(e.target.value) })}
            aria-valuetext={resolved.date ?? undefined}
          />
          {maxDay === 0 && (
            <span className={styles.muted}>No forecast days are available here.</span>
          )}
        </label>
      ) : (
        <label className={styles.slider}>
          Flood size (return period)
          <select
            className={styles.select}
            value={state.T}
            onChange={(e) => onChange({ T: Number(e.target.value) })}
          >
            {RETURN_PERIODS.map((T) => (
              <option key={T} value={T}>
                {T}-year flood
                {T >= 50 ? ' (extrapolated beyond the 40-year record)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.slider}>
        River flow multiplier: ×{state.multiplier.toFixed(1)}
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.1}
          value={state.multiplier}
          onChange={(e) => onChange({ multiplier: Number(e.target.value) })}
        />
      </label>

      <fieldset className={styles.fieldset}>
        <legend>Dam or landslide-dam breach</legend>
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={state.breach}
            onChange={(e) =>
              onChange({ breach: e.target.checked, extra: state.extra || defaultExtra })
            }
          />
          Add a breach flow
        </label>
        <label className={styles.slider}>
          Extra discharge, m³/s
          <input
            type="number"
            className={styles.number}
            min={0}
            step={50}
            value={state.extra}
            disabled={!state.breach}
            onChange={(e) => onChange({ extra: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <p className={styles.muted}>
          Peak envelope: no wave travel time, upper-bound depth for the first hours. The default is
          10 times the 2-year flow.
        </p>
      </fieldset>

      <label className={styles.slider}>
        Channel roughness: ×{state.roughness.toFixed(1)}
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.1}
          value={state.roughness}
          onChange={(e) => onChange({ roughness: Number(e.target.value) })}
        />
        <span className={styles.muted}>
          Rougher channels (rocks, trees, buildings) make the same flow deeper.
        </span>
      </label>

      <fieldset className={styles.fieldset}>
        <legend>Compare two scenarios</legend>
        <div className={styles.row}>
          <button type="button" className={styles.try} onClick={onSaveA} disabled={!canSave}>
            Save current as A
          </button>
          {savedA && (
            <button type="button" className={styles.try} onClick={onClearA}>
              Clear A
            </button>
          )}
        </div>
        {savedA ? (
          <>
            <p className={styles.muted}>A: {savedA}</p>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={compareOn}
                onChange={(e) => onToggleCompare(e.target.checked)}
              />
              Show A and B side by side with the slider on the map (B is the controls above)
            </label>
          </>
        ) : (
          <p className={styles.muted}>
            Save the current map as A, change the controls, then compare it with B using a slider on
            the map.
          </p>
        )}
      </fieldset>
    </section>
  );
}
