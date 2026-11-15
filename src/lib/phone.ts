import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** E.164 for a valid US (+1) number, otherwise null. */
export function normalizeUsPhone(value: string): string | null {
  const parsed = parsePhoneNumberFromString(value.trim(), 'US');
  if (!parsed || !parsed.isValid() || parsed.countryCallingCode !== '1') return null;
  return parsed.number;
}

/**
 * The SMS line is open to every valid US number only when SMS_ALLOWED_FROM is exactly "*".
 * Empty or unset keeps it closed, so a missing variable never opens the line by accident.
 */
export function smsLineOpen(value: string | undefined): boolean {
  return (value ?? '').trim() === '*';
}

/** SMS_ALLOWED_FROM: one number or a comma-separated list, each normalized to E.164. */
export function allowedSenders(value: string | undefined): Set<string> {
  const numbers = (value ?? '')
    .split(/[,;\n]/)
    .map((part) => normalizeUsPhone(part))
    .filter((n): n is string => n !== null);
  return new Set(numbers);
}
