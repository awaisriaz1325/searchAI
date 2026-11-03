/**
 * ef_search sweep for the HNSW iterative scan on the broad cars scenario (380k eligible rows).
 *   npx tsx bench/src/ef-sweep.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { GoldenQuery } from '@searchai/datagen';
import { createSql, vectorLiteral } from '@searchai/db';
import { createE5Embedder } from '@searchai/ml';
import { percentile } from '../../packages/eval/src/metrics.ts';

const sql = createSql(process.env.BENCH_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai_2m', { max: 1 });
const golden = JSON.parse(readFileSync('data/golden-queries.json', 'utf8')) as GoldenQuery[];
const vectors = (await (await createE5Embedder()).embed(golden.filter((g) => g.portal === 'cars').map((g) => g.text).slice(0, 20), 'query')).map(vectorLiteral);
const where = sql`l.status = 'published' AND l.portal = 'cars' AND l.price_minor <= 6000000`;
type R = { id: number; d: number };
const exact: R[][] = [];
for (const q of vectors)
  exact.push((await sql`WITH c AS MATERIALIZED (SELECT l.id FROM listings l WHERE ${where})
    SELECT e.listing_id::int AS id, (e.embedding <=> ${q}::halfvec)::float8 AS d FROM listing_embeddings e JOIN c ON c.id = e.listing_id ORDER BY d LIMIT 20`) as unknown as R[]);
const rows = [];
for (const ef of [40, 100, 200, 400, 800, 1000]) {
  const ms: number[] = [];
  const tol: number[] = [];
  const ratio: number[] = [];
  for (const [i, q] of vectors.entries()) {
    const t = performance.now();
    const got = (await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL hnsw.ef_search = ${ef}`);
      await tx.unsafe(`SET LOCAL hnsw.iterative_scan = ${process.env.ITER ?? 'relaxed_order'}`);
      return tx`SELECT id, d FROM (SELECT e.listing_id::int AS id, (e.embedding <=> ${q}::halfvec)::float8 AS d
        FROM listing_embeddings e JOIN listings l ON l.id = e.listing_id WHERE ${where} AND e.portal = 'cars'
        ORDER BY e.embedding <=> ${q}::halfvec LIMIT 20) s ORDER BY d`;
    })) as unknown as R[];
    ms.push(performance.now() - t);
    const kth = exact[i]!.at(-1)!.d;
    tol.push(got.filter((r) => r.d <= kth + 0.01).length / 20);
    const m = (xs: R[]) => xs.reduce((a, r) => a + r.d, 0) / xs.length;
    ratio.push(m(got) / m(exact[i]!));
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const row = { efSearch: ef, p50Ms: +percentile(ms, 50).toFixed(1), p95Ms: +percentile(ms, 95).toFixed(1), recallAt20Tol001: +mean(tol).toFixed(3), distanceRatio: +mean(ratio).toFixed(4) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
mkdirSync('results/bench', { recursive: true });
writeFileSync('results/bench/ef-sweep.json', JSON.stringify({ scenario: 'cars, price <= EUR 60,000 (380k rows), per-portal HNSW m=16 ef_construction=64, iterative relaxed_order', queries: vectors.length, rows }, null, 1));
await sql.end();
process.exit();
