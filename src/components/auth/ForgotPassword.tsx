'use client';

import { useId, useState, type FormEvent } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { KeyRound, Lock, Mail } from 'lucide-react';
import { destinationAfterAuth, isEmail, passwordProblem } from '@/lib/auth-forms';
import { Field, FormError, PasswordToggle, SubmitButton, type Status } from './AuthShared';
import styles from './auth.module.css';

type Step = 'email' | 'code' | 'password';

/** Password reset by emailed code, then straight into the app. */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const uid = useId();
  const { signIn } = useSignIn();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<Status>('idle');

  const fail = (message?: string) => {
    setFormError(message ?? 'Something went wrong. Try again.');
    setStatus('error');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setFieldError(undefined);

    if (step === 'email') {
      if (!isEmail(email)) return setFieldError('Enter a valid email address.');
      setStatus('loading');
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return fail(created.error.longMessage ?? created.error.message);
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) return fail(sent.error.longMessage ?? sent.error.message);
      setStatus('idle');
      setStep('code');
    } else if (step === 'code') {
      if (!code.trim()) return setFieldError('Enter the code from your email.');
      setStatus('loading');
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verified.error) return fail(verified.error.longMessage ?? verified.error.message);
      setStatus('idle');
      setStep('password');
    } else {
      const problem = passwordProblem(password);
      if (problem) return setFieldError(problem);
      setStatus('loading');
      const done = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (done.error) return fail(done.error.longMessage ?? done.error.message);
      if (signIn.status !== 'complete') return fail('Could not finish the reset. Try signing in.');
      setStatus('success');
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const dest = destinationAfterAuth(window.location.search, window.location.origin);
          window.location.assign(new URL(decorateUrl(dest), window.location.origin).href);
        },
      });
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.card} aria-labelledby={`${uid}-title`}>
        <h1 id={`${uid}-title`} className={styles.heading}>
          RESET PASSWORD
        </h1>
        <p className={styles.subtitle}>
          {step === 'email' && 'We will email you a code to reset your password'}
          {step === 'code' && `Enter the code we sent to ${email.trim()}`}
          {step === 'password' && 'Choose a new password'}
        </p>
        <form onSubmit={submit} noValidate className={styles.form}>
          <FormError message={formError} />
          {step === 'email' && (
            <Field
              label="Email address"
              icon={Mail}
              error={fieldError}
              htmlFor={`${uid}-email`}
              errorId={`${uid}-err`}
            >
              <input
                id={`${uid}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!fieldError}
                className={styles.input}
              />
            </Field>
          )}
          {step === 'code' && (
            <Field
              label="Code"
              icon={KeyRound}
              error={fieldError}
              htmlFor={`${uid}-code`}
              errorId={`${uid}-err`}
            >
              <input
                id={`${uid}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={!!fieldError}
                className={styles.input}
              />
            </Field>
          )}
          {step === 'password' && (
            <Field
              label="New password"
              icon={Lock}
              error={fieldError}
              htmlFor={`${uid}-pw`}
              errorId={`${uid}-err`}
              trailing={
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
              }
            >
              <input
                id={`${uid}-pw`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!fieldError}
                className={styles.input}
              />
            </Field>
          )}
          <SubmitButton
            status={status}
            busyLabel={status === 'success' ? 'SIGNING IN…' : 'WORKING…'}
          >
            {step === 'email' ? 'SEND CODE' : step === 'code' ? 'VERIFY CODE' : 'SET PASSWORD'}
          </SubmitButton>
          <button type="button" className={styles.link} onClick={onBack}>
            Back to sign in
          </button>
        </form>
      </section>
    </div>
  );
}
