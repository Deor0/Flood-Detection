'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertPanel } from './AlertPanel';
import { DischargeChart } from './DischargeChart';
import { ReplayPanel } from './ReplayPanel';
import { ScenarioPanel } from './ScenarioPanel';
import {
  DEFAULT_SCENARIO,
  forecastDays,
  normalFlowFor,
  plainSeverity,
  resolveScenario,
  splitSeverity,
  surgeLine,
  todayIso,
  wayHomeLabel,
  type ScenarioState,
} from './scenario';
import { liveSource, type FloodSource } from './sources';
import {
  latLngOf,
  pixelOf,
  prepareTerrain,
  renderOverlay,
  simulate,
  type Overlay,
  type SimResult,
  type Terrain,
} from './water';
import type { FloodData } from './types';
import styles from './dashboard.module.css';

const FloodMap = dynamic(() => import('./FloodMap'), {
  ssr: false,
  loading: () => <div className={styles.mapWrap} aria-busy="true" />,
});

type Mode = 'live' | 'replay';
type View = { lat: number; lng: number; zoom: number; key: number };

export type Preset = { id: string; label: string; lat: number; lng: number };

const RASUWA = { lat: 28.17, lng: 85.33 };

const SEVERITY_LABEL = {
  normal: 'Normal',
  watch: 'Watch',
  warning: 'Warning',
  severe: 'Severe',
  unknown: 'Not enough history',
} as const;

type Props = {
  isAdmin: boolean;
  /** Where data comes from. Defaults to the live routes. */
  source?: FloodSource;
  /** Saved places to pick from (used by the public demo). */
  presets?: Preset[];
  /** Demo mode: the map cannot be clicked, only the saved places can be chosen. */
  demo?: boolean;
};

const fmtQ = (q: number) => (q >= 100 ? Math.round(q).toLocaleString('en') : q.toFixed(1));
const fmtM = (m: number) => m.toFixed(m < 10 ? 1 : 0);

export default function FloodDesk({ isAdmin, source = liveSource, presets, demo = false }: Props) {
  const [mode, setMode] = useState<Mode>('live');
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [data, setData] = useState<FloodData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [terrainNote, setTerrainNote] = useState('');
  const [scenario, setScenario] = useState<ScenarioState>(DEFAULT_SCENARIO);
  const [result, setResult] = useState<{
    key: string;
    sim: SimResult;
    overlay: Overlay | null;
  } | null>(null);
  const [saved, setSaved] = useState<{ label: string; overlay: Overlay | null } | null>(null);
  const [compareOn, setCompareOn] = useState(true);
  const [wayHomeOn, setWayHomeOn] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const terrainRef = useRef<Terrain | null>(null);
  const flights = useRef(0);

  const fly = useCallback((lat: number, lng: number, zoom: number) => {
    flights.current += 1;
    setView({ lat, lng, zoom, key: flights.current });
  }, []);

  const onPick = useCallback(
    (lat: number, lng: number) => {
      abort.current?.abort();
      terrainRef.current?.dispose();
      terrainRef.current = null;
      const controller = new AbortController();
      abort.current = controller;
      setPicked({ lat, lng });
      setData(null);
      setTerrain(null);
      setResult(null);
      setSaved(null);
      setTerrainNote('');
      setError('');
      setStatus('loading');
      (async () => {
        try {
          const json = await source.loadFlood(lat, lng, controller.signal);
          setData(json);
          setStatus('idle');
          // Open on the forecast peak when it is bigger than today, and say so on screen.
          const f = json.forecast;
          const today = json.current?.discharge ?? null;
          const day =
            f &&
            f.peakDischarge != null &&
            (f.daysAhead ?? 0) >= 1 &&
            f.peakDischarge > (today ?? 0)
              ? Math.min(f.daysAhead ?? 0, 15)
              : 0;
          setScenario({ ...DEFAULT_SCENARIO, day });
          if (!json.noRiver) {
            fly(json.snapped.lat, json.snapped.lng, 12);
            try {
              setTerrainNote('Loading terrain…');
              const prepared = await prepareTerrain(
                json.snapped.lat,
                json.snapped.lng,
                source.loadTile,
                controller.signal,
              );
              if (controller.signal.aborted) {
                prepared.dispose();
                return;
              }
              terrainRef.current = prepared;
              setTerrain(prepared);
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
    [fly, source],
  );

  const choose = useCallback(
    (lat: number, lng: number, zoom: number) => {
      fly(lat, lng, zoom);
      onPick(lat, lng);
    },
    [fly, onPick],
  );

  useEffect(
    () => () => {
      abort.current?.abort();
      terrainRef.current?.dispose();
    },
    [],
  );

  const today = useMemo(() => todayIso(), []);
  const resolved = useMemo(
    () => (data && !data.noRiver ? resolveScenario(data, scenario, today) : null),
    [data, scenario, today],
  );
  const maxDay = useMemo(() => (data ? forecastDays(data, today) : 0), [data, today]);

  // Re-run the water fill when the flow or roughness changes; the terrain is only prepared once.
  // The last result stays on screen while the next one is computed, so the map does not flicker.
  // The terrain already shows the river at its normal flow, so only the rise above it is drawn.
  const q = resolved?.q ?? null;
  const qBase = useMemo(() => (data ? normalFlowFor(data, today) : null), [data, today]);
  // The high-ground search starts at the click when it is inside the terrain window.
  const origin = useMemo(
    () => (terrain && picked ? pixelOf(terrain, picked.lat, picked.lng) : null),
    [terrain, picked],
  );
  const originKey = origin ? `${origin.x},${origin.y}` : '';
  const canSim = terrain !== null && q !== null && q > 0;
  const simKey = canSim ? `${q}|${scenario.roughness}|${qBase}|${originKey}` : null;
  useEffect(() => {
    if (!terrain || q === null || q <= 0) return;
    const key = `${q}|${scenario.roughness}|${qBase}|${originKey}`;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const sim = await simulate(terrain, {
          q,
          nScale: scenario.roughness,
          qBase: qBase ?? undefined,
          origin: origin ?? undefined,
        });
        if (!current) return;
        const drawn = renderOverlay(terrain, sim);
        setResult({ key, sim, overlay: drawn.url ? drawn : null });
      } catch (e) {
        if (!current) return;
        setTerrainNote(
          e instanceof Error ? `Simulation failed: ${e.message}` : 'Simulation failed.',
        );
      }
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // `origin` is captured through `originKey`, which changes whenever it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, q, scenario.roughness, qBase, originKey]);
  const sim = canSim ? (result?.sim ?? null) : null;
  const overlay = canSim ? (result?.overlay ?? null) : null;
  const simulating = simKey !== null && result?.key !== simKey;

  const patchScenario = useCallback(
    (patch: Partial<ScenarioState>) => setScenario((s) => ({ ...s, ...patch })),
    [],
  );

  const severity = data?.current?.severity ?? 'unknown';
  const split = data ? splitSeverity(data) : null;
  const place =
    data?.place || (data ? `${data.snapped.lat.toFixed(2)}, ${data.snapped.lng.toFixed(2)}` : '');
  const forecast = data?.forecast ?? null;
  const q2 = data?.climatology?.q2 ?? null;
  const noHistory = !q2;
  const showsOverlay = mode === 'live' && overlay !== null;
  const comparing = showsOverlay && saved?.overlay != null && compareOn;
  const snapKm = data?.snapDistanceKm;
  const sameAsToday = scenario.day === 0 && scenario.multiplier === 1 && !scenario.breach;
  const todayRp =
    data?.current?.returnPeriod != null
      ? { value: data.current.returnPeriod, capped: data.current.capped }
      : null;
  const forecastRp =
    forecast && forecast.returnPeriod != null && (forecast.daysAhead ?? 0) >= 1
      ? { value: forecast.returnPeriod, capped: forecast.capped }
      : null;
  // The surge line follows whichever of today and the forecast peak drives the headline.
  const surge =
    split && split.forecastPeak !== 'unknown' && severity === split.forecastPeak && forecastRp
      ? surgeLine(split.forecastPeak, forecastRp, 'forecast')
      : surgeLine(split?.today ?? 'unknown', todayRp, 'today');

  // Way home: dashed line from the click to the nearest cell that stays dry at this level.
  const hg = sim?.highGround ?? null;
  const wayHome = useMemo(() => {
    if (!terrain || !hg) return null;
    const from = latLngOf(terrain, hg.fromX, hg.fromY);
    const to = latLngOf(terrain, hg.x, hg.y);
    return { from, to, label: wayHomeLabel(from, to, hg.distM) };
  }, [terrain, hg]);
  const showWayHome = mode === 'live' && overlay !== null && wayHome !== null;

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
        {showsOverlay && <span className={styles.badgeSim}>SIMULATION</span>}
      </div>

      {mode === 'replay' ? (
        <ReplayPanel />
      ) : (
        <>
          {demo && (
            <p className={styles.demoBanner}>
              Demo with saved data. Choose one of the rivers below, or open the live flood desk to
              check any river in the world (no account needed).
            </p>
          )}
          <div className={styles.toolbar}>
            {presets && presets.length > 0 ? (
              <div className={styles.presets} role="group" aria-label="Saved rivers">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.try}
                    onClick={() => choose(p.lat, p.lng, 11)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className={styles.try}
                onClick={() => choose(RASUWA.lat, RASUWA.lng, 11)}
              >
                Try Rasuwa (Trishuli river)
              </button>
            )}
          </div>

          <div className={styles.layout}>
            <div className={styles.stack}>
              <FloodMap
                view={view}
                picked={picked}
                snapped={data && !data.noRiver ? data.snapped : null}
                overlay={showsOverlay ? overlay : null}
                overlayA={comparing ? (saved?.overlay ?? null) : null}
                overlayB={comparing ? overlay : null}
                compare={comparing}
                labels={{ a: 'A (saved)', b: 'B (now)' }}
                onPick={demo ? () => undefined : onPick}
                wayHome={showWayHome && wayHomeOn ? wayHome : null}
              />
              <section className={styles.panel} aria-live="polite">
                {status === 'idle' && !picked && (
                  <p className={styles.muted}>
                    {demo
                      ? 'Choose a saved river above.'
                      : 'Click the map to check the nearest river.'}
                  </p>
                )}
                {status === 'loading' && (
                  <p className={styles.muted}>
                    Reading river data… The first look at a river can take up to a minute while its
                    history downloads. Later clicks on the same river are faster.
                  </p>
                )}
                {status === 'error' && <p className={styles.error}>{error}</p>}
                {data?.noRiver && (
                  <p>
                    No river found within about 3 km of that point in the river model. Try a point
                    on or beside a large river.
                  </p>
                )}
                {data && !data.noRiver && resolved && (
                  <>
                    <div className={styles.headline}>
                      <h2 className={styles.h2}>{place}</h2>
                      <span
                        className={`${styles.severity} ${styles[`sev_${severity}`]}`}
                        title="Headline colour: the worse of today and the next 15 days"
                      >
                        Today: {SEVERITY_LABEL[split?.today ?? 'unknown']} · Next 15 days:{' '}
                        {SEVERITY_LABEL[split?.forecastPeak ?? 'unknown']}
                      </span>
                    </div>
                    <p className={styles.plain}>
                      {surge && (
                        <>
                          <strong>{surge}.</strong>{' '}
                        </>
                      )}
                      {plainSeverity(
                        sameAsToday ? todayRp : resolved.returnPeriod,
                        sameAsToday ? data.climatology?.returnPeriodRange : undefined,
                      )}
                    </p>
                    {snapKm != null && (
                      <p className={snapKm > 3 ? styles.warnLine : styles.infoLine}>
                        River cell {snapKm.toFixed(1)} km from your click
                        {snapKm > 3
                          ? '. This may be a different river from the one you meant; click closer to the river you want.'
                          : '.'}
                      </p>
                    )}
                    <dl className={styles.facts}>
                      <div>
                        <dt>
                          {data.current?.dischargeDate
                            ? `Discharge on ${data.current.dischargeDate} (model value)`
                            : 'Discharge (model value)'}
                        </dt>
                        <dd>
                          {data.current?.discharge == null
                            ? 'n/a'
                            : `${fmtQ(data.current.discharge)} m³/s`}
                        </dd>
                      </div>
                      <div>
                        <dt>Return period today</dt>
                        <dd>
                          {todayRp === null
                            ? 'Not enough history'
                            : `${todayRp.capped ? '40+' : todayRp.value.toFixed(1)} years`}
                        </dd>
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
                    <p className={styles.showing}>{resolved.summary}</p>
                    {sim && (
                      <p className={styles.depthRange}>
                        Water rise above the river&apos;s normal level: likely {fmtM(sim.stage.low)}{' '}
                        to {fmtM(sim.stage.high)} m (middle estimate {fmtM(sim.stage.central)} m).
                        Assumed channel roughness, 30% either way.
                      </p>
                    )}
                    {showWayHome && wayHome && (
                      <p className={styles.infoLine}>
                        <label>
                          <input
                            type="checkbox"
                            checked={wayHomeOn}
                            onChange={(e) => setWayHomeOn(e.target.checked)}
                          />{' '}
                          Way home (estimate): {wayHome.label}
                          {origin ? ' from your click' : ' from the river point'}. Straight line on
                          the terrain model, not a route; roads, walls and local knowledge come
                          first.
                        </label>
                      </p>
                    )}
                    {data.series && (
                      <DischargeChart
                        days={data.series.days}
                        discharge={data.series.discharge}
                        q2={q2}
                        fit={data.climatology?.fit ?? null}
                        ensemble={data.forecast?.ensemble}
                        markerDate={scenario.basis === 'forecast' ? resolved.date : null}
                        today={today}
                      />
                    )}
                    {terrainNote && <p className={styles.muted}>{terrainNote}</p>}
                    {terrain?.seedWarning && (
                      <p className={styles.warnLine}>{terrain.seedWarning}</p>
                    )}
                    {noHistory && (
                      <p className={styles.muted}>
                        There is not enough river history here to say how unusual the flow is.
                      </p>
                    )}
                    {terrain && !simulating && !sim && q !== null && q > 0 && (
                      <p className={styles.muted}>
                        No river channel found in the terrain near this point, so no water fill is
                        drawn.
                      </p>
                    )}
                    {sim && !overlay && (
                      <p className={styles.muted}>
                        At this flow the water stays inside the river channel, so nothing is drawn
                        on the map.
                      </p>
                    )}
                    {data.caveats && data.caveats.length > 0 && (
                      <ul className={styles.caveats} aria-label="Things to keep in mind">
                        {data.caveats.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
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
                      peakDate={
                        forecast && (forecast.daysAhead ?? 0) >= 1 ? forecast.peakDate : null
                      }
                    />
                    <p className={styles.muted}>{data.attribution}</p>
                  </>
                )}
              </section>
            </div>

            {data && !data.noRiver && resolved && (
              <ScenarioPanel
                data={data}
                state={scenario}
                onChange={patchScenario}
                onReset={() => setScenario({ ...DEFAULT_SCENARIO })}
                resolved={resolved}
                maxDay={maxDay}
                computing={simulating}
                savedA={saved?.label ?? null}
                compareOn={compareOn}
                canSave={overlay !== null}
                onSaveA={() => {
                  setSaved({ label: resolved.summary, overlay });
                  setCompareOn(true);
                }}
                onClearA={() => setSaved(null)}
                onToggleCompare={setCompareOn}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
