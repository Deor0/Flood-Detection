'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import styles from './auth.module.css';

export type Status = 'idle' | 'loading' | 'success' | 'error';

/** Form-level message (wrong password, rate limit, network error). */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={styles.banner}>
      {message}
    </p>
  );
}

export function Field({
  label,
  icon: Icon,
  error,
  trailing,
  labelAside,
  children,
  htmlFor,
  errorId,
}: {
  label: string;
  icon?: LucideIcon;
  error?: string;
  trailing?: ReactNode;
  labelAside?: ReactNode;
  children: ReactNode;
  htmlFor: string;
  errorId: string;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
        </label>
        {labelAside}
      </div>
      <div className={`${styles.inputWrap} ${error ? styles.inputInvalid : ''}`}>
        {Icon && <Icon className={styles.inputIcon} size={16} aria-hidden="true" />}
        {children}
        {trailing}
      </div>
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
    >
      {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
    </button>
  );
}

export function SubmitButton({
  status,
  children,
  busyLabel = 'WORKING…',
}: {
  status: Status;
  children: ReactNode;
  busyLabel?: string;
}) {
  const busy = status === 'loading' || status === 'success';
  return (
    <button type="submit" className={styles.primary} disabled={busy} aria-busy={busy}>
      {status === 'loading' && <span className={styles.spinner} aria-hidden="true" />}
      {status === 'success' && <Check size={16} aria-hidden="true" />}
      <span>{busy ? busyLabel : children}</span>
      {!busy && <ArrowRight size={16} aria-hidden="true" />}
    </button>
  );
}

/**
 * Link to the other auth page that keeps `?redirect_url=` from the current URL, so switching
 * between sign-in and sign-up still returns the visitor to the page they wanted. The server render
 * uses the plain path; the query is added after mount.
 */
export function useAuthSwitchHref(path: '/sign-in' | '/sign-up'): string {
  const [href, setHref] = useState<string>(path);
  useEffect(() => {
    const redirect = new URLSearchParams(window.location.search).get('redirect_url');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once after mount
    if (redirect) setHref(`${path}?redirect_url=${encodeURIComponent(redirect)}`);
  }, [path]);
  return href;
}
