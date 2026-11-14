'use client';

import { useActionState, useState } from 'react';
import { StateBanner } from '@/components/FormBits';
import styles from '@/components/page-ui.module.css';
import type { FormState } from '@/app/form-state';
import { DetailFields, type Details } from '@/app/missing/MissingForms';
import {
  adminEditAction,
  adminReopenAction,
  approveRequestAction,
  rejectRequestAction,
} from './actions';
import local from './admin-missing.module.css';

const initial: FormState = {};

/** Approve, or reject with a required reason. */
export function ReviewButtons({ requestId }: { requestId: string }) {
  const [approveState, approve, approving] = useActionState(
    approveRequestAction.bind(null, requestId) as (s: FormState) => Promise<FormState>,
    initial,
  );
  const [rejectState, reject, rejecting] = useActionState(
    rejectRequestAction.bind(null, requestId),
    initial,
  );
  const [rejectOpen, setRejectOpen] = useState(false);
  const done = approveState.ok || rejectState.ok;
  return (
    <div className={local.review}>
      {!done && (
        <div className={styles.actions}>
          <form action={approve}>
            <button
              type="submit"
              className={`${styles.button} ${styles.smallButton}`}
              disabled={approving}
            >
              {approving ? 'Approving…' : 'Approve'}
            </button>
          </form>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
            aria-expanded={rejectOpen}
            onClick={() => setRejectOpen(!rejectOpen)}
          >
            Reject
          </button>
        </div>
      )}
      {rejectOpen && !done && (
        <form action={reject} className={styles.inline}>
          <div className={styles.field}>
            <label htmlFor={`rej-${requestId}`}>Reason for rejecting (required)</label>
            <input
              id={`rej-${requestId}`}
              name="reason"
              className={styles.input}
              minLength={3}
              maxLength={500}
              required
            />
          </div>
          <div className={styles.formActions} style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={styles.button} disabled={rejecting}>
              {rejecting ? 'Rejecting…' : 'Confirm rejection'}
            </button>
          </div>
        </form>
      )}
      <StateBanner state={approveState} />
      <StateBanner state={rejectState} />
    </div>
  );
}

/** Direct edit and (for found records) re-open, for one record. */
export function AdminRecordActions({
  id,
  status,
  values,
}: {
  id: string;
  status: 'missing' | 'found';
  values: Details;
}) {
  const [panel, setPanel] = useState<'edit' | 'reopen' | null>(null);
  const [editState, edit, editing] = useActionState(adminEditAction.bind(null, id), initial);
  const [reopenState, reopen, reopening] = useActionState(
    adminReopenAction.bind(null, id),
    initial,
  );
  return (
    <>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
          aria-expanded={panel === 'edit'}
          onClick={() => setPanel(panel === 'edit' ? null : 'edit')}
        >
          Edit details
        </button>
        {status === 'found' && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
            aria-expanded={panel === 'reopen'}
            onClick={() => setPanel(panel === 'reopen' ? null : 'reopen')}
          >
            Re-open
          </button>
        )}
      </div>
      {panel === 'edit' && (
        <form action={edit} noValidate className={`${styles.inline} ${styles.formGrid}`}>
          <DetailFields state={editState} values={values} />
          <div className={`${styles.formActions} ${styles.span2}`}>
            <button type="submit" className={styles.button} disabled={editing}>
              {editing ? 'Saving…' : 'Save changes'}
            </button>
            <StateBanner state={editState} />
          </div>
        </form>
      )}
      {panel === 'reopen' && (
        <div className={styles.inline}>
          {reopenState.ok ? (
            <StateBanner state={reopenState} />
          ) : (
            <form action={reopen}>
              <div className={styles.field}>
                <label htmlFor={`reopen-${id}`}>
                  Why is this record being re-opened? (required)
                </label>
                <input
                  id={`reopen-${id}`}
                  name="reason"
                  className={styles.input}
                  minLength={3}
                  maxLength={500}
                  required
                />
              </div>
              <div className={styles.formActions} style={{ marginTop: '0.75rem' }}>
                <button type="submit" className={styles.button} disabled={reopening}>
                  {reopening ? 'Saving…' : 'Re-open record'}
                </button>
                <StateBanner state={reopenState} />
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
