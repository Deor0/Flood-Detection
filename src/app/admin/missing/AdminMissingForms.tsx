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
  bulkReopenAction,
  rejectRequestAction,
  type BulkState,
} from './actions';
import local from './admin-missing.module.css';
import { ReasonPicker } from '../ReasonPicker';

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
              {approving ? 'Approving…' : 'Approve (weave in)'}
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
          <p className={local.counsel}>
            Athena&rsquo;s counsel: rejecting unpicks this suggestion only. The record stays as it
            is, and the reason is kept in its history.
          </p>
          <ReasonPicker kind="edit" id={`rej-${requestId}`} label="Reason for rejecting" />
          <div className={styles.formActions} style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={styles.button} disabled={rejecting}>
              {rejecting ? 'Rejecting…' : 'Confirm rejection (unpick)'}
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

/**
 * "Re-open everything marked found by <actor> since <time>". Step 1 previews the matches; step 2
 * re-opens exactly what was previewed, after a confirmation tick.
 */
export function BulkReopenForm() {
  const [state, action, pending] = useActionState(bulkReopenAction, {} as BulkState);
  const preview = state.preview;
  return (
    <div className={styles.inline}>
      <p className={local.counsel}>
        Athena&rsquo;s counsel: use this when one account or phone has marked many people found
        falsely. Every record goes back to missing with your reason in its history. Nothing is
        deleted, and a wrongly re-opened record can simply be marked found again.
      </p>
      <form action={action} className={styles.formGrid}>
        <input type="hidden" name="mode" value="preview" />
        <div className={styles.field}>
          <label htmlFor="bulk-by">Marked found by (Clerk user id or phone)</label>
          <input
            id="bulk-by"
            name="foundBy"
            className={styles.input}
            placeholder="user_… or +15555550100"
            required
            maxLength={100}
            defaultValue={preview?.foundBy}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="bulk-since">Since (UTC)</label>
          <input
            id="bulk-since"
            name="since"
            type="datetime-local"
            className={styles.input}
            required
            defaultValue={preview?.since.slice(0, 16)}
          />
        </div>
        <div className={`${styles.field} ${styles.span2}`}>
          <label htmlFor="bulk-reason">Reason (required, saved on every record)</label>
          <input
            id="bulk-reason"
            name="reason"
            className={styles.input}
            minLength={3}
            maxLength={480}
            required
            defaultValue={preview?.reason}
          />
        </div>
        <div className={`${styles.formActions} ${styles.span2}`}>
          <button
            type="submit"
            className={`${styles.button} ${styles.buttonLight}`}
            disabled={pending}
          >
            {pending && !preview ? 'Checking…' : 'Show what would be re-opened'}
          </button>
        </div>
      </form>
      {preview && !state.ok && (
        <form action={action} className={styles.inline}>
          <input type="hidden" name="mode" value="confirm" />
          <input type="hidden" name="foundBy" value={preview.foundBy} />
          <input type="hidden" name="since" value={preview.since} />
          <input type="hidden" name="reason" value={preview.reason} />
          <p>
            <strong>{preview.names.length}</strong> record{preview.names.length === 1 ? '' : 's'}{' '}
            will go back to missing:
          </p>
          <ul>
            {preview.names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <label>
            <input type="checkbox" name="confirmed" required /> I checked this list. Re-open all of
            them.
          </label>
          <div className={styles.formActions} style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={styles.button} disabled={pending}>
              {pending ? 'Re-opening…' : `Re-open ${preview.names.length}`}
            </button>
          </div>
        </form>
      )}
      <StateBanner state={state} />
    </div>
  );
}
