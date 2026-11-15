'use client';

import 'leaflet/dist/leaflet.css';
import type { ImageOverlay as LeafletImageOverlay } from 'leaflet';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { RAMP_DEEP, RAMP_SHALLOW } from './ramp';
import styles from './dashboard.module.css';
import mapStyles from './flood-map.module.css';

/** [south, west, north, east] image bounds, exact in the map projection. */
type Overlay = {
  url: string;
  bounds: [number, number, number, number];
  /** Depth at which the ramp is darkest; drives the legend. */
  rampMax?: number;
};

type Props = {
  picked: { lat: number; lng: number } | null;
  snapped: { lat: number; lng: number } | null;
  /** The current scenario; the only overlay shown when `compare` is off. */
  overlay: Overlay | null;
  /** Scenario A, shown to the left of the divider when `compare` is on (defaults to `overlay`). */
  overlayA?: Overlay | null;
  /** Scenario B, shown to the right of the divider when `compare` is on. */
  overlayB?: Overlay | null;
  /** Side-by-side swipe: A on the left of the divider, B on the right. */
  compare?: boolean;
  /** Names for the two sides, shown on the map. */
  labels?: { a: string; b: string };
  /** Overrides the legend's darkest depth; by default it follows the overlays' `rampMax`. */
  legend?: { rampMax: number } | null;
  onPick: (lat: number, lng: number) => void;
  /** Ask the map to fly somewhere; a new `key` triggers a new flight. */
  view: { lat: number; lng: number; zoom: number; key: number } | null;
};

function ClickCatcher({ onPick }: Pick<Props, 'onPick'>) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180);
    },
  });
  return null;
}

function FlyTo({ view }: Pick<Props, 'view'>) {
  const map = useMap();
  const key = view?.key;
  useEffect(() => {
    if (!view) return;
    map.flyTo([view.lat, view.lng], view.zoom, { duration: 1.2 });
    // Only a new key should fly the map; the other fields come from the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * Clips overlay A to the left of the divider and B to the right, in the map's own pixels. It runs
 * every frame while comparing so the clip follows panning and zooming.
 */
function SwipeClip({
  active,
  pos,
  a,
  b,
}: {
  active: boolean;
  pos: RefObject<number>;
  a: RefObject<LeafletImageOverlay | null>;
  b: RefObject<LeafletImageOverlay | null>;
}) {
  const map = useMap();
  useEffect(() => {
    const clear = () => {
      for (const ref of [a, b]) {
        const el = ref.current?.getElement();
        if (el) el.style.clipPath = '';
      }
    };
    if (!active) {
      clear();
      return;
    }
    let raf = 0;
    const tick = () => {
      const box = map.getContainer().getBoundingClientRect();
      const divider = box.left + (pos.current ?? 0.5) * box.width;
      const sides: Array<[RefObject<LeafletImageOverlay | null>, 'a' | 'b']> = [
        [a, 'a'],
        [b, 'b'],
      ];
      for (const [ref, side] of sides) {
        const el = ref.current?.getElement();
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // clip-path insets are in the element's own pixels; undo any zoom-animation scale.
        const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
        el.style.clipPath =
          side === 'a'
            ? `inset(0 ${Math.max(0, (r.right - divider) / scale)}px 0 0)`
            : `inset(0 0 0 ${Math.max(0, (divider - r.left) / scale)}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [active, map, pos, a, b]);
  return null;
}

const rgb = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function Legend({ rampMax, note }: { rampMax: number; note?: string }) {
  return (
    <div className={mapStyles.legend} role="group" aria-label="Depth legend">
      <span className={mapStyles.legendTitle}>Depth above ground, central estimate</span>
      <span
        className={mapStyles.legendBar}
        style={{ background: `linear-gradient(to right, ${rgb(RAMP_SHALLOW)}, ${rgb(RAMP_DEEP)})` }}
        aria-hidden="true"
      />
      <span className={mapStyles.legendScale}>
        <span>0 m</span>
        <span>{rampMax.toFixed(rampMax < 10 ? 1 : 0)} m</span>
      </span>
      {note && <span className={mapStyles.legendLine}>{note}</span>}
      <span className={mapStyles.legendLine}>
        <span className={mapStyles.dashSwatch} aria-hidden="true" />
        Upper edge of the likely range
      </span>
    </div>
  );
}

export default function FloodMap({
  picked,
  snapped,
  overlay,
  overlayA = null,
  overlayB = null,
  compare = false,
  labels = { a: 'A', b: 'B' },
  legend = null,
  onPick,
  view,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<LeafletImageOverlay | null>(null);
  const bRef = useRef<LeafletImageOverlay | null>(null);
  const posRef = useRef(0.5);
  const [pos, setPos] = useState(0.5);
  const left = compare ? (overlayA ?? overlay) : overlay;
  const comparing = compare && !!left?.url && !!overlayB?.url;

  const setDivider = (value: number) => {
    const next = Math.min(1, Math.max(0, value));
    posRef.current = next;
    setPos(next);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (box && box.width > 0) setDivider((e.clientX - box.left) / box.width);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setDivider(posRef.current - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setDivider(posRef.current + step);
    else if (e.key === 'Home') setDivider(0);
    else if (e.key === 'End') setDivider(1);
    else return;
    e.preventDefault();
  };

  const toBounds = (o: Overlay): [[number, number], [number, number]] => [
    [o.bounds[0], o.bounds[1]],
    [o.bounds[2], o.bounds[3]],
  ];
  const shown = comparing ? [left, overlayB] : [overlay];
  const ramps = shown.flatMap((o) => (o?.url && o.rampMax ? [o.rampMax] : []));
  const rampMax = legend?.rampMax ?? (ramps.length ? Math.max(...ramps) : null);
  const legendNote =
    comparing && left?.rampMax && overlayB?.rampMax && left.rampMax !== overlayB.rampMax
      ? `Colours are scaled per scenario: ${labels.a} to ${left.rampMax.toFixed(1)} m, ${labels.b} to ${overlayB.rampMax.toFixed(1)} m.`
      : undefined;

  return (
    <div className={`${styles.mapWrap} ${mapStyles.wrap}`} ref={wrapRef}>
      <MapContainer
        center={[27.7, 85.32]}
        zoom={7}
        minZoom={2}
        worldCopyJump
        className={styles.map}
        aria-label="World map. Click a point to check the nearest river."
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {(comparing ? left : overlay)?.url && (
          <ImageOverlay
            ref={aRef}
            url={(comparing ? left : overlay)!.url}
            bounds={toBounds((comparing ? left : overlay)!)}
            opacity={0.85}
          />
        )}
        {comparing && overlayB && (
          <ImageOverlay ref={bRef} url={overlayB.url} bounds={toBounds(overlayB)} opacity={0.85} />
        )}
        {picked && (
          <CircleMarker
            center={[picked.lat, picked.lng]}
            radius={5}
            pathOptions={{ color: '#0B1F3A', weight: 2, fillOpacity: 0 }}
          />
        )}
        {snapped && (
          <CircleMarker
            center={[snapped.lat, snapped.lng]}
            radius={7}
            pathOptions={{ color: '#2B4FC7', fillColor: '#2B4FC7', fillOpacity: 0.9, weight: 2 }}
          />
        )}
        <ClickCatcher onPick={onPick} />
        <FlyTo view={view} />
        <SwipeClip active={comparing} pos={posRef} a={aRef} b={bRef} />
      </MapContainer>

      {(overlay?.url || comparing) && <span className={styles.simTag}>SIMULATION</span>}

      {comparing && (
        <>
          <span className={`${mapStyles.sideTag} ${mapStyles.sideA}`}>{labels.a}</span>
          <span className={`${mapStyles.sideTag} ${mapStyles.sideB}`}>{labels.b}</span>
          <div
            className={mapStyles.divider}
            style={{ left: `${pos * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label={`Compare ${labels.a} and ${labels.b}`}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos * 100)}
            aria-valuetext={`${labels.a} on the left ${Math.round(pos * 100)} percent, ${labels.b} on the right`}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
            }}
          >
            <span className={mapStyles.knob} aria-hidden="true" />
          </div>
        </>
      )}

      {rampMax && <Legend rampMax={rampMax} note={legendNote} />}
    </div>
  );
}
