import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { generateListings } from '@searchai/datagen';
import { buildVectorIndexes, ingestListings } from '@searchai/db';
import { createHashEmbedder } from '@searchai/ml';
import { DEFAULT_CONFIG, createMemoryCache, createSearch, loadPrices } from '@searchai/search';
import { freshDb } from '../../../packages/db/test/helpers.ts';
import { Metrics, buildApp } from '../src/app.ts';

let sql: postgres.Sql;
let app: ReturnType<typeof buildApp>;
const embedder = createHashEmbedder();
const embedSpy = vi.spyOn(embedder, 'embed');

beforeAll(async () => {
  ({ sql } = await freshDb('searchai_test_api'));
  await ingestListings(sql, generateListings({ seed: 1, count: 300 }), { embedder, factsSource: 'truth' });
  await buildVectorIndexes(sql, { perPortal: true });
  const metrics = new Metrics();
  const search = createSearch({
    sql,
    embedder,
    prices: await loadPrices(),
    config: DEFAULT_CONFIG,
    cache: createMemoryCache(),
    onResponse: (r) => metrics.record(r),
  });
  app = buildApp({ search, metrics, sql });
});
afterAll(async () => sql?.end());

const post = (body: unknown) =>
  app.request('/search', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('HTTP API', () => {
  it('serves a repeated request from the cache without embedding again', async () => {
    const first = await (await post({ q: 'diesel kombi', portal: 'cars' })).json();
    const calls = embedSpy.mock.calls.length;
    const second = await (await post({ q: '  Diesel Kombi ', portal: 'cars' })).json();
    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
    expect(embedSpy.mock.calls.length).toBe(calls);
    expect(second.results.map((r: { id: number }) => r.id)).toEqual(first.results.map((r: { id: number }) => r.id));
  });

  it('answers an empty query with no results', async () => {
    const res = await post({ q: '' });
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([]);
  });

  it('rejects an over-long query and an unknown portal', async () => {
    expect((await post({ q: 'x'.repeat(301) })).status).toBe(400);
    expect((await post({ q: 'van', portal: 'boats' })).status).toBe(400);
  });

  it('exposes Prometheus metrics and health', async () => {
    const text = await (await app.request('/metrics')).text();
    expect(text).toContain('search_requests_total');
    expect(text).toContain('search_stage_ms_bucket');
    expect((await app.request('/health')).status).toBe(200);
  });
});
