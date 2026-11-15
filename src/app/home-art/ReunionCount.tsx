import Link from 'next/link';
import { countHomeSafe } from '@/core/missing/stats';
import { getDb } from '@/db';
import styles from '../landing.module.css';

const TIMEOUT_MS = 4000;

/** Found-count from the registry, or null if the database is missing, failing or slow. */
async function loadCount(): Promise<number | null> {
  try {
    return await Promise.race([
      countHomeSafe(getDb()),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error('reunion count failed', err);
    return null;
  }
}

/** "N people home safe": records marked found in the registry. Hidden if the count is unknown. */
export async function ReunionCount() {
  const n = await loadCount();
  if (n === null) return <ReunionFallback />;
  return (
    <p className={styles.reunion}>
      <strong>
        {n.toLocaleString('en-US')} {n === 1 ? 'person' : 'people'} home safe
      </strong>
      <span className={styles.reunionTheme}>Threads rewoven on Penelope&apos;s loom.</span>
      <Link href="/find" className={styles.reunionLink}>
        Search the registry
      </Link>
    </p>
  );
}

/** Shown while loading and when the count is unavailable: no number, nothing misleading. */
export function ReunionFallback() {
  return (
    <p className={styles.reunion}>
      <strong>Reuniting families</strong>
      <span className={styles.reunionTheme}>Threads rewoven on Penelope&apos;s loom.</span>
      <Link href="/find" className={styles.reunionLink}>
        Search the registry
      </Link>
    </p>
  );
}
