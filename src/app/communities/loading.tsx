import { ListSkeleton } from '@/components/ListSkeleton';
import styles from '@/components/page-ui.module.css';

/** Shown the instant the Communities tab is clicked. Fetches nothing. */
export default function Loading() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Community Awareness Programs</h1>
          <p className={styles.lede}>
            Verified local disaster preparedness drills, first-aid workshops, flood safety sessions,
            and emergency volunteer briefings happening nearby.
          </p>
        </div>
      </div>
      <ListSkeleton />
    </main>
  );
}
