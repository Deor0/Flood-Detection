import { ListSkeleton } from '@/components/ListSkeleton';
import styles from './dashboard.module.css';

/** Shown the instant the Dashboard tab is clicked. Fetches nothing. */
export default function Loading() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Flood desk</h1>
      <ListSkeleton />
    </main>
  );
}
