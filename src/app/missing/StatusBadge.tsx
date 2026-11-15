import styles from '@/components/page-ui.module.css';

/** Plain status first, the Odyssey line second. */
export const STATUS_LABEL = {
  missing: 'MISSING · Still at sea',
  found: 'FOUND · Home (Ithaca)',
  claimed: 'REPORTED SAFE — confirming',
} as const;

/**
 * `claimed`: someone other than the reporter said the person is safe and the reporter or an
 * admin has not confirmed it yet. The record is still missing until then.
 */
export function StatusBadge({
  status,
  claimed = false,
}: {
  status: 'missing' | 'found';
  claimed?: boolean;
}) {
  const found = status === 'found';
  return (
    <span className={`${styles.badge} ${found ? styles.badgeFound : styles.badgeMissing}`}>
      {found ? STATUS_LABEL.found : claimed ? STATUS_LABEL.claimed : STATUS_LABEL.missing}
    </span>
  );
}
