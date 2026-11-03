import { FTS_CONFIG, type HardFilters, type Lang } from '@searchai/core';
import { vectorLiteral, type Tx } from '@searchai/db';
import type { SearchConfig } from './config.ts';
import { filtersToSql } from './filters-sql.ts';
import type { Plan } from './planner.ts';
import type { Hit } from './types.ts';

/** Nearest listings by cosine distance, under the hard filters. */
export async function vectorLeg(tx: Tx, f: HardFilters, qvec: Float32Array, plan: Plan, k: number, cfg: SearchConfig): Promise<Hit[]> {
  const q = vectorLiteral(qvec);
  const where = filtersToSql(tx, f);
  if (plan.kind === 'exact') {
    return tx`
      WITH c AS MATERIALIZED (SELECT l.id FROM listings l WHERE ${where})
      SELECT e.listing_id::int AS id, (e.embedding <=> ${q}::halfvec)::float8 AS score
      FROM listing_embeddings e JOIN c ON c.id = e.listing_id
      ORDER BY score LIMIT ${k}` as unknown as Promise<Hit[]>;
  }
  // Iterative scan keeps walking the graph until enough rows pass the filters (pgvector 0.8).
  await tx.unsafe(`SET LOCAL hnsw.ef_search = ${Math.trunc(cfg.efSearch)}`);
  await tx.unsafe(`SET LOCAL hnsw.iterative_scan = relaxed_order`);
  await tx.unsafe(`SET LOCAL hnsw.max_scan_tuples = ${Math.trunc(cfg.maxScanTuples)}`);
  const portal = f.portal ? tx`AND e.portal = ${f.portal}` : tx``;
  return tx`
    SELECT * FROM (
      SELECT e.listing_id::int AS id, (e.embedding <=> ${q}::halfvec)::float8 AS score
      FROM listing_embeddings e JOIN listings l ON l.id = e.listing_id
      WHERE ${where} ${portal}
      ORDER BY e.embedding <=> ${q}::halfvec LIMIT ${k}
    ) s ORDER BY score` as unknown as Promise<Hit[]>;
}

/** Words only: whatever the user typed, nothing reaches to_tsquery but letters and digits. */
export function tsTerms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !/^\d+$/.test(t)))].slice(0, 20);
}

/** Full-text in the query's language and in `simple`, OR-ed; trigram on titles when FTS finds little. */
export async function keywordLeg(tx: Tx, f: HardFilters, text: string, lang: Lang, k: number): Promise<Hit[]> {
  const terms = tsTerms(text);
  if (!terms.length) return [];
  const expr = terms.join(' | ');
  const where = filtersToSql(tx, f);
  const fts = (await tx`
    SELECT l.id::int AS id, ts_rank_cd(l.fts, q)::float8 AS score
    FROM listings l, (SELECT to_tsquery(${FTS_CONFIG[lang]}::regconfig, ${expr}) || to_tsquery('simple', ${expr}) AS q) qq
    WHERE ${where} AND l.fts @@ q
    ORDER BY score DESC LIMIT ${k}`) as unknown as Hit[];
  if (fts.length >= 5) return fts;
  const seen = new Set(fts.map((h) => h.id));
  const trgm = (await tx`
    SELECT l.id::int AS id, similarity(l.title, ${text})::float8 AS score
    FROM listings l WHERE ${where} AND l.title % ${text}
    ORDER BY score DESC LIMIT ${k}`) as unknown as Hit[];
  return [...fts, ...trgm.filter((h) => !seen.has(h.id))];
}
