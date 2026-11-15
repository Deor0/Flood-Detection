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

/**
 * Spelling variants that come from writing the same name in Latin letters different ways
 * (Shrestha/Srestha, Lakshmi/Laxmi, Ray/Rai, Pooja/Puja, Bhattarai/Battarai). Applied per word to
 * an already normalized name. Only Latin letters change; other scripts pass through.
 */
const FOLDS: [RegExp, string][] = [
  [/x/g, 'ks'],
  [/ksh/g, 'ks'],
  [/ph/g, 'f'],
  [/sh/g, 's'],
  [/([bdgkt])h/g, '$1'],
  [/ch/g, 'c'],
  [/w/g, 'v'],
  [/z/g, 'j'],
  [/q/g, 'k'],
  [/ee|ie/g, 'i'],
  [/oo|ou/g, 'u'],
  [/y$/g, 'i'],
  [/([aeiou])\1+/g, '$1'],
  [/([b-df-hj-np-tv-z])\1+/g, '$1'],
];

/** One word folded to a spelling-insensitive key: "Shrestha" -> "sresta", "Laxmi" -> "laksmi". */
export function foldWord(word: string): string {
  let w = word;
  for (const [re, to] of FOLDS) w = w.replace(re, to);
  return w;
}

/** The whole name as folded words: "Pooja  Shrestha" -> ["puja", "sresta"]. */
export function foldName(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean).map(foldWord);
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > max) return max + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[y.length];
}

/** How far apart two folded words may be: one typo, two for long words. */
const allowedTypos = (word: string) => (Array.from(word).length >= 8 ? 2 : 1);

/**
 * Two folded words are "the same" if equal or one or two letters apart. Words under 3 letters
 * must be equal; 3-letter words may only gain or lose a letter (Mya/Maya), so Ram is not Rai.
 */
export function wordsClose(a: string, b: string): boolean {
  if (a === b) return true;
  const la = Array.from(a).length;
  const lb = Array.from(b).length;
  if (la < 3 || lb < 3) return false;
  if (Math.min(la, lb) < 4) return la !== lb && editDistance(a, b, 1) <= 1;
  return editDistance(a, b, 2) <= Math.min(allowedTypos(a), allowedTypos(b));
}

/**
 * How well a typed query matches a name, or null if it does not. Every query word must match a
 * different word of the name (exactly, by spelling variant, by a prefix of 3+ letters, or within a
 * typo). Lower is better: 0 = all words exact.
 */
export function fuzzyScore(query: string, name: string): number | null {
  const q = foldName(query);
  const n = foldName(name);
  if (q.length === 0 || q.length > n.length) return null;
  const used = new Set<number>();
  let score = 0;
  for (const word of q) {
    let bestIdx = -1;
    let bestCost = Infinity;
    n.forEach((candidate, i) => {
      if (used.has(i)) return;
      let cost = Infinity;
      if (candidate === word) cost = 0;
      else if (Array.from(word).length >= 3 && candidate.startsWith(word)) cost = 0.5;
      else if (wordsClose(word, candidate)) cost = editDistance(word, candidate, 2);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return null;
    used.add(bestIdx);
    score += bestCost;
  }
  return score;
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

/** "REG-01013", "reg-1013" or "1013" -> 1013; anything else -> null. */
export function parsePublicId(text: string): number | null {
  const m = /^(?:reg-?)?0*(\d{1,9})$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
