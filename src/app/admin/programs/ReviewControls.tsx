'use client';

import { useActionState, useState, useTransition } from 'react';
import { FieldError, StateBanner } from '@/components/FormBits';
import styles from '@/components/page-ui.module.css';
import type { FormState } from '@/app/form-state';
import { approveProgramAction, rejectProgramAction } from './actions';

export function ApproveButton({ programId }: { programId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={`${styles.button} ${styles.smallButton}`}
        onClick={() => start(async () => setState(await approveProgramAction(programId)))}
      >
        {pending ? 'Approving…' : 'Approve'}
      </button>
      <StateBanner state={state.ok ? {} : state} />
    </>
  );
}

export function RejectForm({ programId }: { programId: string }) {
  const [state, action, pending] = useActionState(
    (prev: FormState, fd: FormData) => rejectProgramAction(programId, prev, fd),
    {} as FormState,
  );
  return (
    <form action={action} className={styles.inline}>
      <label htmlFor={`reject-${programId}`}>Reason for rejecting (shown to the host)</label>
      <textarea
        id={`reject-${programId}`}
        name="reason"
        rows={2}
        minLength={3}
        maxLength={500}
        required
        className={styles.input}
      />
      <FieldError state={state} name="reason" />
      <div className={styles.formActions}>
        <button
          type="submit"
          disabled={pending}
          className={`${styles.button} ${styles.buttonLight} ${styles.smallButton}`}
        >
          {pending ? 'Rejecting…' : 'Reject'}
        </button>
        <StateBanner state={state} />
      </div>
    </form>
  );
}
