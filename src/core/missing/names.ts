/** Lowercase, accent-free, punctuation-free, single-spaced: "Miller, José" -> "miller jose". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
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
