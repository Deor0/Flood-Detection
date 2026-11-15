/**
 * Forgiving reader for one inbound text. People type on small keypads in a hurry, so it accepts:
 * punctuation after the command ("SEARCH: Maya"), aliases (FIND, LOST, SAFE and Nepali
 * transliterations), and one wrong, missing, extra or swapped letter in a command ("SERCH").
 */

export type Command = 'HELP' | 'SEARCH' | 'MISSING' | 'FOUND' | 'STATUS' | 'UNKNOWN';
export type Parsed = { command: Command; args: string };

const COMMANDS: Exclude<Command, 'UNKNOWN'>[] = ['HELP', 'SEARCH', 'MISSING', 'FOUND', 'STATUS'];

export const ALIASES: Record<string, Exclude<Command, 'UNKNOWN'>> = {
  FIND: 'SEARCH',
  LOOK: 'SEARCH',
  KHOJ: 'SEARCH',
  KHOJA: 'SEARCH',
  LOST: 'MISSING',
  REPORT: 'MISSING',
  HARAYO: 'MISSING',
  HARAYEKO: 'MISSING',
  SAFE: 'FOUND',
  HOME: 'FOUND',
  BHETIYO: 'FOUND',
  BHETEYO: 'FOUND',
  RIVER: 'STATUS',
  FLOOD: 'STATUS',
  INFO: 'HELP',
  MADAT: 'HELP',
  '?': 'HELP',
};

/** Optimal string alignment distance: insertions, deletions, substitutions, adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function commandFor(word: string): Exclude<Command, 'UNKNOWN'> | null {
  if ((COMMANDS as string[]).includes(word)) return word as Exclude<Command, 'UNKNOWN'>;
  if (ALIASES[word]) return ALIASES[word];
  // Typos: only words of 4+ letters, and only when exactly one command is that close.
  if (word.length < 4) return null;
  const close = COMMANDS.filter((c) => editDistance(word, c) <= 1);
  return close.length === 1 ? close[0] : null;
}

export function parseCommand(body: string): Parsed {
  const trimmed = body.trim();
  if (!trimmed) return { command: 'HELP', args: '' };
  if (trimmed === '?') return { command: 'HELP', args: '' };
  // The command is the leading letters; any punctuation and spaces after it are dropped.
  const match = /^([A-Za-z]+)[\s:;,.!?=>\-]*([\s\S]*)$/.exec(trimmed);
  if (!match) return { command: 'UNKNOWN', args: trimmed };
  const command = commandFor(match[1].toUpperCase());
  return command ? { command, args: match[2].trim() } : { command: 'UNKNOWN', args: trimmed };
}

const AGE_ONLY = /^(?:age\s*)?\d{1,3}\s*(?:y|yr|yrs|year|years)?(?:\s*old)?$/i;

/** A readable age (0-120) from text such as "34", "34 yrs", "age 7"; anything else is dropped. */
export function readAge(text: string): number | null {
  const m = /\d{1,3}/.exec(text);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : null;
}

export type MissingArgs = { name: string; place: string; age: number | null };

/**
 * "Maya Rai, Rasuwa, 34" -> name, place, age. Also "Maya Rai, 34" (age without place) and
 * "Maya Rai, Ward 4, Rasuwa, 34" (commas inside the place). An unreadable age is dropped.
 */
export function parseMissingArgs(args: string): MissingArgs {
  const parts = args.split(',').map((s) => s.trim());
  const name = (parts.shift() ?? '').replace(/\s+/g, ' ');
  let ageText = '';
  if (parts.length >= 2) ageText = parts.pop() ?? '';
  else if (parts.length === 1 && AGE_ONLY.test(parts[0])) ageText = parts.pop() ?? '';
  // With 4+ fields a last part without digits is more place ("Ward 4, Rasuwa, Nepal"), not age.
  if (ageText && !/\d/.test(ageText) && parts.length >= 2) {
    parts.push(ageText);
    ageText = '';
  }
  const place = parts.filter(Boolean).join(', ');
  return { name, place, age: ageText ? readAge(ageText) : null };
}

/** "REG-01001", "reg 1001", "REG01001" -> 1001; anything else null. */
export function readPublicId(text: string): number | null {
  const m = /^REG[\s-]?0*(\d{1,7})$/i.exec(text.trim());
  return m ? Number(m[1]) : null;
}

/** Same text for duplicate detection: case, spacing and trailing punctuation ignored. */
export function normalizeBody(body: string): string {
  return body
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
    .toUpperCase();
}
