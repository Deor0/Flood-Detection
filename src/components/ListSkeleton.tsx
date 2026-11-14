import styles from './page-ui.module.css';

/** Three card-shaped placeholders shown while a result list loads. */
export function ListSkeleton() {
  return (
    <div className={styles.skeletonList} aria-busy="true" aria-live="polite">
      <p className={styles.skeletonStatus}>Loading records</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonCard} aria-hidden="true">
          <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
          <div className={styles.skeletonLine} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
        </div>
      ))}
    </div>
  );
}
