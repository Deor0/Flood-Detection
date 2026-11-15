'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { PROGRAM_CATEGORIES } from '@/db/schema';
import { CATEGORY_LABELS } from '@/core/programs/categories';
import { FieldError, StateBanner, inputClass } from '@/components/FormBits';
import styles from '@/components/page-ui.module.css';
import { toZonedInput } from '@/lib/time';
import type { FormState } from '@/app/form-state';
import {
  cancelAction,
  cancelProgramAction,
  editProgramAction,
  hostAction,
  registerAction,
} from './actions';

const initial: FormState = {};

export function HostForm({ timeZone = 'UTC' }: { timeZone?: string }) {
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
        <label htmlFor="host-startsAt">Starts ({timeZone})</label>
        <input {...field('startsAt')} type="datetime-local" />
        <FieldError state={state} name="startsAt" />
      </div>
      <div className={styles.field}>
        <label htmlFor="host-endsAt">Ends ({timeZone})</label>
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
          {pending ? 'Submitting…' : 'Submit for review'}
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

export type EditableProgram = {
  id: string;
  title: string;
  category: string;
  organizer: string;
  location: string;
  topics: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  capacity: number | null;
};

/** Inline edit for the host or an admin. The server decides who may save. */
export function EditProgramForm({
  program,
  timeZone = 'UTC',
  save = editProgramAction,
}: {
  program: EditableProgram;
  /** The zone times are read in (the server's APP_TIMEZONE); pass `appTimeZone()`. */
  timeZone?: string;
  /** Defaults to the host/admin action; the admin page passes its own admin-only action. */
  save?: (programId: string, prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, action, pending] = useActionState(
    (prev: FormState, fd: FormData) => save(program.id, prev, fd),
    initial,
  );
  // Dates are shown in the app's fixed zone, the same one the server reads them in, so saving
  // without changing anything records no change.
  const dateRef = (iso: string) => (el: HTMLInputElement | null) => {
    if (el && !el.value) el.value = toZonedInput(iso, timeZone);
  };

  const id = (n: string) => `edit-${program.id}-${n}`;
  const field = (name: string) => ({
    id: id(name),
    name,
    className: inputClass(state, name),
    'aria-invalid': !!state.fields?.[name],
  });

  return (
    <form action={action} noValidate className={styles.formGrid}>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor={id('title')}>Title</label>
        <input {...field('title')} defaultValue={program.title} maxLength={150} />
        <FieldError state={state} name="title" />
      </div>
      <div className={styles.field}>
        <label htmlFor={id('category')}>Category</label>
        <select {...field('category')} defaultValue={program.category}>
          {PROGRAM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <FieldError state={state} name="category" />
      </div>
      <div className={styles.field}>
        <label htmlFor={id('organizer')}>Organized by</label>
        <input {...field('organizer')} defaultValue={program.organizer} maxLength={150} />
        <FieldError state={state} name="organizer" />
      </div>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor={id('location')}>Location</label>
        <input {...field('location')} defaultValue={program.location} maxLength={200} />
        <FieldError state={state} name="location" />
      </div>
      <div className={styles.field}>
        <label htmlFor={id('startsAt')}>Starts ({timeZone})</label>
        <input {...field('startsAt')} type="datetime-local" ref={dateRef(program.startsAt)} />
        <FieldError state={state} name="startsAt" />
      </div>
      <div className={styles.field}>
        <label htmlFor={id('endsAt')}>Ends ({timeZone})</label>
        <input {...field('endsAt')} type="datetime-local" ref={dateRef(program.endsAt)} />
        <FieldError state={state} name="endsAt" />
      </div>
      <div className={`${styles.field} ${styles.span2}`}>
        <label htmlFor={id('topics')}>Key topics</label>
        <textarea
          {...field('topics')}
          defaultValue={program.topics ?? ''}
          rows={2}
          maxLength={500}
        />
        <FieldError state={state} name="topics" />
      </div>
      <div className={styles.field}>
        <label htmlFor={id('capacity')}>Capacity (leave empty for open access)</label>
        <input {...field('capacity')} defaultValue={program.capacity ?? ''} inputMode="numeric" />
        <FieldError state={state} name="capacity" />
      </div>
      <div className={`${styles.formActions} ${styles.span2}`}>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <StateBanner state={state} />
      </div>
    </form>
  );
}

/** Cancels a whole program (host or admin). Registrations are kept. */
export function CancelProgramButton({
  programId,
  cancel = cancelProgramAction,
}: {
  programId: string;
  cancel?: (programId: string) => Promise<FormState>;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
        onClick={() => {
          if (!window.confirm('Cancel this program? Registered people keep their records.')) return;
          start(async () => setState(await cancel(programId)));
        }}
      >
        {pending ? 'Cancelling…' : 'Cancel program'}
      </button>
      {state.message && !state.ok && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
    </>
  );
}
