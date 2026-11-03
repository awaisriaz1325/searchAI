import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { asRole } from '../src/index.ts';
import { freshDb, vec } from './helpers.ts';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
let sql: postgres.Sql;

beforeAll(async () => {
  ({ sql } = await freshDb('searchai_test_rls'));
  await sql`
    INSERT INTO listings (id, portal, owner_id, status, title, description, lang, price_minor, lat, lon, facts, facts_source)
    VALUES (1, 'cars', ${OWNER}, 'published', 'VW Transporter Diesel', 'Kastenwagen', 'de', 2000000, 53.55, 9.99, '{}', 'truth'),
           (2, 'cars', ${OWNER}, 'draft', 'Ford Transit Diesel', 'Draft listing', 'en', 1500000, 53.55, 9.99, '{}', 'truth')`;
  await sql`
    INSERT INTO listing_embeddings (listing_id, portal, model, model_version, embedding)
    VALUES (1, 'cars', 'test', 'v1', ${vec(0.1)}::halfvec), (2, 'cars', 'test', 'v1', ${vec(0.1)}::halfvec)`;
});
afterAll(async () => sql?.end());

describe('row-level security', () => {
  it('anon sees only published listings and their embeddings', async () => {
    const counts = await asRole(sql, 'anon', null, async (tx) => {
      const [l] = await tx`SELECT count(*)::int AS n FROM listings`;
      const [e] = await tx`SELECT count(*)::int AS n FROM listing_embeddings`;
      return [l!.n, e!.n];
    });
    expect(counts).toEqual([1, 1]);
  });

  it('owner sees their draft, another user does not', async () => {
    const own = await asRole(sql, 'authenticated', OWNER, (tx) => tx`SELECT id FROM listings`);
    const other = await asRole(sql, 'authenticated', OTHER, (tx) => tx`SELECT id FROM listings`);
    expect(own.length).toBe(2);
    expect(other.length).toBe(1);
  });

  it('vector search as anon never returns a draft', async () => {
    const rows = await asRole(
      sql,
      'anon',
      null,
      (tx) =>
        tx`SELECT listing_id FROM listing_embeddings ORDER BY embedding <=> ${vec(0.1)}::halfvec LIMIT 10`,
    );
    expect(rows.map((r) => Number(r.listing_id))).toEqual([1]);
  });
});
