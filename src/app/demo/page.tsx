import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Disclaimers } from '../dashboard/Disclaimers';
import styles from '../dashboard/dashboard.module.css';
import { DemoDesk, type DemoPreset } from './DemoDesk';

export const metadata = {
  title: 'Flood desk demo: try it without an account',
  description:
    'Five saved rivers you can explore without signing in. Saved data, an educational simulation, not an official forecast.',
};

type Index = { asOf: string; presets: DemoPreset[] };

/** Reads the saved-data index written by scripts/build-demo.mjs. Static files only. */
async function readIndex(): Promise<Index | null> {
  try {
    const file = path.join(process.cwd(), 'public', 'geo', 'demo', 'index.json');
    const body = JSON.parse(await readFile(file, 'utf8')) as Index;
    return Array.isArray(body.presets) && body.presets.length > 0 ? body : null;
  } catch {
    return null;
  }
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
}

/** Public shell (no Clerk, no database). The title paints at once; the saved data streams in. */
export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Flood desk demo</h1>
        <p className={styles.lede}>
          Demo with saved data. Sign in to click any river. <Link href="/sign-in">Sign in</Link> or{' '}
          <Link href="/">go back home</Link>.
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
  const index = await readIndex();
  if (!index) {
    return (
      <p className={styles.muted}>
        The saved demo data is not available. Sign in to use the live flood desk.
      </p>
    );
  }
  return (
    <>
      <p className={styles.muted}>
        <strong>SAVED DATA as of {formatDate(index.asOf)}</strong> (UTC). SIMULATION: educational
        only, not an official forecast.
      </p>
      <DemoDesk presets={index.presets} />
    </>
  );
}
