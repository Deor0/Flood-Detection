import { ListSkeleton } from '@/components/ListSkeleton';
import styles from '@/components/page-ui.module.css';
import local from './programs.module.css';

/** Shown the instant the Communities tab is clicked. Fetches nothing. */
export default function Loading() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={local.kicker}>Open Doors</p>
          <h1 className={styles.title}>Community Awareness Programs</h1>
          <p className={styles.lede}>
            Shelter, supplies, rides and cleanup crews offered by neighbors, plus preparedness
            drills, first-aid workshops and volunteer briefings — each reviewed by our team. Like
            Eumaeus taking in a stranger at his door, open yours to someone the water has displaced.
          </p>
        </div>
      </div>
      <ListSkeleton />
    </main>
  );
}
