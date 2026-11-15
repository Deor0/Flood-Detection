'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import styles from './dashboard.module.css';

type Props = {
  picked: { lat: number; lng: number } | null;
  snapped: { lat: number; lng: number } | null;
  overlay: { url: string; bounds: [number, number, number, number] } | null;
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

export default function FloodMap({ picked, snapped, overlay, onPick, view }: Props) {
  return (
    <div className={styles.mapWrap}>
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
        {overlay && (
          <ImageOverlay
            url={overlay.url}
            bounds={[
              [overlay.bounds[0], overlay.bounds[1]],
              [overlay.bounds[2], overlay.bounds[3]],
            ]}
            opacity={0.85}
          />
        )}
        {picked && (
          <CircleMarker
            center={[picked.lat, picked.lng]}
            radius={5}
            pathOptions={{ color: '#0d2b38', weight: 2, fillOpacity: 0 }}
          />
        )}
        {snapped && (
          <CircleMarker
            center={[snapped.lat, snapped.lng]}
            radius={7}
            pathOptions={{ color: '#0e6f7e', fillColor: '#0e6f7e', fillOpacity: 0.9, weight: 2 }}
          />
        )}
        <ClickCatcher onPick={onPick} />
        <FlyTo view={view} />
      </MapContainer>
      {overlay && <span className={styles.simTag}>SIMULATION</span>}
    </div>
  );
}
