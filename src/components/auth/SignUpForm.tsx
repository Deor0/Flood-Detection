'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useSignUp } from '@clerk/nextjs';
import { KeyRound, Lock, Mail, User } from 'lucide-react';
import {
  MIN_PASSWORD_LENGTH,
  destinationAfterAuth,
  splitName,
  validateSignUp,
  type SignUpField,
  type SignUpValues,
} from '@/lib/auth-forms';
import {
  Field,
  FormError,
  PasswordToggle,
  SubmitButton,
  useAuthSwitchHref,
  type Status,
} from './AuthShared';
import styles from './auth.module.css';

type TextKey = Exclude<SignUpField, 'consent'>;

export function SignUpForm() {
  const uid = useId();
  const { signUp } = useSignUp();
  const [values, setValues] = useState<SignUpValues>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Partial<Record<SignUpField, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  // Production Clerk requires a verified email: after the details step we ask for the emailed code.
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [resent, setResent] = useState(false);
  const signInHref = useAuthSwitchHref('/sign-in');

  const set = <K extends SignUpField>(key: K, value: SignUpValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const found = validateSignUp(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setStatus('loading');
    const { error } = await signUp.password({
      emailAddress: values.email.trim(),
      password: values.password,
      ...splitName(values.name),
      // Client-side record of when the user agreed to account emails.
      unsafeMetadata: { emailConsentAt: new Date().toISOString() },
    });
    if (error) {
      setFormError(error.longMessage ?? error.message ?? 'Could not create the account.');
      setStatus('error');
      return;
    }

    await afterStep();
  }

  /** Finish if Clerk is done, ask for the email code if that is what is missing, else explain. */
  async function afterStep() {
    if (signUp.status === 'complete') {
      setStatus('success');
      await signUp.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            setFormError('This account needs extra setup steps before it can sign in.');
            setStatus('error');
            return;
          }
          const dest = destinationAfterAuth(window.location.search, window.location.origin);
          window.location.assign(new URL(decorateUrl(dest), window.location.origin).href);
        },
      });
      return;
    }

    if (step === 'details' && signUp.unverifiedFields.includes('email_address')) {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        setFormError(sent.error.longMessage ?? sent.error.message ?? 'Could not send the code.');
        setStatus('error');
        return;
      }
      setStatus('idle');
      setStep('code');
      return;
    }

    setFormError('Clerk needs more information to finish sign-up. Check the Clerk settings.');
    setStatus('error');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setCodeError(undefined);
    if (!code.trim()) {
      setCodeError('Enter the code from your email.');
      return;
    }
    setStatus('loading');
    const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (error) {
      setFormError(error.longMessage ?? error.message ?? 'That code did not work. Try again.');
      setStatus('error');
      return;
    }
    await afterStep();
  }

  async function resend() {
    setFormError(undefined);
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      setFormError(error.longMessage ?? error.message ?? 'Could not send the code.');
      return;
    }
    setResent(true);
  }

  const input = (key: TextKey, props: InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={`${uid}-${key}`}
      name={key}
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      aria-invalid={!!errors[key]}
      aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
      className={styles.input}
      {...props}
    />
  );
  const fieldProps = (key: SignUpField) => ({
    htmlFor: `${uid}-${key}`,
    errorId: `${uid}-${key}-err`,
    error: errors[key],
  });

  return (
    <div className={`${styles.shell} ${styles.wide}`}>
      <div className={styles.head}>
        <span className={styles.badge}>JOIN THE CREW</span>
        <h1 className={styles.heading}>CREATE ACCOUNT</h1>
        <p className={styles.subtitle}>
          {step === 'details'
            ? 'An account lets you report missing people, mark them found and host programs.'
            : `Check your email. Enter the code we sent to ${values.email.trim()}.`}
        </p>
      </div>

      {step === 'code' ? (
        <form onSubmit={verify} noValidate className={`${styles.card} ${styles.form}`}>
          <FormError message={formError} />
          <Field
            label="Verification code"
            icon={KeyRound}
            error={codeError}
            htmlFor={`${uid}-code`}
            errorId={`${uid}-code-err`}
          >
            <input
              id={`${uid}-code`}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!codeError}
              aria-describedby={codeError ? `${uid}-code-err` : undefined}
              className={styles.input}
            />
          </Field>
          <SubmitButton status={status} busyLabel="VERIFYING…">
            VERIFY EMAIL
          </SubmitButton>
          <button type="button" className={styles.link} onClick={resend}>
            {resent ? 'Code sent again. Send another' : 'Send the code again'}
          </button>
        </form>
      ) : (
        <form onSubmit={submit} noValidate className={`${styles.card} ${styles.form}`}>
          <FormError message={formError} />
          <Field label="Full name" icon={User} {...fieldProps('name')}>
            {input('name', { autoComplete: 'name', autoFocus: true })}
          </Field>
          <Field label="Email address" icon={Mail} {...fieldProps('email')}>
            {input('email', { type: 'email', autoComplete: 'email' })}
          </Field>
          <div className={styles.twoCol}>
            <Field
              label="Password"
              icon={Lock}
              {...fieldProps('password')}
              trailing={
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
              }
            >
              {input('password', {
                type: showPassword ? 'text' : 'password',
                autoComplete: 'new-password',
              })}
            </Field>
            <Field
              label="Confirm password"
              icon={Lock}
              {...fieldProps('confirmPassword')}
              trailing={
                <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm((s) => !s)} />
              }
            >
              {input('confirmPassword', {
                type: showConfirm ? 'text' : 'password',
                autoComplete: 'new-password',
              })}
            </Field>
          </div>
          <p className={styles.note}>
            At least {MIN_PASSWORD_LENGTH} characters, with a letter and a number.
          </p>

          <div>
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={values.consent}
                onChange={(e) => set('consent', e.target.checked)}
                aria-invalid={!!errors.consent}
                aria-describedby={errors.consent ? `${uid}-consent-err` : undefined}
              />
              <span>
                I agree to receive emails about my account and the records I report. No marketing.
              </span>
            </label>
            {errors.consent && (
              <p id={`${uid}-consent-err`} role="alert" className={styles.error}>
                {errors.consent}
              </p>
            )}
          </div>

          {/* Clerk's bot protection renders here. */}
          <div id="clerk-captcha" />
          <SubmitButton status={status} busyLabel="CREATING…">
            CREATE ACCOUNT
          </SubmitButton>
          <p className={styles.switch}>
            Already have an account? <Link href={signInHref}>RETURN TO THE DESK</Link>
          </p>
        </form>
      )}
    </div>
  );
}
