import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { matchesFilters } from '@searchai/core';
import { PLACES, generateListings } from '@searchai/datagen';
import { buildVectorIndexes, ingestListings } from '@searchai/db';
import { createHashEmbedder } from '@searchai/ml';
import { freshDb } from '../../db/test/helpers.ts';
import { createSearch, DEFAULT_CONFIG, loadPrices, parseQuery, type SearchFn } from '../src/index.ts';

const listings = [...generateListings({ seed: 1, count: 1000 })];
let sql: postgres.Sql;
let search: SearchFn;

beforeAll(async () => {
  ({ sql } = await freshDb('searchai_test_search'));
  const embedder = createHashEmbedder();
  await ingestListings(sql, listings, { embedder, factsSource: 'truth' });
  await buildVectorIndexes(sql, { perPortal: true });
  search = createSearch({ sql, embedder, prices: await loadPrices(), config: DEFAULT_CONFIG });
});
afterAll(async () => sql?.end());

describe('search', () => {
  it('answers a filtered geo query with exactly the eligible, published listings', async () => {
    // Built from a real listing so the eligible set is never empty.
    const car = listings.find((l) => l.portal === 'cars' && l.status === 'published' && (l.facts as { fuel: string }).fuel === 'diesel')!;
    const q = `diesel near ${PLACES.find((p) => p.name === car.city)!.display.en}`;
    const res = await search({ q, portal: 'cars' });
    const eligible = listings.filter((l) => l.status === 'published' && matchesFilters(parseQuery(q, { portal: 'cars' }).filters, l));
    expect(res.plan!.kind).toBe('exact');
    expect(eligible.length).toBeGreaterThan(0);
    expect(res.results.length).toBe(Math.min(20, eligible.length));
    for (const r of res.results) expect(eligible.map((l) => l.id)).toContain(r.id);
  });

  it('uses the HNSW iterative scan above the threshold and still respects every filter', async () => {
    const ann = createSearch({ sql, embedder: createHashEmbedder(), prices: await loadPrices(), config: { ...DEFAULT_CONFIG, exactThreshold: 0 } });
    const q = 'diesel under €30,000';
    const res = await ann({ q, portal: 'cars' });
    const f = parseQuery(q, { portal: 'cars' }).filters;
    expect(res.plan!.kind).toBe('ann');
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) expect(matchesFilters(f, r)).toBe(true);
    expect(res.violations).toBe(0);
  });

  it('returns empty with reason when filters match nothing', async () => {
    const res = await search({ q: 'electric pickup under €1,000', portal: 'cars' });
    expect(res.results).toEqual([]);
    expect(res.reason).toBe('no_match_for_filters');
  });

  it('query text with SQL metacharacters is parameterized', async () => {
    const res = await search({ q: "van'; DROP TABLE listings; -- %\\", portal: 'cars' });
    expect(Array.isArray(res.results)).toBe(true);
    const [c] = await sql`SELECT count(*)::int AS n FROM listings`;
    expect(c!.n).toBe(1000);
  });

  it('never returns a draft', async () => {
    const drafts = new Set(listings.filter((l) => l.status === 'draft').map((l) => l.id));
    for (const portal of ['cars', 'homes', 'rentals', 'jobs', 'marketplace'] as const) {
      const res = await search({ q: 'gut', portal, limit: 50 });
      for (const r of res.results) expect(drafts.has(r.id)).toBe(false);
    }
  });

  it('reports timings for every stage and a cost', async () => {
    const res = await search({ q: 'family car diesel near Berlin', portal: 'cars' });
    for (const k of ['parse', 'embed', 'plan', 'vector', 'keyword', 'fuse', 'postcheck'])
      expect(res.stageMs).toHaveProperty(k);
    expect(res.cost.modelCalls).toBeGreaterThanOrEqual(1);
    expect(res.cost.usdPer1k.total).toBeGreaterThan(0);
  });
});
