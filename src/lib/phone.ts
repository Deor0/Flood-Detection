import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** E.164 for a valid US (+1) number, otherwise null. */
export function normalizeUsPhone(value: string): string | null {
  const parsed = parsePhoneNumberFromString(value.trim(), 'US');
  if (!parsed || !parsed.isValid() || parsed.countryCallingCode !== '1') return null;
  return parsed.number;
}

/** SMS_ALLOWED_FROM: one number or a comma-separated list, each normalized to E.164. */
export function allowedSenders(value: string | undefined): Set<string> {
  const numbers = (value ?? '')
    .split(/[,;\n]/)
    .map((part) => normalizeUsPhone(part))
    .filter((n): n is string => n !== null);
  return new Set(numbers);
}
