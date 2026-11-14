export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type MissingInput = {
  name: string;
  age?: string | number | null;
  lastSeenLocation?: string | null;
  notes?: string | null;
  contact?: string | null;
};

export type CleanMissing = {
  name: string;
  age: number | null;
  lastSeenLocation: string | null;
  notes: string | null;
  contact: string | null;
};

const blank = (v: string | null | undefined) => (v ?? '').trim();
const orNull = (v: string) => (v === '' ? null : v);

export function cleanMissing(input: MissingInput): {
  value?: CleanMissing;
  errors: FieldErrors<keyof CleanMissing>;
} {
  const errors: FieldErrors<keyof CleanMissing> = {};
  const name = blank(input.name).replace(/\s+/g, ' ');
  if (name.length < 2) errors.name = 'Enter the full name.';
  else if (name.length > 100) errors.name = 'Name is too long (100 characters max).';

  let age: number | null = null;
  const rawAge = typeof input.age === 'string' ? input.age.trim() : input.age;
  if (rawAge !== undefined && rawAge !== null && rawAge !== '') {
    const n = Number(rawAge);
    if (!Number.isInteger(n) || n < 0 || n > 120)
      errors.age = 'Age must be a whole number from 0 to 120.';
    else age = n;
  }

  const lastSeenLocation = blank(input.lastSeenLocation);
  if (lastSeenLocation.length > 200)
    errors.lastSeenLocation = 'Location is too long (200 characters max).';
  const notes = blank(input.notes);
  if (notes.length > 1000) errors.notes = 'Notes are too long (1000 characters max).';
  const contact = blank(input.contact);
  if (contact.length > 200) errors.contact = 'Contact is too long (200 characters max).';

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    value: {
      name,
      age,
      lastSeenLocation: orNull(lastSeenLocation),
      notes: orNull(notes),
      contact: orNull(contact),
    },
  };
}
