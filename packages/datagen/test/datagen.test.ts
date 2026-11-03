import { describe, expect, it } from 'vitest';
import { LANGS, PORTALS, factsSchemas } from '@searchai/core';
import { PLACES, generateGoldenQueries, generateListings, relevance } from '../src/index.ts';

const listings = [...generateListings({ seed: 1, count: 1000 })];
const queries = generateGoldenQueries(1);

describe('generateListings', () => {
  it('is deterministic for a seed', () => {
    const again = [...generateListings({ seed: 1, count: 50 })];
    expect(again).toEqual(listings.slice(0, 50));
  });

  it('balances portals and languages', () => {
    for (const portal of PORTALS) {
      expect(listings.filter((l) => l.portal === portal).length).toBe(200);
      for (const lang of LANGS) {
        expect(listings.filter((l) => l.portal === portal && l.lang === lang).length).toBe(40);
      }
    }
  });

  it('produces schema-valid facts', () => {
    for (const l of listings) expect(factsSchemas[l.portal].safeParse(l.facts).success).toBe(true);
  });

  it('places know local city names', () => {
    expect(PLACES.length).toBeGreaterThanOrEqual(30);
    expect(PLACES.find((p) => p.name === 'munich')?.aliases).toContain('münchen');
  });
});

describe('generateGoldenQueries', () => {
  it('has 40 queries per portal', () => {
    for (const portal of PORTALS) expect(queries.filter((q) => q.portal === portal).length).toBe(40);
  });

  it('every answerable query has a relevant listing; impossible ones have none', () => {
    for (const q of queries) {
      const hits = listings.filter((l) => relevance(q, l) > 0).length;
      if (q.category === 'impossible') expect(hits, q.text).toBe(0);
      else expect(hits, q.text).toBeGreaterThan(0);
    }
  });

  it('never counts a draft as relevant', () => {
    const draft = listings.find((l) => l.status === 'draft')!;
    const q = { ...queries[0]!, portal: draft.portal, filters: { facts: {} }, intent: [] };
    expect(relevance(q, draft)).toBe(0);
  });
});
