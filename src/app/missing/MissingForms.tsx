'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { History, Pencil, UserCheck } from 'lucide-react';
import { FieldError, StateBanner, inputClass } from '@/components/FormBits';
import styles from '@/components/page-ui.module.css';
import type { FormState } from '@/app/form-state';
import {
  editAction,
  markFoundAction,
  reopenAction,
  reportAction,
  requestEditAction,
} from './actions';

const initial: FormState = {};

export type Details = {
  name?: string;
  age?: number | null;
  lastSeenLocation?: string | null;
  notes?: string | null;
  contact?: string | null;
};

export function DetailFields({
  state,
  values,
  hideContact,
}: {
  state: FormState;
  values?: Details;
  hideContact?: boolean;
}) {
  const f = (name: string) => ({
    id: `f-${name}-${values?.name ?? 'new'}`,
    name,
    className: inputClass(state, name),
    'aria-invalid': !!state.fields?.[name],
  });
  return (
    <>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor={f('name').id}>Full name</label>
        <input {...f('name')} defaultValue={values?.name ?? ''} autoComplete="off" required />
        <FieldError state={state} name="name" />
      </div>
      <div className={styles.field}>
        <label htmlFor={f('age').id}>Age</label>
        <input {...f('age')} defaultValue={values?.age ?? ''} inputMode="numeric" />
        <FieldError state={state} name="age" />
      </div>
      <div className={styles.field}>
        <label htmlFor={f('lastSeenLocation').id}>Last seen location</label>
        <input {...f('lastSeenLocation')} defaultValue={values?.lastSeenLocation ?? ''} />
        <FieldError state={state} name="lastSeenLocation" />
      </div>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor={f('notes').id}>Notes</label>
        <textarea {...f('notes')} defaultValue={values?.notes ?? ''} rows={2} />
        <FieldError state={state} name="notes" />
      </div>
      {!hideContact && (
        <div className={`${styles.field} ${styles.span2}`}>
          <label htmlFor={f('contact').id}>Contact / case lead</label>
          <input {...f('contact')} defaultValue={values?.contact ?? ''} />
          <FieldError state={state} name="contact" />
        </div>
      )}
    </>
  );
}

export function ReportForm() {
  const [state, action, pending] = useActionState(reportAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} noValidate className={styles.formGrid}>
      <DetailFields state={state} />
      <div className={`${styles.formActions} ${styles.span2}`}>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? 'Filing…' : 'File report'}
        </button>
        <StateBanner state={state} />
      </div>
    </form>
  );
}

/** Mark-as-found, edit (or suggest an edit) and, for admins, re-open controls for one record. */
export function PersonActions({
  id,
  status,
  values,
  canEditDirectly,
  isAdmin,
}: {
  id: string;
  status: 'missing' | 'found';
  values: Details;
  canEditDirectly: boolean;
  isAdmin: boolean;
}) {
  const [panel, setPanel] = useState<'found' | 'edit' | 'reopen' | null>(null);
  const [foundState, foundAction, foundPending] = useActionState(
    markFoundAction.bind(null, id),
    initial,
  );
  const [editState, editFormAction, editPending] = useActionState(
    (canEditDirectly ? editAction : requestEditAction).bind(null, id),
    initial,
  );
  const [reopenState, reopenFormAction, reopenPending] = useActionState(
    reopenAction.bind(null, id),
    initial,
  );
  const toggle = (p: 'found' | 'edit' | 'reopen') => setPanel(panel === p ? null : p);

  return (
    <>
      <div className={styles.actions}>
        {status === 'missing' && (
          <button
            type="button"
            className={`${styles.button} ${styles.smallButton}`}
            aria-expanded={panel === 'found'}
            onClick={() => toggle('found')}
          >
            <UserCheck size={14} aria-hidden="true" /> Mark as found
          </button>
        )}
        <button
          type="button"
          className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
          aria-expanded={panel === 'edit'}
          onClick={() => toggle('edit')}
        >
          <Pencil size={14} aria-hidden="true" />{' '}
          {canEditDirectly ? 'Edit details' : 'Suggest an edit'}
        </button>
        {isAdmin && status === 'found' && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
            aria-expanded={panel === 'reopen'}
            onClick={() => toggle('reopen')}
          >
            <History size={14} aria-hidden="true" /> Re-open
          </button>
        )}
      </div>

      {/* Stays mounted after success (the record flips to "found" on refresh) so the message shows. */}
      {panel === 'found' && (
        <div className={styles.inline}>
          {foundState.ok ? (
            <StateBanner state={foundState} />
          ) : (
            <form action={foundAction}>
              <div className={styles.field}>
                <label htmlFor={`note-${id}`}>Where were they found? (optional)</label>
                <input id={`note-${id}`} name="note" className={styles.input} maxLength={500} />
              </div>
              <div className={styles.formActions} style={{ marginTop: '0.75rem' }}>
                <button type="submit" className={styles.button} disabled={foundPending}>
                  {foundPending ? 'Saving…' : 'Confirm found'}
                </button>
                <StateBanner state={foundState} />
              </div>
            </form>
          )}
        </div>
      )}

      {panel === 'edit' && (
        <form action={editFormAction} noValidate className={`${styles.inline} ${styles.formGrid}`}>
          {!canEditDirectly && (
            <p className={`${styles.span2} ${styles.lede}`}>
              Your suggestion goes to an admin. The record changes once it is approved.
            </p>
          )}
          <DetailFields state={editState} values={values} hideContact={!canEditDirectly} />
          <div className={`${styles.formActions} ${styles.span2}`}>
            <button type="submit" className={styles.button} disabled={editPending}>
              {editPending ? 'Saving…' : canEditDirectly ? 'Save changes' : 'Send suggestion'}
            </button>
            <StateBanner state={editState} />
          </div>
        </form>
      )}

      {panel === 'reopen' && isAdmin && (
        <div className={styles.inline}>
          {reopenState.ok ? (
            <StateBanner state={reopenState} />
          ) : (
            <form action={reopenFormAction}>
              <div className={styles.field}>
                <label htmlFor={`reopen-${id}`}>Why is this record being re-opened?</label>
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
                <button type="submit" className={styles.button} disabled={reopenPending}>
                  {reopenPending ? 'Saving…' : 'Re-open record'}
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
