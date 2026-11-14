'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { PROGRAM_CATEGORIES } from '@/db/schema';
import { CATEGORY_LABELS } from '@/core/programs/categories';
import { FieldError, StateBanner, inputClass } from '@/components/FormBits';
import styles from '@/components/page-ui.module.css';
import type { FormState } from '@/app/form-state';
import { cancelAction, hostAction, registerAction } from './actions';

const initial: FormState = {};

export function HostForm() {
  const [state, action, pending] = useActionState(hostAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const field = (name: string) => ({
    id: `host-${name}`,
    name,
    className: inputClass(state, name),
    'aria-invalid': !!state.fields?.[name],
  });

  return (
    <form ref={formRef} action={action} noValidate className={styles.formGrid}>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor="host-title">Title</label>
        <input {...field('title')} maxLength={150} autoComplete="off" />
        <FieldError state={state} name="title" />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-category">Category</label>
        <select {...field('category')} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {PROGRAM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <FieldError state={state} name="category" />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-organizer">Organized by</label>
        <input {...field('organizer')} maxLength={150} />
        <FieldError state={state} name="organizer" />
      </div>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor="host-location">Location</label>
        <input {...field('location')} maxLength={200} />
        <FieldError state={state} name="location" />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-startsAt">Starts</label>
        <input {...field('startsAt')} type="datetime-local" />
        <FieldError state={state} name="startsAt" />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-endsAt">Ends</label>
        <input {...field('endsAt')} type="datetime-local" />
        <FieldError state={state} name="endsAt" />
      </div>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor="host-topics">Key topics</label>
        <textarea {...field('topics')} rows={2} maxLength={500} />
        <FieldError state={state} name="topics" />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-capacity">Capacity (leave empty for open access)</label>
        <input {...field('capacity')} inputMode="numeric" />
        <FieldError state={state} name="capacity" />
      </div>
      <div className={`${styles.formActions} ${styles.span2}`}>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? 'Listing…' : 'List program'}
        </button>
        <StateBanner state={state} />
      </div>
    </form>
  );
}

export function RegisterButton({
  programId,
  isRegistered,
  isFull,
}: {
  programId: string;
  isRegistered: boolean;
  isFull: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});

  const run = () =>
    start(async () => {
      setState(await (isRegistered ? cancelAction(programId) : registerAction(programId)));
    });

  return (
    <>
      {isRegistered && <p className={styles.registered}>✓ You are registered</p>}
      <button
        type="button"
        onClick={run}
        disabled={pending || (isFull && !isRegistered)}
        className={`${styles.button} ${isRegistered ? styles.buttonLight : ''}`}
      >
        {pending
          ? 'Working…'
          : isRegistered
            ? 'Cancel registration'
            : isFull
              ? 'Full'
              : 'Register to Attend'}
      </button>
      {state.message && !state.ok && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
    </>
  );
}
