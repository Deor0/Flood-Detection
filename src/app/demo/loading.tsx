import { ListSkeleton } from '@/components/ListSkeleton';
import styles from '../dashboard/dashboard.module.css';

/** Shown instantly while the demo shell loads. Fetches nothing. */
export default function Loading() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Flood desk demo</h1>
      <ListSkeleton />
    </main>
  );
}
