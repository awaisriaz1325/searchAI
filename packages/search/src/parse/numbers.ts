import type { Lang } from '@searchai/core';

/**
 * A number as people write it in listings and queries: "25.000 €", "€25,000", "25k",
 * "3 000 EUR", "2,5". Grouped thousands come first so "100.000" is not read as 100.
 */
export const NUMBER_RE =
  /(?:€\s?)?(?<![\p{L}\p{N}])(?:\d{1,3}(?:[.,   ]\d{3})+|\d+(?:[.,]\d+)?)(?:\s?k(?![\p{L}]))?(?:\s?(?:€|eur(?:o|os)?(?![\p{L}])))?/giu;

export interface NumberToken {
  value: number;
  money: boolean;
  start: number;
  end: number;
  raw: string;
}

/** Parses one number token in the conventions of `lang`; null when it is not a number. */
export function parseNumber(token: string, lang: Lang): number | null {
  let t = token.toLowerCase().replace(/€|eur(?:o|os)?/g, '').trim();
  let mult = 1;
  if (/\d\s?k$/.test(t)) {
    mult = 1_000;
    t = t.replace(/\s?k$/, '');
  }
  t = t.replace(/[  ]/g, ' ');
  if (/^\d{1,3}([., ]\d{3})+$/.test(t)) {
    // A single separator followed by exactly three digits is thousands grouping, except an
    // English "2.500" style decimal is not used in queries, so grouping wins in every language.
    return Number(t.replace(/[., ]/g, '')) * mult;
  }
  if (/^\d+[.,]\d+$/.test(t)) {
    const sep = lang === 'en' ? '.' : ',';
    const normalized = t.includes(sep) ? t.replace(sep, '.') : t.replace(/[.,]/, '.');
    return Number(normalized) * mult;
  }
  if (/^\d+$/.test(t)) return Number(t) * mult;
  return null;
}

/** Every number token in `text`, with its value and whether it carries a currency. */
export function findNumbers(text: string, lang: Lang): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[0].trim();
    const value = parseNumber(raw, lang);
    if (value === null) continue;
    const start = m.index! + m[0].indexOf(raw);
    out.push({ value, money: /€|eur/i.test(raw), start, end: start + raw.length, raw });
  }
  return out;
}
