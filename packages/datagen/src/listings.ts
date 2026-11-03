import { LANGS, PORTALS, type Facts, type Lang, type Portal } from '@searchai/core';
import { generateFacts } from './facts.ts';
import { PLACES, type Place } from './places.ts';
import { renderListing } from './render.ts';
import { createRng, rngUuid } from './rng.ts';

export interface GeneratedListing {
  id: number;
  portal: Portal;
  lang: Lang;
  title: string;
  description: string;
  priceMinor: number;
  lat: number;
  lon: number;
  /** Canonical name of the city the listing was placed around. */
  city: string;
  facts: Facts;
  status: 'published' | 'draft';
  ownerId: string;
}

const HOME_COUNTRIES: Record<Lang, string[]> = {
  de: ['DE', 'AT', 'CH'],
  en: [],
  fr: ['FR', 'BE'],
  es: ['ES'],
  pl: ['PL'],
};

function pickPlace(lang: Lang, rng: ReturnType<typeof createRng>): Place {
  const local = PLACES.filter((p) => HOME_COUNTRIES[lang].includes(p.country));
  return local.length && rng.chance(0.6) ? rng.pick(local) : rng.pick(PLACES);
}

/**
 * Deterministic listing stream. Listing `id` depends only on (seed, id), so a 2M stream and
 * a 1k stream agree on their shared prefix. Portal and language rotate so every
 * (portal, language) pair gets an equal share.
 */
export function* generateListings(opts: {
  seed: number;
  count: number;
  startId?: number;
}): Generator<GeneratedListing> {
  const start = opts.startId ?? 1;
  for (let id = start; id < start + opts.count; id++) {
    const i = id - 1;
    const portal = PORTALS[i % PORTALS.length]!;
    const lang = LANGS[Math.floor(i / PORTALS.length) % LANGS.length]!;
    const rng = createRng(opts.seed * 1_000_003 + id);
    const place = pickPlace(lang, rng);
    const { facts, priceEur } = generateFacts(portal, rng);
    const { title, description } = renderListing(portal, facts, priceEur, lang, place, rng);
    const jitter = () => Math.max(-0.3, Math.min(0.3, rng.normal(0, 0.1)));
    yield {
      id,
      portal,
      lang,
      title,
      description,
      priceMinor: priceEur * 100,
      lat: +(place.lat + jitter()).toFixed(5),
      lon: +(place.lon + jitter()).toFixed(5),
      city: place.name,
      facts,
      status: rng.chance(0.05) ? 'draft' : 'published',
      ownerId: rngUuid(rng),
    };
  }
}
