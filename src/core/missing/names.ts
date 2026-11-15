const SPECIAL: Record<string, string> = {
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ð: 'd',
  þ: 'th',
};

/**
 * Lowercase, accent-free, punctuation-free, single-spaced: "Miller, José" -> "miller jose".
 * Accents are removed only from Latin letters (marks that belong to Indic, Arabic and other
 * scripts are part of the letter and are kept). Letters and digits of any script are kept;
 * apostrophes, hyphens and other punctuation become spaces.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[øłđßæœðþ]/g, (c) => SPECIAL[c])
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "David Miller" -> "Miller, David". Names already written "Last, First" are kept. */
export function lastFirst(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes(',')) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
}

/** REG-01001 */
export function publicId(publicNumber: number): string {
  return `REG-${String(publicNumber).padStart(5, '0')}`;
}
