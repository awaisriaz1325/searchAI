/**
 * Filtered vector search at 2M rows: which strategy returns the right top 20, how fast.
 *   npm run bench:strategies
 * Ground truth for every cell is prefilter_exact (exact distance over every row passing the filters).
 * Query vectors are real e5 embeddings of the golden query texts for the scenario's portal.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { HardFilters } from '@searchai/core';
import type { GoldenQuery } from '@searchai/datagen';
import { createSql, vectorLiteral, type Sql, type Tx } from '@searchai/db';
import { createE5Embedder } from '@searchai/ml';
import { filtersToSql, parseQuery } from '@searchai/search';
import { percentile } from '../../packages/eval/src/metrics.ts';
import { redactVectors } from './redact.ts';

const sql: Sql = createSql(process.env.BENCH_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai_2m', { max: 2 });
const K = 20;
const REPEAT = Number(process.env.BENCH_QUERIES ?? 40);

const SCENARIOS: { name: string; text: string; filters: HardFilters }[] = [
  { name: 'selective', text: 'diesel van under €25,000 near Hamburg, under 100,000 km', filters: parseQuery('diesel van under €25,000 near Hamburg, under 100,000 km', { portal: 'cars' }).filters },
  { name: 'medium', text: 'cars: diesel under €25,000', filters: { portal: 'cars', priceMaxMinor: 2_500_000, facts: { fuel: { eq: 'diesel' } } } },
  { name: 'broad', text: 'cars: under €60,000', filters: { portal: 'cars', priceMaxMinor: 6_000_000, facts: {} } },
  { name: 'homes', text: 'homes: under €400,000', filters: { portal: 'homes', priceMaxMinor: 40_000_000, facts: {} } },
];

type Q = (tx: Tx, f: HardFilters, q: string, portal: string, pre: ReturnType<Tx['unsafe']>) => ReturnType<Tx>;
type Strategy = { name: string; settings: string[]; sql: Q };
const STRATEGIES: Strategy[] = [
  {
    name: 'prefilter_exact',
    settings: [],
    sql: (tx, f, q, _p, pre) => tx`${pre} WITH c AS MATERIALIZED (SELECT l.id FROM listings l WHERE ${filtersToSql(tx, f)})
      SELECT e.listing_id::int AS id FROM listing_embeddings e JOIN c ON c.id = e.listing_id
      ORDER BY e.embedding <=> ${q}::halfvec LIMIT ${K}`,
  },
  {
    name: 'global_hnsw_postfilter(ef=40)',
    settings: ['SET LOCAL hnsw.ef_search = 40', 'SET LOCAL hnsw.iterative_scan = off'],
    sql: (tx, f, q, _p, pre) => tx`${pre} SELECT nn.id FROM (
        SELECT e.listing_id::int AS id, e.embedding <=> ${q}::halfvec AS d FROM listing_embeddings e
        ORDER BY e.embedding <=> ${q}::halfvec LIMIT 40) nn
      JOIN listings l ON l.id = nn.id WHERE ${filtersToSql(tx, f)} ORDER BY d LIMIT ${K}`,
  },
  {
    name: 'planner_default(ef=40)',
    settings: ['SET LOCAL hnsw.ef_search = 40', 'SET LOCAL hnsw.iterative_scan = off'],
    sql: (tx, f, q, portal, pre) => tx`${pre} SELECT e.listing_id::int AS id FROM listing_embeddings e JOIN listings l ON l.id = e.listing_id
      WHERE ${filtersToSql(tx, f)} AND e.portal = ${portal} ORDER BY e.embedding <=> ${q}::halfvec LIMIT ${K}`,
  },
  {
    name: 'portal_hnsw_iterative(ef=100)',
    settings: ['SET LOCAL hnsw.ef_search = 100', 'SET LOCAL hnsw.iterative_scan = relaxed_order', 'SET LOCAL hnsw.max_scan_tuples = 20000'],
    sql: (tx, f, q, portal, pre) => tx`${pre} SELECT id FROM (SELECT e.listing_id::int AS id, e.embedding <=> ${q}::halfvec AS d
      FROM listing_embeddings e JOIN listings l ON l.id = e.listing_id
      WHERE ${filtersToSql(tx, f)} AND e.portal = ${portal} ORDER BY e.embedding <=> ${q}::halfvec LIMIT ${K}) s ORDER BY d`,
  },
  {
    name: 'global_hnsw_iterative(ef=100)',
    settings: ['SET LOCAL hnsw.ef_search = 100', 'SET LOCAL hnsw.iterative_scan = relaxed_order', 'SET LOCAL hnsw.max_scan_tuples = 20000'],
    sql: (tx, f, q, _p, pre) => tx`${pre} SELECT id FROM (SELECT e.listing_id::int AS id, e.embedding <=> ${q}::halfvec AS d
      FROM listing_embeddings e JOIN listings l ON l.id = e.listing_id
      WHERE ${filtersToSql(tx, f)} ORDER BY e.embedding <=> ${q}::halfvec LIMIT ${K}) s ORDER BY d`,
  },
];

async function run(s: Strategy, f: HardFilters, q: string, portal: string, explain = false) {
  return sql.begin(async (tx) => {
    for (const st of s.settings) await tx.unsafe(st);
    const pre = tx.unsafe(explain ? 'EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)' : '');
    return (await s.sql(tx, f, q, portal, pre)) as unknown as { id?: number; 'QUERY PLAN'?: string }[];
  }) as Promise<{ id?: number; 'QUERY PLAN'?: string }[]>;
}

const embedder = await createE5Embedder();
const golden = JSON.parse(readFileSync('data/golden-queries.json', 'utf8')) as GoldenQuery[];
const report: Record<string, unknown> = {};
const md = ['| scenario | matching rows | strategy | p50 ms | p95 ms | rows returned | recall@20 |', '|---|---|---|---|---|---|---|'];

for (const sc of SCENARIOS) {
  const portal = sc.filters.portal!;
  const texts = golden.filter((g) => g.portal === portal).map((g) => g.text).slice(0, REPEAT);
  const vectors = (await embedder.embed(texts, 'query')).map((v) => vectorLiteral(v));
  const [m] = await sql`SELECT count(*)::int AS n FROM listings l WHERE ${filtersToSql(sql, sc.filters)}`;
  const matching = m!.n as number;
  const truth: Set<number>[] = [];
  const cells: Record<string, unknown> = {};
  for (const s of STRATEGIES) {
    await run(s, sc.filters, vectors[0]!, portal); // warm
    const ms: number[] = [];
    const returned: number[] = [];
    const recall: number[] = [];
    for (const [i, q] of vectors.entries()) {
      const t = performance.now();
      const ids = (await run(s, sc.filters, q, portal)).map((r) => r.id!);
      ms.push(performance.now() - t);
      returned.push(ids.length);
      if (s.name === 'prefilter_exact') truth[i] = new Set(ids);
      const want = truth[i]!;
      recall.push(want.size ? ids.filter((id) => want.has(id)).length / want.size : 1);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const cell = { p50Ms: +percentile(ms, 50).toFixed(1), p95Ms: +percentile(ms, 95).toFixed(1), rowsReturned: +mean(returned).toFixed(1), recallAt20: +mean(recall).toFixed(3) };
    cells[s.name] = cell;
    md.push(`| ${sc.name} | ${matching.toLocaleString('en')} | ${s.name} | ${cell.p50Ms} | ${cell.p95Ms} | ${cell.rowsReturned} | ${cell.recallAt20} |`);
    console.log(`${sc.name.padEnd(10)} ${s.name.padEnd(32)} p50 ${cell.p50Ms} ms  p95 ${cell.p95Ms} ms  rows ${cell.rowsReturned}  recall@20 ${cell.recallAt20}`);
  }
  const plans: Record<string, string[]> = {};
  for (const s of STRATEGIES.filter((x) => x.name.startsWith('planner') || x.name.startsWith('portal_hnsw')))
    plans[s.name] = (await run(s, sc.filters, vectors[0]!, portal, true)).map((r) => redactVectors(r['QUERY PLAN']!));
  report[sc.name] = { text: sc.text, filters: sc.filters, matchingRows: matching, queries: vectors.length, strategies: cells, explain: plans };
}

const [meta] = await sql`SELECT count(*)::int AS rows, (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector FROM listings`;
mkdirSync('results/bench', { recursive: true });
writeFileSync('results/bench/strategies.json', JSON.stringify({ rows: meta!.rows, pgvector: meta!.pgvector, hardware: '4 vCPU / 15 GB, warm cache', scenarios: report }, null, 1));
writeFileSync('results/bench/strategies.md', `# Filtered vector search, ${Number(meta!.rows).toLocaleString('en')} listings\n\n${md.join('\n')}\n`);
await sql.end();
process.exit();
