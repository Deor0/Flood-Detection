'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { riseAboveBankfull } from '@/model/rise';
import { AlertPanel } from './AlertPanel';
import { DischargeChart } from './DischargeChart';
import { ReplayPanel } from './ReplayPanel';
import { buildWaterField, renderDepth, type WaterField } from './water';
import type { FloodData } from './types';
import styles from './dashboard.module.css';

const FloodMap = dynamic(() => import('./FloodMap'), {
  ssr: false,
  loading: () => <div className={styles.mapWrap} aria-busy="true" />,
});

type Mode = 'live' | 'replay';
type View = { lat: number; lng: number; zoom: number; key: number };

const RASUWA = { lat: 28.17, lng: 85.33 };

const SEVERITY_LABEL = {
  normal: 'Normal',
  watch: 'Watch',
  warning: 'Warning',
  severe: 'Severe',
  unknown: 'Not enough history',
} as const;

export default function FloodDesk({ isAdmin }: { isAdmin: boolean }) {
  const [mode, setMode] = useState<Mode>('live');
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [data, setData] = useState<FloodData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [bankfullInput, setBankfullInput] = useState(2);
  const [bankfull, setBankfull] = useState(2);
  const [view, setView] = useState<View | null>(null);
  const [field, setField] = useState<WaterField | null>(null);
  const [terrainNote, setTerrainNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  const flights = useRef(0);

  const fly = useCallback((lat: number, lng: number, zoom: number) => {
    flights.current += 1;
    setView({ lat, lng, zoom, key: flights.current });
  }, []);

  // The slider moves smoothly; the heavy water redraw waits until it rests for a moment.
  useEffect(() => {
    const timer = setTimeout(() => setBankfull(bankfullInput), 150);
    return () => clearTimeout(timer);
  }, [bankfullInput]);

  const onPick = useCallback(
    (lat: number, lng: number) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setPicked({ lat, lng });
      setData(null);
      setField(null);
      setTerrainNote('');
      setError('');
      setStatus('loading');
      (async () => {
        try {
          const res = await fetch(`/api/flood?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, {
            signal: controller.signal,
          });
          if (!res.ok)
            throw new Error(
              res.status === 401
                ? 'Please sign in again.'
                : `The flood service answered ${res.status}.`,
            );
          const json = (await res.json()) as FloodData;
          setData(json);
          setStatus('idle');
          if (!json.noRiver) {
            fly(json.snapped.lat, json.snapped.lng, 12);
            try {
              setTerrainNote('Loading terrain and computing the flood fill…');
              setField(
                await buildWaterField(json.snapped.lat, json.snapped.lng, controller.signal),
              );
              setTerrainNote('');
            } catch (e) {
              if (controller.signal.aborted) return;
              setTerrainNote(
                e instanceof Error ? `Terrain unavailable: ${e.message}` : 'Terrain unavailable.',
              );
            }
          }
        } catch (e) {
          if (controller.signal.aborted) return;
          setStatus('error');
          setError(e instanceof Error ? e.message : 'Something went wrong.');
        }
      })();
    },
    [fly],
  );

  const tryRasuwa = useCallback(() => {
    fly(RASUWA.lat, RASUWA.lng, 11);
    onPick(RASUWA.lat, RASUWA.lng);
  }, [fly, onPick]);

  useEffect(() => () => abort.current?.abort(), []);

  const q = data?.current?.discharge ?? null;
  const q2 = data?.climatology?.q2 ?? null;
  const forecast = data?.forecast ?? null;
  const forecastQ = forecast?.peakDischarge ?? null;
  // Simulate the worse of today's flow and the forecast peak.
  const simQ = q === null ? forecastQ : forecastQ === null ? q : Math.max(q, forecastQ);
  const rise = useMemo(
    () => (simQ !== null && q2 ? riseAboveBankfull(simQ, q2, { bankfullDepth: bankfull }) : 0),
    [simQ, q2, bankfull],
  );
  const computing = bankfullInput !== bankfull;
  const noHistory = !q2;
  const overlay = useMemo(() => {
    if (mode !== 'live' || !field || rise <= 0) return null;
    const out = renderDepth(field, rise);
    return out.url ? { url: out.url, bounds: field.bounds, wetShare: out.wetShare } : null;
  }, [mode, field, rise]);

  const severity = data?.current?.severity ?? 'unknown';
  const place =
    data?.place || (data ? `${data.snapped.lat.toFixed(2)}, ${data.snapped.lng.toFixed(2)}` : '');

  return (
    <div className={styles.desk}>
      <div className={styles.toolbar}>
        <div role="group" aria-label="Mode" className={styles.modes}>
          <button
            type="button"
            className={mode === 'live' ? styles.modeOn : styles.mode}
            aria-pressed={mode === 'live'}
            onClick={() => setMode('live')}
          >
            Live
          </button>
          <button
            type="button"
            className={mode === 'replay' ? styles.modeOn : styles.mode}
            aria-pressed={mode === 'replay'}
            onClick={() => setMode('replay')}
          >
            Replay: Nepal Aug 2026
          </button>
        </div>
        <span className={styles.badge} role="status">
          {mode === 'live' ? 'LIVE' : 'REPLAY'}
        </span>
        {overlay && <span className={styles.badgeSim}>SIMULATION</span>}
      </div>

      {mode === 'replay' ? (
        <ReplayPanel />
      ) : (
        <>
          <div className={styles.toolbar}>
            <button type="button" className={styles.try} onClick={tryRasuwa}>
              Try Rasuwa (Trishuli river)
            </button>
          </div>
          <FloodMap
            view={view}
            picked={picked}
            snapped={data && !data.noRiver ? data.snapped : null}
            overlay={overlay}
            onPick={onPick}
          />
          <section className={styles.panel} aria-live="polite">
            {status === 'idle' && !picked && (
              <p className={styles.muted}>Click the map to check the nearest river.</p>
            )}
            {status === 'loading' && <p className={styles.muted}>Reading river data…</p>}
            {status === 'error' && <p className={styles.error}>{error}</p>}
            {data?.noRiver && (
              <p>
                No river found within about 5 km of that point in the GloFAS data. Try a point on or
                beside a large river.
              </p>
            )}
            {data && !data.noRiver && (
              <>
                <div className={styles.headline}>
                  <h2 className={styles.h2}>{place}</h2>
                  <span className={`${styles.severity} ${styles[`sev_${severity}`]}`}>
                    {SEVERITY_LABEL[severity]}
                  </span>
                </div>
                <dl className={styles.facts}>
                  <div>
                    <dt>
                      {data.current?.dischargeDate
                        ? `Discharge on ${data.current.dischargeDate} (GloFAS model value)`
                        : 'Discharge (GloFAS model value)'}
                    </dt>
                    <dd>{q === null ? 'n/a' : `${q.toFixed(1)} m³/s`}</dd>
                  </div>
                  <div>
                    <dt>Return period</dt>
                    <dd>
                      {data.current?.returnPeriod == null
                        ? 'Not enough history'
                        : `${data.current.capped ? '40+' : data.current.returnPeriod.toFixed(1)} years`}
                    </dd>
                  </div>
                  <div>
                    <dt>Simulated rise above bankfull</dt>
                    <dd>{rise.toFixed(2)} m</dd>
                  </div>
                  <div>
                    <dt>Forecast peak</dt>
                    <dd>
                      {forecast && forecast.peakDate && (forecast.daysAhead ?? 0) >= 1
                        ? `Peak expected ${forecast.peakDate} (in ${forecast.daysAhead} ${forecast.daysAhead === 1 ? 'day' : 'days'})`
                        : 'No later peak in the forecast'}
                    </dd>
                  </div>
                  {forecast && forecast.peakDate && (forecast.daysAhead ?? 0) >= 1 && (
                    <div>
                      <dt>Severity at the forecast peak</dt>
                      <dd>
                        {SEVERITY_LABEL[forecast.severity]}
                        {forecast.returnPeriod != null &&
                          ` (${forecast.capped ? '40+' : forecast.returnPeriod.toFixed(1)} years)`}
                      </dd>
                    </div>
                  )}
                </dl>
                {data.series && (
                  <DischargeChart
                    days={data.series.days}
                    discharge={data.series.discharge}
                    q2={q2}
                  />
                )}
                <label className={styles.slider}>
                  Assumed bankfull depth: {bankfullInput.toFixed(1)} m
                  {computing ? ' (updating…)' : ''}
                  <input
                    type="range"
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={bankfullInput}
                    onChange={(e) => setBankfullInput(Number(e.target.value))}
                  />
                </label>
                {terrainNote && <p className={styles.muted}>{terrainNote}</p>}
                {field && !field.seedFound && (
                  <p className={styles.muted}>
                    No river channel found in the terrain near this point, so no water fill is
                    drawn.
                  </p>
                )}
                {noHistory && (
                  <p className={styles.muted}>
                    There is not enough river history here to say how unusual the flow is, so no
                    water fill is drawn.
                  </p>
                )}
                {!noHistory && field && field.seedFound && rise <= 0 && (
                  <p className={styles.muted}>
                    Flow is at or below the 2-year level, so no overbank flooding is simulated.
                  </p>
                )}
                <AlertPanel
                  isAdmin={isAdmin}
                  place={place}
                  lat={data.snapped.lat}
                  lng={data.snapped.lng}
                  severity={severity}
                  returnPeriod={
                    forecast &&
                    forecast.returnPeriod != null &&
                    (forecast.daysAhead ?? 0) >= 1 &&
                    (data.current?.returnPeriod == null ||
                      forecast.returnPeriod > data.current.returnPeriod)
                      ? forecast.returnPeriod
                      : (data.current?.returnPeriod ?? null)
                  }
                  capped={
                    forecast &&
                    forecast.returnPeriod != null &&
                    (forecast.daysAhead ?? 0) >= 1 &&
                    (data.current?.returnPeriod == null ||
                      forecast.returnPeriod > data.current.returnPeriod)
                      ? forecast.capped
                      : (data.current?.capped ?? false)
                  }
                  peakDate={forecast && (forecast.daysAhead ?? 0) >= 1 ? forecast.peakDate : null}
                />
                <p className={styles.muted}>{data.attribution}</p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
