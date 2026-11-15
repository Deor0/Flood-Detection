import styles from './guide.module.css';

/** Shown the instant the Flood Guide tab is clicked. Fetches nothing. */
export default function Loading() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Flood Guide</h1>
      <p className={styles.lede}>What to do before, during and after a flood.</p>
    </main>
  );
}
