import Link from 'next/link';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import ui from '@/components/page-ui.module.css';
import { getViewer } from '@/lib/roles';
import { FloodMapLoader } from './FloodMapLoader';
import { Disclaimers } from './Disclaimers';
import styles from './dashboard.module.css';

/** Server shell. The title paints at once; the viewer lookup and the map stream in behind it. */
export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Flood desk</h1>
        <p className={styles.lede}>
          Click anywhere on the map to see the nearest river&apos;s discharge, how unusual it is,
          and a simulated water fill on real terrain.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Desk />
      </Suspense>
      <Disclaimers />
    </main>
  );
}

async function Desk() {
  const viewer = await getViewer();
  return (
    <>
      {/* River lookups are public; only recording a simulated alert needs an admin account. */}
      {!viewer.userId && (
        <p className={ui.lede}>
          No account needed: click any river to look it up. Recording a simulated alert is for
          admins. For a quick tour, open the <Link href="/demo">saved demo</Link>.
        </p>
      )}
      <FloodMapLoader isAdmin={viewer.isAdmin} />
    </>
  );
}
