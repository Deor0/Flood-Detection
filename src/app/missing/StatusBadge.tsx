import styles from '@/components/page-ui.module.css';

/** Two statuses only, in plain words. */
export const STATUS_LABEL = {
  missing: 'MISSING',
  found: 'FOUND',
} as const;

/** A record shows MISSING until it is confirmed found, including while a found report waits. */
export function StatusBadge({ status }: { status: 'missing' | 'found' }) {
  const found = status === 'found';
  return (
    <span className={`${styles.badge} ${found ? styles.badgeFound : styles.badgeMissing}`}>
      {found ? STATUS_LABEL.found : STATUS_LABEL.missing}
    </span>
  );
}
