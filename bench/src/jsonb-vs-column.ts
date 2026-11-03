/**
 * One hot filter two ways at 2M rows: facts jsonb + partial expression index (what the app
 * uses) vs promoted typed columns + B-tree. Same rows, same filter, both answered from an index.
 *   npm run bench:jsonb
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSql } from '@searchai/db';
import { percentile } from '../../packages/eval/src/metrics.ts';
import { redactVectors } from './redact.ts';

const sql = createSql(process.env.BENCH_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai_2m', { max: 1 });
const N = 50;

const t0 = performance.now();
await sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS fuel_col text GENERATED ALWAYS AS (facts->>'fuel') STORED`;
await sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS mileage_col int GENERATED ALWAYS AS ((facts->>'mileage_km')::int) STORED`;
const addColumnsMs = performance.now() - t0;
const t1 = performance.now();
await sql`CREATE INDEX IF NOT EXISTS listings_cars_typed ON listings (fuel_col, mileage_col) WHERE portal = 'cars'`;
const typedIndexMs = performance.now() - t1;
await sql`ANALYZE listings`;

const queries = {
  jsonb_expression_index: (km: number) =>
    sql`SELECT count(*)::int AS n FROM listings WHERE portal = 'cars' AND facts->>'fuel' = 'diesel' AND (facts->>'mileage_km')::int <= ${km}`,
  typed_column_index: (km: number) =>
    sql`SELECT count(*)::int AS n FROM listings WHERE portal = 'cars' AND fuel_col = 'diesel' AND mileage_col <= ${km}`,
};
const out: Record<string, unknown> = {};
for (const [name, q] of Object.entries(queries)) {
  await q(100_000);
  const ms: number[] = [];
  let n = 0;
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    [{ n }] = (await q(50_000 + i * 2_000)) as unknown as [{ n: number }];
    ms.push(performance.now() - t);
  }
  const plan = (await sql.unsafe(
    name === 'typed_column_index'
      ? `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT count(*) FROM listings WHERE portal = 'cars' AND fuel_col = 'diesel' AND mileage_col <= 100000`
      : `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT count(*) FROM listings WHERE portal = 'cars' AND facts->>'fuel' = 'diesel' AND (facts->>'mileage_km')::int <= 100000`,
  )).map((r) => redactVectors(r['QUERY PLAN'] as string));
  out[name] = { p50Ms: +percentile(ms, 50).toFixed(2), p95Ms: +percentile(ms, 95).toFixed(2), lastCount: n, explain: plan };
  console.log(name, out[name]);
}
const [sizes] = await sql`SELECT pg_relation_size('listings_cars_hot')::bigint AS jsonb, pg_relation_size('listings_cars_typed')::bigint AS typed`;
const report = {
  ...out,
  indexBytes: { jsonb_expression_index: Number(sizes!.jsonb), typed_column_index: Number(sizes!.typed) },
  migrationCost: { addGeneratedColumnsMs: Math.round(addColumnsMs), buildTypedIndexMs: Math.round(typedIndexMs) },
};
mkdirSync('results/bench', { recursive: true });
writeFileSync('results/bench/jsonb-vs-column.json', JSON.stringify(report, null, 1));
// Leave the table as the app expects it.
await sql`DROP INDEX IF EXISTS listings_cars_typed`;
await sql`ALTER TABLE listings DROP COLUMN IF EXISTS fuel_col, DROP COLUMN IF EXISTS mileage_col`;
await sql.end();
process.exit();
