import {
  LANGS,
  PORTALS,
  matchesFilters,
  type FactConstraint,
  type Facts,
  type HardFilters,
  type Lang,
  type Portal,
} from '@searchai/core';
import { INTENTS, JOB_ROLES, PORTAL_WORDS, WORDS, type Intent } from './lexicon.ts';
import { generateListings, type GeneratedListing } from './listings.ts';
import { PLACES } from './places.ts';
import { factWord, formatMoney, formatNumber } from './render.ts';
import { createRng, type Rng } from './rng.ts';

export type QueryCategory =
  | 'filter'
  | 'filter_semantic'
  | 'paraphrase'
  | 'cross_language'
  | 'typo'
  | 'impossible';

export interface IntentLabel {
  id: string;
  field: string;
  values?: (string | boolean)[];
  min?: number;
  max?: number;
}

export interface GoldenQuery {
  id: string;
  portal: Portal | null;
  lang: Lang;
  text: string;
  category: QueryCategory;
  /** Constraints the text expresses; a relevant listing must satisfy all of them. */
  filters: HardFilters;
  /** Soft preferences; each one a listing matches raises its graded relevance. */
  intent: IntentLabel[];
}

const CATEGORY_PLAN: QueryCategory[] = [
  ...Array<QueryCategory>(8).fill('filter'),
  ...Array<QueryCategory>(8).fill('filter_semantic'),
  ...Array<QueryCategory>(6).fill('paraphrase'),
  ...Array<QueryCategory>(6).fill('cross_language'),
  ...Array<QueryCategory>(6).fill('typo'),
  ...Array<QueryCategory>(6).fill('impossible'),
];

const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
const floorTo = (v: number, step: number) => Math.max(step, Math.floor(v / step) * step);

export function intentMatches(i: IntentLabel, facts: Record<string, unknown>): boolean {
  const v = facts[i.field];
  if (i.values) return i.values.includes(v as string | boolean);
  if (typeof v !== 'number') return false;
  return (i.min === undefined || v >= i.min) && (i.max === undefined || v <= i.max);
}

/** Graded relevance 0-3: 0 if any hard constraint fails, else 1 + matched intents (max 3). */
export function relevance(q: GoldenQuery, l: GeneratedListing): number {
  if (l.status !== 'published') return 0;
  if (q.portal && l.portal !== q.portal) return 0;
  if (!matchesFilters(q.filters, l as unknown as Parameters<typeof matchesFilters>[1])) return 0;
  return Math.min(3, 1 + q.intent.filter((i) => intentMatches(i, l.facts as Record<string, unknown>)).length);
}

interface Segment {
  kind: 'word' | 'num' | 'geo';
  text: string;
}

/** A constraint the query can state, with its filter and its text in the query language. */
interface Clause {
  apply(f: HardFilters): void;
  render(lang: Lang, variant: number, rng: Rng): Segment;
}

const eqClause = (field: string, value: string | boolean, key = `${field}:${value}`): Clause => ({
  apply: (f) => (f.facts[field] = { eq: value } as FactConstraint),
  render: (lang, variant) => ({ kind: 'word', text: factWord(key, lang, variant) }),
});

const KM_PREFIX: Record<Lang, string> = { en: 'under', de: 'unter', fr: 'moins de', es: 'menos de', pl: 'przebieg do' };
const ROOMS_PREFIX: Record<Lang, string> = { en: 'at least', de: 'ab', fr: 'au moins', es: 'desde', pl: 'od' };

function priceClause(portal: Portal, maxEur: number): Clause {
  return {
    apply: (f) => (f.priceMaxMinor = maxEur * 100),
    render: (lang, variant, rng) => {
      const cmp = WORDS.max[lang][variant ? 1 : 0]!;
      const per = portal === 'rentals' ? ` ${WORDS.perMonth[lang][0]}` : '';
      return { kind: 'num', text: `${cmp} ${formatMoney(maxEur, lang, rng)}${per}` };
    },
  };
}

function cityClause(city: string): Clause {
  const place = PLACES.find((p) => p.name === city)!;
  return {
    apply: (f) => (f.geo = { lat: place.lat, lon: place.lon, radiusKm: 50 }),
    render: (lang, variant) => ({
      kind: 'geo',
      text: `${WORDS.near[lang][variant ? 1 : 0]} ${place.display[lang] ?? place.name}`,
    }),
  };
}

/** Every constraint a query about `t` could state, all of which `t` satisfies. */
function clausesFor(t: GeneratedListing): Clause[] {
  const priceEur = t.priceMinor / 100;
  const base = [cityClause(t.city)];
  switch (t.portal) {
    case 'cars': {
      const f = t.facts as Facts<'cars'>;
      return [
        eqClause('fuel', f.fuel),
        eqClause('body', f.body),
        priceClause('cars', ceilTo(priceEur + 1, 1_000)),
        {
          apply: (q) => (q.facts.mileage_km = { max: ceilTo(f.mileage_km + 1, 10_000) }),
          render: (lang) => ({
            kind: 'num',
            text: `${KM_PREFIX[lang]} ${formatNumber(ceilTo(f.mileage_km + 1, 10_000), lang)} km`,
          }),
        },
        ...base,
      ];
    }
    case 'homes':
    case 'rentals': {
      const f = t.facts as Facts<'rentals'>;
      return [
        eqClause('type', f.type),
        ...(t.portal === 'rentals' ? [eqClause('furnished', f.furnished)] : []),
        priceClause(t.portal, ceilTo(priceEur + 1, t.portal === 'homes' ? 10_000 : 50)),
        {
          apply: (q) => (q.facts.rooms = { min: Math.floor(f.rooms) }),
          render: (lang) => ({
            kind: 'num',
            text: `${ROOMS_PREFIX[lang]} ${Math.floor(f.rooms)} ${WORDS.rooms[lang][lang === 'pl' ? 1 : 0]}`,
          }),
        },
        ...base,
      ];
    }
    case 'jobs': {
      const f = t.facts as Facts<'jobs'>;
      return [
        {
          apply: (q) => (q.facts.role = { eq: f.role }),
          render: (lang) => ({ kind: 'word', text: JOB_ROLES[f.role]![lang][0]! }),
        },
        eqClause('remote', f.remote),
        eqClause('seniority', f.seniority),
        {
          apply: (q) => (q.facts.salary_max = { min: floorTo(f.salary_max, 5_000) }),
          render: (lang, _v, rng) => ({
            kind: 'num',
            text: `${WORDS.salary[lang][0]} ${WORDS.min[lang][lang === 'en' ? 1 : 0]} ${formatMoney(floorTo(f.salary_max, 5_000), lang, rng)}`,
          }),
        },
        ...base,
      ];
    }
    case 'marketplace': {
      const f = t.facts as Facts<'marketplace'>;
      return [
        eqClause('category', f.category),
        priceClause('marketplace', ceilTo(priceEur + 1, 10)),
        eqClause('condition', f.condition),
        ...base,
      ];
    }
  }
}

/** Swaps two adjacent letters in the longest word: "transporter" -> "transpotrer". */
function typo(text: string, rng: Rng): string {
  const words = text.split(' ');
  let idx = 0;
  words.forEach((w, i) => {
    if (/^\p{L}+$/u.test(w) && w.length > words[idx]!.length) idx = i;
  });
  const w = words[idx]!;
  if (w.length < 4) return text;
  const at = rng.int(1, w.length - 3);
  words[idx] = w.slice(0, at) + w[at + 1] + w[at] + w.slice(at + 2);
  return words.join(' ');
}

function portalWord(portal: Portal, lang: Lang): string | null {
  return portal === 'homes' || portal === 'rentals' || portal === 'jobs'
    ? PORTAL_WORDS[portal][lang][0]!
    : null;
}

function buildText(
  portal: Portal,
  lang: Lang,
  clauses: Clause[],
  intent: Intent | null,
  variant: number,
  rng: Rng,
): string {
  const segs = clauses.map((c) => c.render(lang, variant, rng));
  const words = segs.filter((s) => s.kind === 'word').map((s) => s.text);
  const nums = segs.filter((s) => s.kind === 'num').map((s) => s.text);
  const geo = segs.filter((s) => s.kind === 'geo').map((s) => s.text);
  const head = [intent?.phrases[lang][variant] ?? null, ...words, portalWord(portal, lang)]
    .filter(Boolean)
    .join(' ');
  return [head, [...geo, ...nums].join(', ')].filter(Boolean).join(' ').trim();
}

/** Constraints no generated listing of the portal can satisfy (the generator never makes them). */
const IMPOSSIBLE: Record<Portal, Clause[]> = {
  cars: [eqClause('fuel', 'electric'), eqClause('body', 'pickup')],
  homes: [priceClause('homes', 9_000)],
  rentals: [priceClause('rentals', 40)],
  jobs: [
    {
      apply: (q) => (q.facts.salary_max = { min: 400_000 }),
      render: (lang, _v, rng) => ({
        kind: 'num',
        text: `${WORDS.salary[lang][0]} ${WORDS.min[lang][lang === 'en' ? 1 : 0]} ${formatMoney(400_000, lang, rng)}`,
      }),
    },
  ],
  marketplace: [priceClause('marketplace', 2)],
};

/** 40 labeled queries per portal across six categories, in all five languages. */
export function generateGoldenQueries(seed: number): GoldenQuery[] {
  const rng = createRng(seed * 7_919 + 17);
  const pool = [...generateListings({ seed, count: 1000 })].filter((l) => l.status === 'published');
  const out: GoldenQuery[] = [];

  for (const portal of PORTALS) {
    const listings = pool.filter((l) => l.portal === portal);
    CATEGORY_PLAN.forEach((category, n) => {
      let lang = LANGS[n % LANGS.length]!;
      let target = rng.pick(listings);
      let intent: Intent | null = null;

      if (category !== 'filter' && category !== 'impossible') {
        // Pick a target that satisfies at least one intent, and use that intent.
        for (let tries = 0; tries < 200; tries++) {
          const ok = INTENTS[portal].filter((i) => intentMatches(i, target.facts as Record<string, unknown>));
          if (ok.length) {
            intent = rng.pick(ok);
            break;
          }
          target = rng.pick(listings);
        }
      }
      if (category === 'cross_language') {
        const other = LANGS.filter((l) => l !== target.lang);
        lang = other[n % other.length]!;
      }

      // An impossible query keeps only the city, so its absurd constraint never contradicts
      // another clause of the same kind in the text.
      const clauses =
        category === 'impossible'
          ? [cityClause(target.city), ...IMPOSSIBLE[portal]]
          : rng.shuffle(clausesFor(target)).slice(0, category === 'filter' ? rng.int(2, 4) : rng.int(1, 2));

      const filters: HardFilters = { portal, facts: {} };
      clauses.forEach((c) => c.apply(filters));
      const variant = category === 'paraphrase' ? 1 : 0;
      let text = buildText(portal, lang, clauses, intent, variant, rng);
      if (category === 'typo') text = typo(text, rng);

      out.push({
        id: `${portal}-${String(n + 1).padStart(2, '0')}`,
        portal,
        lang,
        text,
        category,
        filters,
        intent: intent
          ? [{ id: intent.id, field: intent.field, values: intent.values, min: intent.min, max: intent.max }]
          : [],
      });
    });
  }
  return out;
}
