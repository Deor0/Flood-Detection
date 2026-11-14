/** What a server action hands back to a form. */
export type FormState = {
  ok?: boolean;
  message?: string;
  /** Per-field error messages, keyed by the input name. */
  fields?: Record<string, string>;
};
