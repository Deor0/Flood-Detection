'use client';

import { useEffect, useState } from 'react';
import type { Replay } from './types';
import styles from './dashboard.module.css';

/** Date only when the source gave no time of day (a midnight stamp is a placeholder, not a fact). */
function formatWhen(at: string): string {
  if (!at.includes('T') || /T00:00(:00)?(\.0+)?Z$/.test(at)) return at.slice(0, 10);
  return at.replace('T', ' ').replace(/:00(\.0+)?Z$/, ' UTC');
}

/** The 26 Aug 2026 Nepal flood as a documented timeline. It is not an animated river rise. */
export function ReplayPanel() {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let live = true;
    fetch('/geo/nepal-2026/replay.json')
      .then((r) => (r.ok ? (r.json() as Promise<Replay>) : Promise.reject(new Error('bad'))))
      .then((json) => live && setReplay(json))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return <p className={styles.error}>The replay data could not be loaded.</p>;
  if (!replay) return <p className={styles.muted}>Loading replay…</p>;

  const current = replay.timeline[Math.min(step, replay.timeline.length - 1)];
  return (
    <section className={styles.panel}>
      <h2 className={styles.h2}>{replay.title ?? 'Nepal flood, 26 August 2026'}</h2>
      <p>
        This is a record of events, shown with care for the people affected. It is{' '}
        <strong>not an animated river rise</strong>: the event was a sudden surge, reportedly from a
        glacial lake outburst, which river-discharge and rainfall data do not show.
      </p>
      {replay.note && <p className={styles.muted}>{replay.note}</p>}

      {replay.timeline.length > 0 && (
        <>
          <label className={styles.slider}>
            Timeline: step {step + 1} of {replay.timeline.length}
            <input
              type="range"
              min={0}
              max={replay.timeline.length - 1}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
            />
          </label>
          <div className={styles.event}>
            <time dateTime={current.at}>{formatWhen(current.at)}</time>
            <p>{current.text}</p>
            <span className={styles.muted}>Source: {current.source}</span>
          </div>
        </>
      )}

      {replay.series.length > 0 && (
        <div className={styles.cards}>
          {replay.series.map((s) => (
            <div key={s.name} className={styles.card}>
              <strong>{s.name}</strong>
              <span>
                {s.values.length} readings{s.unit ? ` (${s.unit})` : ''}
                {s.values.length > 0 ? `, max ${Math.max(...s.values)}` : ''}
              </span>
              <span className={styles.muted}>
                {s.source}, as of {s.asOf}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3 className={styles.h3}>Impacts (estimates)</h3>
      <div className={styles.cards}>
        {replay.impacts.map((i) => (
          <div key={i.label} className={styles.card}>
            <span>{i.label}</span>
            <strong>{i.value}</strong>
            <span className={styles.muted}>
              {i.source}, as of {i.asOf}
            </span>
          </div>
        ))}
      </div>

      <h3 className={styles.h3}>What this cannot show</h3>
      <ul>
        {replay.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <h3 className={styles.h3}>Sources</h3>
      <ul>
        {replay.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
            {s.license ? ` (${s.license})` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
