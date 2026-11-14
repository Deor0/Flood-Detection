import type { FormState } from '@/app/form-state';
import styles from './page-ui.module.css';

/** Result message under a form: green on success, red on a problem. */
export function StateBanner({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? 'status' : 'alert'}
      className={`${styles.banner} ${state.ok ? styles.bannerOk : styles.bannerError}`}
    >
      {state.message}
    </p>
  );
}

export function FieldError({ state, name }: { state: FormState; name: string }) {
  const message = state.fields?.[name];
  if (!message) return null;
  return (
    <p id={`${name}-error`} role="alert" className={styles.error}>
      {message}
    </p>
  );
}

export const inputClass = (state: FormState, name: string) =>
  `${styles.input} ${state.fields?.[name] ? styles.invalid : ''}`;
