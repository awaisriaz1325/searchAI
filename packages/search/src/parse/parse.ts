import { LANGS, type FactConstraint, type HardFilters, type Lang, type Portal } from '@searchai/core';
import { DICTIONARY, MAX_PHRASE_TOKENS, TYPO_TARGETS, type Entry } from './dictionary.ts';
import { editDistance, tokenize, type Token } from './normalize.ts';
import { findNumbers, type NumberToken } from './numbers.ts';

export { parseNumber } from './numbers.ts';

export interface ParsedQuery {
  lang: Lang;
  portal: Portal | null;
  filters: HardFilters;
  /** Words left after removing every recognised constraint; what semantic search embeds. */
  semantic: string;
  /** Constraint-like text the parser could not interpret (unknown city, stray number). */
  unparsed: string[];
  /** Recognised constraints / (recognised + unparsed); 1 when nothing constraint-like was seen. */
  confidence: number;
}

export const DEFAULT_RADIUS_KM = 50;
/** Near-words strong enough that an unknown word after them is probably a place name. */
const STRONG_NEAR = new Set(['near', 'around', 'bei', 'nahe', 'près de', 'autour de', 'cerca de', 'w okolicy', 'koło']);
const STOPWORDS: Record<Lang, string[]> = {
  en: ['the', 'for', 'with', 'and', 'a', 'my', 'to'],
  de: ['und', 'mit', 'für', 'ein', 'eine', 'der', 'die', 'das', 'zum', 'zu'],
  fr: ['et', 'avec', 'pour', 'une', 'un', 'le', 'la', 'des', 'du'],
  es: ['y', 'con', 'para', 'una', 'un', 'el', 'la', 'del', 'mi'],
  pl: ['i', 'z', 'dla', 'na', 'się', 'bez', 'żeby'],
};

interface Match {
  from: number; // token index, inclusive
  to: number; // token index, exclusive
  phrase: string;
  entries: Entry[];
  used: boolean;
}

function emptyResult(lang: Lang = 'en'): ParsedQuery {
  return { lang, portal: null, filters: { facts: {} }, semantic: '', unparsed: [], confidence: 1 };
}

/** Scores each language by the dictionary words and stop-words the text uses. */
export function detectLang(text: string): Lang {
  const tokens = tokenize(text);
  const score = Object.fromEntries(LANGS.map((l) => [l, 0])) as Record<Lang, number>;
  for (const m of matchPhrases(tokens, [])) {
    const langs = new Set(m.entries.map((e) => e.lang).filter((l): l is Lang => l !== null));
    for (const l of langs) score[l] += 1 / langs.size;
  }
  for (const t of tokens) for (const l of LANGS) if (STOPWORDS[l].includes(t.text)) score[l] += 0.5;
  let best: Lang = 'en';
  for (const l of LANGS) if (score[l] > score[best]) best = l;
  return best;
}

function matchPhrases(tokens: Token[], numbers: NumberToken[]): Match[] {
  const out: Match[] = [];
  const numberBetween = (a: Token, b: Token) => numbers.some((n) => n.start >= a.end && n.end <= b.start);
  for (let i = 0; i < tokens.length; ) {
    let found: Match | null = null;
    for (let len = Math.min(MAX_PHRASE_TOKENS, tokens.length - i); len >= 1; len--) {
      if (len > 1 && numberBetween(tokens[i]!, tokens[i + len - 1]!)) continue;
      const phrase = tokens.slice(i, i + len).map((t) => t.text).join(' ');
      const entries = DICTIONARY.get(phrase);
      if (entries) {
        found = { from: i, to: i + len, phrase, entries, used: false };
        break;
      }
    }
    if (!found && tokens[i]!.text.length >= 5) {
      const close = TYPO_TARGETS.filter((w) => editDistance(tokens[i]!.text, w) <= 1);
      if (close.length === 1) found = { from: i, to: i + 1, phrase: close[0]!, entries: DICTIONARY.get(close[0]!)!, used: false };
    }
    if (found) {
      out.push(found);
      i = found.to;
    } else i++;
  }
  return out;
}

function votePortal(matches: Match[]): Portal | null {
  const votes = new Map<Portal, number>();
  const vote = (p: Portal, w: number) => votes.set(p, (votes.get(p) ?? 0) + w);
  for (const m of matches) {
    const portals = new Set<Portal>();
    for (const e of m.entries) {
      if (e.kind === 'portal') portals.add(e.portal);
      if (e.kind === 'fact') e.portals.forEach((p) => portals.add(p));
      if (e.kind === 'word') {
        if (e.word === 'km' || e.word === 'mileage') portals.add('cars');
        if (e.word === 'rooms' || e.word === 'area') ['homes', 'rentals'].forEach((p) => portals.add(p as Portal));
        if (e.word === 'perMonth') portals.add('rentals');
        if (e.word === 'salary') portals.add('jobs');
      }
    }
    for (const p of portals) vote(p, 1 / portals.size);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0]![1])) return null;
  return ranked[0]![0];
}

const wordOf = (m: Match | undefined) =>
  m?.entries.find((e): e is Extract<Entry, { kind: 'word' }> => e.kind === 'word')?.word;

/** Free text -> hard filters + the semantic remainder. Deterministic; never throws. */
export function parseQuery(input: string, opts: { portal?: Portal } = {}): ParsedQuery {
  const text = (input ?? '').normalize('NFC').trim();
  if (!text) return emptyResult();
  const lang = detectLang(text);
  const lower = text.toLowerCase();
  const numbers = findNumbers(lower, lang);
  let masked = lower;
  for (const n of numbers) masked = masked.slice(0, n.start) + ' '.repeat(n.end - n.start) + masked.slice(n.end);
  const tokens = tokenize(masked);
  const matches = matchPhrases(tokens, numbers);
  const portal = opts.portal ?? votePortal(matches);

  const filters: HardFilters = { facts: {} };
  if (portal) filters.portal = portal;
  const unparsed: string[] = [];
  let recognised = 0;
  const consumed = new Set<number>();
  const consume = (m: Match) => {
    m.used = true;
    for (let i = m.from; i < m.to; i++) consumed.add(i);
  };

  for (const m of matches) {
    const facts = m.entries.filter(
      (e): e is Extract<Entry, { kind: 'fact' }> => e.kind === 'fact' && (!portal || e.portals.includes(portal)),
    );
    const fact = facts.find((e) => e.lang === lang) ?? facts[0];
    if (fact && !filters.facts[fact.field]) {
      filters.facts[fact.field] = { eq: fact.value };
      recognised++;
      consume(m);
      continue;
    }
    const place = m.entries.find((e): e is Extract<Entry, { kind: 'place' }> => e.kind === 'place');
    if (place && !filters.geo) {
      filters.geo = { lat: place.place.lat, lon: place.place.lon, radiusKm: DEFAULT_RADIUS_KM };
      recognised++;
      consume(m);
      const prev = matches[matches.indexOf(m) - 1];
      if (prev && prev.to === m.from && wordOf(prev) === 'near') consume(prev);
    }
  }

  // Attach each number to the comparator before it and the unit after it.
  const matchEndingBefore = (pos: number) =>
    [...matches].reverse().find((m) => tokens[m.to - 1]!.end <= pos && pos - tokens[m.to - 1]!.end <= 3);
  const matchStartingAfter = (pos: number) =>
    matches.find((m) => tokens[m.from]!.start >= pos && tokens[m.from]!.start - pos <= 3);
  for (const n of numbers) {
    const before = matchEndingBefore(n.start);
    const cmp = wordOf(before) === 'max' || wordOf(before) === 'min' ? wordOf(before) : undefined;
    const after = matchStartingAfter(n.end);
    const unit = wordOf(after);
    const salaryNear = matches.some(
      (m) => wordOf(m) === 'salary' && tokens[m.to - 1]!.end <= n.start && n.start - tokens[m.to - 1]!.end < 25,
    );
    const range = (field: string, defaultCmp: 'max' | 'min') => {
      const c: FactConstraint = (cmp ?? defaultCmp) === 'max' ? { max: n.value } : { min: n.value };
      filters.facts[field] = { ...filters.facts[field], ...c };
    };

    if (unit === 'km') range('mileage_km', 'max');
    else if (unit === 'rooms') range('rooms', 'min');
    else if (unit === 'area') range('area_m2', 'min');
    else if (salaryNear) range(cmp === 'max' ? 'salary_min' : 'salary_max', 'min');
    else if (n.money || cmp) {
      const minor = Math.round(n.value * 100);
      if (cmp === 'min') filters.priceMinMinor = minor;
      else filters.priceMaxMinor = minor;
    } else {
      unparsed.push(n.raw);
      continue;
    }
    recognised++;
    if (cmp && before) consume(before);
    if (unit && after) consume(after);
    if (unit === 'perMonth' && after) consume(after);
    const perMonth = matchStartingAfter(n.end);
    if (wordOf(perMonth) === 'perMonth') consume(perMonth!);
    for (const m of matches) if (wordOf(m) === 'salary' || wordOf(m) === 'mileage') consume(m);
  }

  // An unknown word right after a strong near-word is probably a place we do not know.
  for (const m of matches) {
    if (wordOf(m) !== 'near' || m.used || !STRONG_NEAR.has(m.phrase)) continue;
    const next = tokens[m.to];
    if (next && !matches.some((x) => x.from === m.to) && /^\p{L}+$/u.test(next.text)) {
      unparsed.push(next.text);
      consume(m);
      consumed.add(m.to);
    }
  }

  const semantic = tokens
    .filter((_, i) => !consumed.has(i))
    .map((t) => t.text)
    .join(' ');
  const confidence = recognised + unparsed.length === 0 ? 1 : recognised / (recognised + unparsed.length);
  return { lang, portal, filters, semantic, unparsed, confidence };
}

const near = (a?: number, b?: number) => a === b || (a !== undefined && b !== undefined && Math.abs(a - b) < 0.01);

/** Same constraints (portal ignored), with geo compared to 0.01 degrees. */
export function filtersEqual(a: HardFilters, b: HardFilters): boolean {
  if (a.priceMaxMinor !== b.priceMaxMinor || a.priceMinMinor !== b.priceMinMinor) return false;
  if (!!a.geo !== !!b.geo) return false;
  if (a.geo && b.geo && !(near(a.geo.lat, b.geo.lat) && near(a.geo.lon, b.geo.lon) && a.geo.radiusKm === b.geo.radiusKm))
    return false;
  const ka = Object.keys(a.facts).sort();
  const kb = Object.keys(b.facts).sort();
  if (ka.join() !== kb.join()) return false;
  return ka.every((k) => JSON.stringify(sortKeys(a.facts[k]!)) === JSON.stringify(sortKeys(b.facts[k]!)));
}

const sortKeys = (o: object) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
