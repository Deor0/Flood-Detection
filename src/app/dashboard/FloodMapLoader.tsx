'use client';

import dynamic from 'next/dynamic';
import { ListSkeleton } from '@/components/ListSkeleton';

/** Leaflet needs `window`, so the desk is loaded only in the browser. */
const FloodDesk = dynamic(() => import('./FloodDesk'), {
  ssr: false,
  loading: () => <ListSkeleton />,
});

export function FloodMapLoader({ isAdmin }: { isAdmin: boolean }) {
  return <FloodDesk isAdmin={isAdmin} />;
}
