'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Pencil, UserCheck } from 'lucide-react';
import { FieldError, StateBanner, inputClass } from '@/components/FormBits';
import styles from '@/components/page-ui.module.css';
import type { FormState } from '@/app/form-state';
import { editAction, markFoundAction, reportAction } from './actions';

const initial: FormState = {};

type Details = {
  name?: string;
  age?: number | null;
  lastSeenLocation?: string | null;
  notes?: string | null;
  contact?: string | null;
};

function DetailFields({ state, values }: { state: FormState; values?: Details }) {
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
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor={f('contact').id}>Contact / case lead</label>
        <input {...f('contact')} defaultValue={values?.contact ?? ''} />
        <FieldError state={state} name="contact" />
      </div>
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

/** Mark-as-found and edit controls for one record. */
export function PersonActions({
  id,
  status,
  values,
}: {
  id: string;
  status: 'missing' | 'found';
  values: Details;
}) {
  const [panel, setPanel] = useState<'found' | 'edit' | null>(null);
  const [foundState, foundAction, foundPending] = useActionState(
    markFoundAction.bind(null, id),
    initial,
  );
  const [editState, editFormAction, editPending] = useActionState(
    editAction.bind(null, id),
    initial,
  );

  return (
    <>
      <div className={styles.actions}>
        {status === 'missing' && (
          <button
            type="button"
            className={`${styles.button} ${styles.smallButton}`}
            aria-expanded={panel === 'found'}
            onClick={() => setPanel(panel === 'found' ? null : 'found')}
          >
            <UserCheck size={14} aria-hidden="true" /> Mark as found
          </button>
        )}
        <button
          type="button"
          className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
          aria-expanded={panel === 'edit'}
          onClick={() => setPanel(panel === 'edit' ? null : 'edit')}
        >
          <Pencil size={14} aria-hidden="true" /> Edit details
        </button>
      </div>

      {panel === 'found' && status === 'missing' && (
        <form action={foundAction} className={styles.inline}>
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

      {panel === 'edit' && (
        <form action={editFormAction} noValidate className={`${styles.inline} ${styles.formGrid}`}>
          <DetailFields state={editState} values={values} />
          <div className={`${styles.formActions} ${styles.span2}`}>
            <button type="submit" className={styles.button} disabled={editPending}>
              {editPending ? 'Saving…' : 'Save changes'}
            </button>
            <StateBanner state={editState} />
          </div>
        </form>
      )}
    </>
  );
}
