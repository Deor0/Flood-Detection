import { ListSkeleton } from '@/components/ListSkeleton';
import styles from '@/components/page-ui.module.css';
import local from './missing.module.css';

/** Shown the instant the Missing People tab is clicked. Fetches nothing. */
export default function Loading() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={local.kicker}>The Long Way Home</p>
          <h1 className={styles.title}>Missing Persons Registry</h1>
          <p className={styles.lede}>
            Search the registry, report someone who is missing, or mark a person as found.
          </p>
        </div>
      </div>
      <ListSkeleton />
    </main>
  );
}
