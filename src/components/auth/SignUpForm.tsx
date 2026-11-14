'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useSignUp } from '@clerk/nextjs';
import { Lock, Mail, Phone, Server, ShieldCheck, User } from 'lucide-react';
import {
  MIN_PASSWORD_LENGTH,
  destinationAfterAuth,
  splitName,
  validateSignUp,
  type SignUpField,
  type SignUpValues,
} from '@/lib/auth-forms';
import { normalizeUsPhone } from '@/lib/phone';
import { Field, FormError, PasswordToggle, SubmitButton, type Status } from './AuthShared';
import styles from './auth.module.css';

type TextKey = Exclude<SignUpField, 'consent'>;

export function SignUpForm() {
  const uid = useId();
  const { signUp } = useSignUp();
  const [values, setValues] = useState<SignUpValues>({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Partial<Record<SignUpField, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

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
      phoneNumber: normalizeUsPhone(values.phone) ?? undefined,
      password: values.password,
      ...splitName(values.name),
      // Client-side record of the SMS/email consent the user just gave.
      unsafeMetadata: { smsEmailConsentAt: new Date().toISOString() },
    });
    if (error) {
      setFormError(error.longMessage ?? error.message ?? 'Could not create the account.');
      setStatus('error');
      return;
    }

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

    // Clerk still wants something (for example a verification step we do not offer yet).
    setFormError('Clerk needs more information to finish sign-up. Check the Clerk settings.');
    setStatus('error');
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
        <span className={styles.badge}>IDENTITY AUTHORIZATION</span>
        <h1 className={styles.heading}>CREATE ACCOUNT</h1>
        <p className={styles.subtitle}>
          Register for Crisis Response operations or volunteer network
        </p>
      </div>

      <form onSubmit={submit} noValidate className={`${styles.card} ${styles.form}`}>
        <FormError message={formError} />
        <Field label="Full name" icon={User} {...fieldProps('name')}>
          {input('name', { autoComplete: 'name', autoFocus: true })}
        </Field>
        <div className={styles.twoCol}>
          <Field label="Email address" icon={Mail} {...fieldProps('email')}>
            {input('email', { type: 'email', autoComplete: 'email' })}
          </Field>
          <Field label="Phone number" icon={Phone} {...fieldProps('phone')}>
            {input('phone', {
              type: 'tel',
              inputMode: 'tel',
              autoComplete: 'tel',
              placeholder: '(555) 555-0100',
            })}
          </Field>
        </div>
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
              I agree to emergency communication, mission telemetry broadcasts, and disaster alert
              notifications via SMS and email.
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
          Already have an account? <Link href="/sign-in">SIGN IN</Link>
        </p>
      </form>

      <ul className={styles.badges} aria-label="Security indicators">
        <li>
          <Lock size={14} aria-hidden="true" /> 256-BIT ENCRYPTED
        </li>
        <li>
          <ShieldCheck size={14} aria-hidden="true" /> IDENTITY VERIFIED
        </li>
        <li>
          <Server size={14} aria-hidden="true" /> HIGH AVAILABILITY
        </li>
      </ul>
    </div>
  );
}
