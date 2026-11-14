'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { IdCard, Lock } from 'lucide-react';
import { destinationAfterAuth, toIdentifier } from '@/lib/auth-forms';
import { Field, FormError, PasswordToggle, SubmitButton, type Status } from './AuthShared';
import { ForgotPassword } from './ForgotPassword';
import styles from './auth.module.css';

export function SignInForm() {
  const uid = useId();
  const { signIn } = useSignIn();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [forgot, setForgot] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const id = toIdentifier(identifier);
    const found: typeof errors = {};
    if (!id) found.identifier = 'Enter your email or US phone number.';
    if (!password) found.password = 'Enter your password.';
    setErrors(found);
    if (!id || !password) return;

    setStatus('loading');
    const { error } = await signIn.password({ identifier: id, password });
    if (error) {
      setFormError(error.longMessage ?? error.message ?? 'Could not sign in. Try again.');
      setPassword('');
      setStatus('error');
      return;
    }

    if (signIn.status === 'complete') {
      setStatus('success');
      await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            setFormError('This account needs extra setup steps before it can sign in.');
            setStatus('error');
            return;
          }
          const dest = destinationAfterAuth(window.location.search, window.location.origin);
          // Full navigation so the server renders with the new session cookie.
          window.location.assign(new URL(decorateUrl(dest), window.location.origin).href);
        },
      });
      return;
    }

    // e.g. needs_client_trust / needs_second_factor: a verification code step we don't offer yet.
    setFormError('This sign-in needs an extra verification step, which is not available yet.');
    setStatus('error');
  }

  if (forgot) return <ForgotPassword onBack={() => setForgot(false)} />;

  return (
    <div className={styles.shell}>
      <section className={styles.card} aria-labelledby={`${uid}-title`}>
        <h1 id={`${uid}-title`} className={styles.heading}>
          SIGN IN
        </h1>
        <p className={styles.subtitle}>Enter your credentials to access operations</p>

        <form onSubmit={submit} noValidate className={styles.form}>
          <FormError message={formError} />
          <Field
            label="Email or phone number"
            icon={IdCard}
            error={errors.identifier}
            htmlFor={`${uid}-id`}
            errorId={`${uid}-id-err`}
          >
            <input
              id={`${uid}-id`}
              name="identifier"
              autoComplete="username"
              placeholder="you@example.com or (555) 555-0100"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={!!errors.identifier}
              aria-describedby={errors.identifier ? `${uid}-id-err` : undefined}
              className={styles.input}
            />
          </Field>
          <Field
            label="Password"
            icon={Lock}
            error={errors.password}
            htmlFor={`${uid}-pw`}
            errorId={`${uid}-pw-err`}
            labelAside={
              <button type="button" className={styles.link} onClick={() => setForgot(true)}>
                Forgot Password?
              </button>
            }
            trailing={
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
            }
          >
            <input
              id={`${uid}-pw`}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? `${uid}-pw-err` : undefined}
              className={styles.input}
            />
          </Field>
          <SubmitButton status={status} busyLabel="SIGNING IN…">
            SIGN IN
          </SubmitButton>
        </form>

        <p className={styles.switch}>
          Don&apos;t have an account? <Link href="/sign-up">CREATE ONE</Link>
        </p>
      </section>
    </div>
  );
}
