import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { generateListings } from '@searchai/datagen';
import { buildVectorIndexes, ingestListings, reembedStale, type EmbedderLike } from '../src/index.ts';
import { freshDb } from './helpers.ts';

/** Deterministic stand-in for the real model: a unit vector seeded by text length. */
function fakeEmbedder(version: string): EmbedderLike {
  return {
    model: 'fake',
    version,
    dim: 384,
    embed: async (texts) =>
      texts.map((t) => {
        const v = new Float32Array(384).map((_, i) => Math.sin(t.length + i));
        const n = Math.hypot(...v);
        return v.map((x) => x / n);
      }),
  };
}

let sql: postgres.Sql;
beforeAll(async () => {
  ({ sql } = await freshDb('searchai_test_ingest'));
});
afterAll(async () => sql?.end());

describe('ingestListings', () => {
  it('loads listings and embeddings', async () => {
    const res = await ingestListings(sql, generateListings({ seed: 1, count: 50 }), {
      embedder: fakeEmbedder('v1'),
      factsSource: 'truth',
    });
    expect(res.rows).toBe(50);
    const [l] = await sql`SELECT count(*)::int AS n FROM listings`;
    const [e] = await sql`SELECT count(*)::int AS n, count(DISTINCT portal)::int AS portals FROM listing_embeddings`;
    expect(l!.n).toBe(50);
    expect(e).toEqual({ n: 50, portals: 5 });
  });

  it('builds one partial HNSW index per portal', async () => {
    const built = await buildVectorIndexes(sql, { perPortal: true });
    expect(Object.keys(built).length).toBe(5);
    const idx = await sql`SELECT indexname FROM pg_indexes WHERE indexname LIKE 'listing_emb_hnsw_%'`;
    expect(idx.length).toBe(5);
  });

  it('re-embeds rows from an older model version', async () => {
    expect(await reembedStale(sql, fakeEmbedder('v2'))).toBe(50);
    expect(await reembedStale(sql, fakeEmbedder('v2'))).toBe(0);
  });
});
