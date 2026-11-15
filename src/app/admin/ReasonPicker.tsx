import styles from '@/components/page-ui.module.css';
import { REJECT_REASON_TEMPLATES } from '@/core/admin/reasons';

/**
 * A common reason (select) plus optional free text. The server combines them with
 * `composeReason`; at least one of the two is needed.
 */
export function ReasonPicker({
  kind,
  id,
  label,
}: {
  kind: keyof typeof REJECT_REASON_TEMPLATES;
  id: string;
  label: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={`${id}-tpl`}>{label}</label>
      <select id={`${id}-tpl`} name="reasonTemplate" className={styles.input} defaultValue="">
        <option value="">Pick a common reason (optional)</option>
        {REJECT_REASON_TEMPLATES[kind].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <label htmlFor={id} style={{ marginTop: '0.4rem' }}>
        Details (required if no common reason is picked)
      </label>
      <textarea id={id} name="reason" rows={2} maxLength={400} className={styles.input} />
    </div>
  );
}
