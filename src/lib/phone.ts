import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** E.164 for a valid US (+1) number, otherwise null. */
export function normalizeUsPhone(value: string): string | null {
  const parsed = parsePhoneNumberFromString(value.trim(), 'US');
  if (!parsed || !parsed.isValid() || parsed.countryCallingCode !== '1') return null;
  return parsed.number;
}
