import { LANGS, type Lang, type Portal } from '@searchai/core';
import { FACT_WORDS, JOB_ROLES, PLACES, PORTAL_WORDS, WORDS, type Place } from '@searchai/datagen';
import { tokenize } from './normalize.ts';

export type WordKind = keyof typeof WORDS;

export type Entry =
  | { kind: 'fact'; field: string; value: string | boolean; portals: Portal[]; lang: Lang }
  | { kind: 'portal'; portal: Portal; lang: Lang }
  | { kind: 'place'; place: Place; lang: Lang | null }
  | { kind: 'word'; word: WordKind; lang: Lang };

const FIELD_PORTALS: Record<string, Portal[]> = {
  fuel: ['cars'],
  body: ['cars'],
  gearbox: ['cars'],
  type: ['homes', 'rentals'],
  furnished: ['rentals'],
  seniority: ['jobs'],
  remote: ['jobs'],
  contract: ['jobs'],
  role: ['jobs'],
  category: ['marketplace'],
  condition: ['marketplace'],
};

/** Phrase (tokens joined by a space) -> every meaning it can have. */
export type Dictionary = Map<string, Entry[]>;

function add(dict: Dictionary, phrase: string, entry: Entry) {
  const key = tokenize(phrase).map((t) => t.text).join(' ');
  if (!key) return;
  const list = dict.get(key) ?? [];
  list.push(entry);
  dict.set(key, list);
}

function build(): Dictionary {
  const dict: Dictionary = new Map();
  for (const [key, byLang] of Object.entries(FACT_WORDS)) {
    const [field, raw] = key.split(':') as [string, string];
    const value = raw === 'true' ? true : raw === 'false' ? false : raw;
    for (const lang of LANGS)
      for (const w of byLang[lang]) add(dict, w, { kind: 'fact', field, value, portals: FIELD_PORTALS[field]!, lang });
  }
  for (const [role, byLang] of Object.entries(JOB_ROLES))
    for (const lang of LANGS)
      for (const w of byLang[lang]) add(dict, w, { kind: 'fact', field: 'role', value: role, portals: ['jobs'], lang });
  for (const [portal, byLang] of Object.entries(PORTAL_WORDS) as [Portal, Record<Lang, string[]>][])
    for (const lang of LANGS) for (const w of byLang[lang]) add(dict, w, { kind: 'portal', portal, lang });
  for (const place of PLACES) for (const alias of place.aliases) add(dict, alias, { kind: 'place', place, lang: null });
  for (const [word, byLang] of Object.entries(WORDS) as [WordKind, Record<Lang, string[]>][])
    for (const lang of LANGS) for (const w of byLang[lang]) add(dict, w, { kind: 'word', word, lang });
  return dict;
}

export const DICTIONARY: Dictionary = build();
export const MAX_PHRASE_TOKENS = Math.max(...[...DICTIONARY.keys()].map((k) => k.split(' ').length));

/** Single-token phrases that typo matching may correct to. */
export const TYPO_TARGETS: string[] = [...DICTIONARY.entries()]
  .filter(([k]) => !k.includes(' ') && k.length >= 5)
  .map(([k]) => k);
