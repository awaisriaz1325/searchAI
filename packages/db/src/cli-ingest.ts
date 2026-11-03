/**
 * Loads a JSONL listing file into a fresh database.
 *   npm run ingest -- --file data/listings-1k.jsonl --db searchai_1k --real-embeddings
 *   npm run ingest -- --file data/listings-1k.jsonl --db searchai_1k_extracted --facts data/facts-extracted-1k.jsonl
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { PLACES, type GeneratedListing } from '@searchai/datagen';
import { buildVectorIndexes, createSql, ingestListings, migrate, type EmbedderLike } from './index.ts';

const { values } = parseArgs({
  options: {
    file: { type: 'string', default: 'data/listings-1k.jsonl' },
    db: { type: 'string', default: 'searchai_1k' },
    facts: { type: 'string' },
    'real-embeddings': { type: 'boolean', default: false },
  },
});
const ADMIN = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai';
const url = ADMIN.replace(/\/[^/]+$/, `/${values.db}`);

async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  for await (const line of createInterface({ input: createReadStream(path) })) if (line.trim()) yield JSON.parse(line) as T;
}

const admin = postgres(ADMIN, { max: 1, onnotice: () => {} });
await admin.unsafe(`DROP DATABASE IF EXISTS ${values.db} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${values.db}`);
await admin.end();
await migrate(url);
const sql = createSql(url);

let embedder: EmbedderLike | undefined;
if (values['real-embeddings']) {
  const ml = await import('@searchai/ml');
  embedder = await ml.createE5Embedder();
}
const factsOverride = new Map<number, Record<string, unknown>>();
if (values.facts) for await (const r of readJsonl<{ id: number; facts: Record<string, unknown> }>(values.facts)) factsOverride.set(r.id, r.facts);

const res = await ingestListings(sql, readJsonl<GeneratedListing>(values.file!), {
  embedder,
  factsSource: values.facts ? 'extracted' : 'truth',
  factsOverride: values.facts ? (factsOverride as never) : undefined,
});
for (const p of PLACES) await sql`INSERT INTO places VALUES (${p.name}, ${p.lat}, ${p.lon}, ${p.country}) ON CONFLICT DO NOTHING`;
const indexes = embedder ? await buildVectorIndexes(sql, { perPortal: true }) : {};
await sql`VACUUM ANALYZE listings`;
console.log(JSON.stringify({ db: values.db, ...res, embedder: embedder?.model ?? null, indexes }, null, 1));
await sql.end();
