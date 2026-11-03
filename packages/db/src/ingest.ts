import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PORTALS, type Facts } from '@searchai/core';
import type { GeneratedListing } from '@searchai/datagen';
import type { Sql } from './client.ts';

/** The slice of an embedder that ingest needs (the real one lives in @searchai/ml). */
export interface EmbedderLike {
  model: string;
  version: string;
  dim: number;
  embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]>;
}

export interface IngestOptions {
  embedder?: EmbedderLike;
  /** Vector source when there is no embedder (the 2M benchmark derives vectors). */
  vectorsFor?: (l: GeneratedListing) => Float32Array;
  vectorModel?: { model: string; version: string };
  factsSource: 'truth' | 'extracted';
  factsOverride?: Map<number, Partial<Facts>>;
  batch?: number;
  onProgress?: (rows: number) => void;
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
export const vectorLiteral = (v: ArrayLike<number>) => `[${Array.from(v, (x) => +x.toFixed(5)).join(',')}]`;
export const passageText = (l: { title: string; description: string }) => `${l.title}\n${l.description}`;

async function copy(sql: Sql, statement: string, lines: string[]) {
  const writable = await sql.unsafe(statement).writable();
  await pipeline(Readable.from(lines), writable);
}

/** Bulk-loads listings and their embeddings with COPY, `batch` rows at a time. */
export async function ingestListings(
  sql: Sql,
  listings: Iterable<GeneratedListing> | AsyncIterable<GeneratedListing>,
  opts: IngestOptions,
): Promise<{ rows: number; ms: number }> {
  const started = performance.now();
  const size = opts.batch ?? 1_000;
  const model = opts.embedder ?? opts.vectorModel;
  let rows = 0;
  let pending: GeneratedListing[] = [];

  const flush = async () => {
    if (!pending.length) return;
    const facts = (l: GeneratedListing) => opts.factsOverride?.get(l.id) ?? l.facts;
    await copy(
      sql,
      'COPY listings (id, portal, owner_id, status, title, description, lang, price_minor, lat, lon, facts, facts_source) FROM STDIN',
      pending.map(
        (l) =>
          [l.id, l.portal, l.ownerId, l.status, esc(l.title), esc(l.description), l.lang, l.priceMinor, l.lat, l.lon, esc(JSON.stringify(facts(l))), opts.factsSource].join('\t') + '\n',
      ),
    );
    if (model) {
      const vectors = opts.embedder
        ? await opts.embedder.embed(pending.map(passageText), 'passage')
        : pending.map((l) => opts.vectorsFor!(l));
      await copy(
        sql,
        'COPY listing_embeddings (listing_id, portal, model, model_version, embedding) FROM STDIN',
        pending.map((l, i) => [l.id, l.portal, model.model, model.version, vectorLiteral(vectors[i]!)].join('\t') + '\n'),
      );
    }
    rows += pending.length;
    opts.onProgress?.(rows);
    pending = [];
  };

  for await (const l of listings) {
    pending.push(l);
    if (pending.length >= size) await flush();
  }
  await flush();
  return { rows, ms: Math.round(performance.now() - started) };
}

/** HNSW over cosine distance: one partial index per portal, or one global index. */
export async function buildVectorIndexes(
  sql: Sql,
  opts: { perPortal: boolean; m?: number; efConstruction?: number },
): Promise<Record<string, { ms: number; bytes: number }>> {
  const m = opts.m ?? 16;
  const ef = opts.efConstruction ?? 64;
  const targets = opts.perPortal ? PORTALS.map((p) => [p, `WHERE portal = '${p}'`] as const) : ([['all', '']] as const);
  const out: Record<string, { ms: number; bytes: number }> = {};
  for (const [name, where] of targets) {
    const index = `listing_emb_hnsw_${name}`;
    const t = performance.now();
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS ${index} ON listing_embeddings USING hnsw (embedding halfvec_cosine_ops) WITH (m = ${m}, ef_construction = ${ef}) ${where}`,
    );
    const [size] = await sql`SELECT pg_relation_size(${index}::regclass)::bigint AS bytes`;
    out[name] = { ms: Math.round(performance.now() - t), bytes: Number(size!.bytes) };
  }
  await sql`ANALYZE listing_embeddings`;
  return out;
}

/** Re-embeds every row whose vector came from a different model or version. Returns the count. */
export async function reembedStale(sql: Sql, embedder: EmbedderLike, batch = 256): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await sql<{ id: number; title: string; description: string }[]>`
      SELECT l.id::int AS id, l.title, l.description
      FROM listing_embeddings e JOIN listings l ON l.id = e.listing_id
      WHERE e.model <> ${embedder.model} OR e.model_version <> ${embedder.version}
      LIMIT ${batch}`;
    if (!rows.length) return total;
    const vectors = await embedder.embed(rows.map(passageText), 'passage');
    await sql.begin(async (tx) => {
      for (let i = 0; i < rows.length; i++)
        await tx`UPDATE listing_embeddings SET embedding = ${vectorLiteral(vectors[i]!)}::halfvec,
          model = ${embedder.model}, model_version = ${embedder.version}, embedded_at = now()
          WHERE listing_id = ${rows[i]!.id}`;
    });
    total += rows.length;
  }
}
