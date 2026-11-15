/** Common reasons offered when rejecting ("unpicking") a submission. Free text can be added. */
export const REJECT_REASON_TEMPLATES = {
  program: [
    'Duplicate of an existing program',
    'Missing or unclear date, time or place',
    'Not related to flood safety or preparedness',
    'Unsafe or misleading advice',
    'Contains personal contact details that should not be public',
  ],
  edit: [
    'Duplicate or already applied',
    'Could not be verified',
    'Conflicts with what the family or reporter told us',
    'Contains private details that should not be public',
    'Not a correction (opinion or unrelated text)',
  ],
} as const;

/**
 * Builds the stored reason from a picked template and optional free text. The template must be
 * one of the known ones (anything else is ignored); the result is capped at 500 characters.
 */
export function composeReason(
  kind: keyof typeof REJECT_REASON_TEMPLATES,
  template: string | null | undefined,
  text: string | null | undefined,
): string {
  const known = (REJECT_REASON_TEMPLATES[kind] as readonly string[]).includes(template ?? '')
    ? (template as string)
    : '';
  const free = (text ?? '').trim();
  const out = known && free ? `${known}: ${free}` : known || free;
  return out.slice(0, 500);
}
