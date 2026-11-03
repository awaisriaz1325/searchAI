/**
 * Loads N synthetic listings (default 2,000,000) for latency and index benchmarks.
 *   npm run bench:load -- --rows 2000000
 * Facts and text come from the same generator as the 1k set (ids 1..1000 are identical to it).
 * Vectors: ids 1..1000 get their real e5 embedding; the rest borrow one (see perturb.ts).
 * Secondary indexes are dropped before COPY and rebuilt after, each timed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createRng, generateListings } from '@searchai/datagen';
import { buildVectorIndexes, createSql, ingestListings, passageText, recreateDatabase } from '@searchai/db';
import { createE5Embedder } from '@searchai/ml';
import { perturbFrom } from './perturb.ts';

const { values } = parseArgs({
  options: {
    rows: { type: 'string', default: '2000000' },
    db: { type: 'string', default: 'searchai_2m' },
    // Resume after a failed vector-index build: keep the loaded rows, rebuild only the HNSW indexes.
    'resume-vector-indexes': { type: 'string' },
  },
});
const resume = values['resume-vector-indexes'] ? JSON.parse(values['resume-vector-indexes']) as { loadSeconds: number; indexes: Record<string, { ms: number; bytes: number }> } : null;
const rows = Number(values.rows);
const ADMIN = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai';
const url = resume ? ADMIN.replace(/\/[^/]+$/, `/${values.db}`) : await recreateDatabase(ADMIN, values.db!);
const sql = createSql(url, { max: 4 });

const embedder = await createE5Embedder();
if (resume) for (const i of ['all', 'cars', 'homes', 'rentals', 'jobs', 'marketplace']) await sql.unsafe(`DROP INDEX IF EXISTS listing_emb_hnsw_${i}`);
const realListings = [...generateListings({ seed: 1, count: 1000 })];
const realVectors = await embedder.embed(realListings.map(passageText), 'passage');
const real = realListings.map((listing, i) => ({ listing, vector: realVectors[i]! }));
const derive = perturbFrom(real, createRng(99));

const secondary = resume ? [] : await sql<{ indexname: string; indexdef: string }[]>`
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'listings' AND indexname NOT LIKE '%_pkey'`;
for (const i of secondary) await sql.unsafe(`DROP INDEX ${i.indexname}`);

const started = performance.now();
const load = resume ? { rows, ms: resume.loadSeconds * 1000 } : await ingestListings(sql, generateListings({ seed: 1, count: rows }), {
  factsSource: 'truth',
  vectorModel: { model: embedder.model, version: `${embedder.version}+derived` },
  vectorsFor: (l) => (l.id <= 1000 ? realVectors[l.id - 1]! : derive(l).vector),
  batch: 5_000,
  onProgress: (n) => {
    if (n % 100_000 === 0) console.log(`  ${n.toLocaleString()} rows, ${((performance.now() - started) / 1000).toFixed(0)} s`);
  },
});

await sql`SET maintenance_work_mem = '4GB'`;
await sql`SET max_parallel_maintenance_workers = 3`;
const indexes: Record<string, { ms: number; bytes: number }> = { ...(resume?.indexes ?? {}) };
for (const i of secondary) {
  const t = performance.now();
  await sql.unsafe(i.indexdef);
  const [s] = await sql`SELECT pg_relation_size(${i.indexname}::regclass)::bigint AS b`;
  indexes[i.indexname] = { ms: Math.round(performance.now() - t), bytes: Number(s!.b) };
  console.log(`  built ${i.indexname} in ${indexes[i.indexname]!.ms} ms`);
}
const perPortal = await buildVectorIndexes(sql, { perPortal: true });
console.log('  built per-portal HNSW', JSON.stringify(perPortal));
const global = await buildVectorIndexes(sql, { perPortal: false });
console.log('  built global HNSW', JSON.stringify(global));
await sql`VACUUM ANALYZE listings`;
await sql`VACUUM ANALYZE listing_embeddings`;
const [sizes] = await sql`SELECT pg_total_relation_size('listings')::bigint AS listings, pg_total_relation_size('listing_embeddings')::bigint AS embeddings, (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector, version() AS postgres`;

const report = {
  rows: load.rows,
  loadSeconds: Math.round(load.ms / 1000),
  indexes: { ...indexes, ...Object.fromEntries(Object.entries(perPortal).map(([k, v]) => [`hnsw_${k}`, v])), hnsw_global: global.all },
  totalBytes: { listings: Number(sizes!.listings), embeddings: Number(sizes!.embeddings) },
  pgvector: sizes!.pgvector,
  postgres: String(sizes!.postgres).split(' on ')[0],
  hardware: '4 vCPU / 15 GB, Docker pgvector/pgvector:0.8.0-pg17, shared_buffers 2GB',
  vectors: 'ids 1-1000 real multilingual-e5-small embeddings; others derived (perturb.ts, noise 0.35)',
};
mkdirSync('results/bench', { recursive: true });
writeFileSync('results/bench/load.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await sql.end();
process.exit();
