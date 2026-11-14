import { normalizeUsPhone } from './phone';

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: string) => EMAIL.test(value.trim());

/** Email or US phone -> the identifier Clerk expects (email as typed, phone as E.164). */
export function toIdentifier(value: string): string | null {
  const v = value.trim();
  if (v.includes('@')) return isEmail(v) ? v : null;
  return normalizeUsPhone(v);
}

export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Use at least one letter and one number.';
  }
  return undefined;
}

export type SignUpValues = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  consent: boolean;
};
export type SignUpField = keyof SignUpValues;

export function validateSignUp(v: SignUpValues): Partial<Record<SignUpField, string>> {
  const e: Partial<Record<SignUpField, string>> = {};
  if (v.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!isEmail(v.email)) e.email = 'Enter a valid email address.';
  if (!normalizeUsPhone(v.phone)) e.phone = 'Enter a valid US phone number.';
  const pw = passwordProblem(v.password);
  if (pw) e.password = pw;
  if (v.confirmPassword !== v.password) e.confirmPassword = 'Passwords do not match.';
  if (!v.consent) e.consent = 'You must agree to emergency communications to register.';
  return e;
}

/** Splits "Ada Lovelace King" into first and last name for Clerk. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

/**
 * Where to go after sign-in: Clerk passes the page the person originally wanted as
 * `redirect_url`. Only same-origin paths are honored; everything else goes to the dashboard.
 */
export function destinationAfterAuth(search: string, origin: string): string {
  const raw = new URLSearchParams(search).get('redirect_url');
  if (!raw) return '/dashboard';
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return '/dashboard';
    if (url.pathname === '/' || url.pathname.startsWith('/sign-')) return '/dashboard';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/dashboard';
  }
}
