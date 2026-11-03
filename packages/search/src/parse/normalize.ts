export interface Token {
  text: string;
  start: number;
  end: number;
}

const TOKEN_RE = /[\p{L}\p{N}]+(?:[-'’²][\p{L}\p{N}²]+)*²?/gu;

/** Lowercased word tokens with their character spans in the original string. */
export function tokenize(text: string): Token[] {
  const lower = text.normalize('NFC').toLowerCase();
  return [...lower.matchAll(TOKEN_RE)].map((m) => ({
    text: m[0],
    start: m.index!,
    end: m.index! + m[0].length,
  }));
}

/** Optimal-string-alignment distance, capped: returns `cap + 1` once it is exceeded. */
export function editDistance(a: string, b: string, cap = 1): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}
