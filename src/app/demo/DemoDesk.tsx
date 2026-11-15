'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import type { Preset } from '../dashboard/FloodDesk';
import { decodeTile, type FloodSource } from '../dashboard/sources';
import type { FloodData } from '../dashboard/types';

/** Leaflet needs `window`, so the desk loads only in the browser. */
const FloodDesk = dynamic(() => import('../dashboard/FloodDesk'), {
  ssr: false,
  loading: () => <ListSkeleton />,
});

export type DemoPreset = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  note: string;
};

/**
 * The public demo: the same flood desk, fed from saved files under /geo/demo instead of the
 * signed-in routes. No account, database or live service is used.
 */
export function DemoDesk({ presets }: { presets: DemoPreset[] }) {
  /** The river most recently loaded, so terrain tiles come from its own folder. */
  const current = useRef(presets[0]?.slug ?? '');
  const { deskPresets, source } = useMemo(() => {
    const bySlug = new Map(presets.map((p) => [p.slug, p]));
    const deskPresets: Preset[] = presets.map((p) => ({
      id: p.slug,
      label: p.name,
      lat: p.lat,
      lng: p.lng,
    }));

    const nearest = (lat: number, lng: number) => {
      let best = presets[0];
      let bestD = Infinity;
      for (const p of presets) {
        const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
      return best;
    };

    const source: FloodSource = {
      async loadFlood(lat, lng, signal) {
        const preset = nearest(lat, lng);
        current.current = preset.slug;
        const res = await fetch(`/geo/demo/${preset.slug}/flood.json`, { signal });
        if (!res.ok) throw new Error(`Saved demo data is missing (${res.status}).`);
        return (await res.json()) as FloodData;
      },
      async loadTile(z, x, y, signal) {
        const slug = bySlug.has(current.current) ? current.current : (presets[0]?.slug ?? '');
        const res = await fetch(`/geo/demo/${slug}/dem/${z}/${x}/${y}.png`, { signal });
        if (!res.ok) throw new Error(`Saved terrain tile is missing (${res.status}).`);
        return decodeTile(await res.blob());
      },
    };
    return { deskPresets, source };
  }, [presets]);

  return <FloodDesk isAdmin={false} demo presets={deskPresets} source={source} />;
}
