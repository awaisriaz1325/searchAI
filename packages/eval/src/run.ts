import { matchesFilters } from '@searchai/core';
import { relevance, type GeneratedListing, type GoldenQuery } from '@searchai/datagen';
import { filtersEqual, type SearchFn } from '@searchai/search';
import type { ConfigSummary, Headline } from './compare.ts';
import { mean, mrr, ndcgAt, percentile, recallAt } from './metrics.ts';

export interface QueryResult {
  id: string;
  portal: string;
  category: string;
  lang: string;
  text: string;
  answerable: boolean;
  ndcg10: number;
  recall20: number;
  mrr: number;
  zeroResult: boolean;
  /** Impossible queries: true when nothing came back. */
  abstained: boolean;
  violationsUsed: number;
  violationsTruth: number;
  parseExact: boolean;
  llmParseUsed: boolean;
  ms: number;
  usdPer1k: number;
  top: number[];
}

export interface GroupStats extends Headline {
  n: number;
  mrr: number;
  zeroResultRate: number;
  abstainAccuracy: number | null;
  violationsTruth: number;
  parseExact: number;
  p50Ms: number;
  p95Ms: number;
  usdPer1k: number;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function aggregate(rows: QueryResult[]): GroupStats {
  const ans = rows.filter((r) => r.answerable);
  const imp = rows.filter((r) => !r.answerable);
  const ms = rows.map((r) => r.ms);
  return {
    n: rows.length,
    ndcg10: r3(mean(ans.map((r) => r.ndcg10))),
    recall20: r3(mean(ans.map((r) => r.recall20))),
    mrr: r3(mean(ans.map((r) => r.mrr))),
    zeroResultRate: r3(mean(ans.map((r) => (r.zeroResult ? 1 : 0)))),
    abstainAccuracy: imp.length ? r3(mean(imp.map((r) => (r.abstained ? 1 : 0)))) : null,
    violations: rows.reduce((s, r) => s + r.violationsUsed, 0),
    violationsTruth: rows.reduce((s, r) => s + r.violationsTruth, 0),
    parseExact: r3(mean(rows.map((r) => (r.parseExact ? 1 : 0)))),
    p50Ms: Math.round(percentile(ms, 50)),
    p95Ms: Math.round(percentile(ms, 95)),
    usdPer1k: +mean(rows.map((r) => r.usdPer1k)).toFixed(5),
  };
}

const groupBy = <T>(xs: T[], key: (x: T) => string) =>
  xs.reduce<Record<string, T[]>>((acc, x) => ((acc[key(x)] ??= []).push(x), acc), {});

export interface EvalReport extends ConfigSummary {
  overall: GroupStats;
  perPortal: Record<string, GroupStats>;
  perCategory: Record<string, GroupStats>;
  perLang: Record<string, GroupStats>;
  queries: QueryResult[];
}

/**
 * Runs every golden query through `search` and scores it against graded labels computed from
 * the generator's TRUE facts, whatever facts the database being searched holds.
 */
export async function runSearchEval(
  search: SearchFn,
  queries: GoldenQuery[],
  listings: GeneratedListing[],
  opts: { rerank: boolean },
): Promise<EvalReport> {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const rows: QueryResult[] = [];
  for (const q of queries) {
    const t = performance.now();
    const res = await search({ q: q.text, portal: q.portal ?? undefined, limit: 20, rerank: opts.rerank });
    const ms = performance.now() - t;
    const ids = res.results.map((r) => r.id);
    const rel = new Map(listings.map((l) => [l.id, relevance(q, l)]));
    const relevant = new Set([...rel].filter(([, r]) => r > 0).map(([id]) => id));
    const answerable = q.category !== 'impossible';
    rows.push({
      id: q.id,
      portal: q.portal ?? 'any',
      category: q.category,
      lang: q.lang,
      text: q.text,
      answerable,
      ndcg10: ndcgAt(10, ids.map((id) => rel.get(id) ?? 0), [...rel.values()]),
      recall20: recallAt(20, ids, relevant),
      mrr: mrr(ids, relevant),
      zeroResult: ids.length === 0,
      abstained: ids.length === 0,
      violationsUsed: res.violations,
      violationsTruth: ids.filter((id) => !matchesFilters(res.appliedFilters, byId.get(id)!)).length,
      parseExact: filtersEqual(res.appliedFilters, q.filters),
      llmParseUsed: 'llmParse' in res.stageMs,
      ms,
      usdPer1k: res.cost.usdPer1k.total,
      top: ids.slice(0, 10),
    });
  }
  const agg = (g: Record<string, QueryResult[]>) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, aggregate(v)]));
  return {
    overall: aggregate(rows),
    perPortal: agg(groupBy(rows, (r) => r.portal)),
    perCategory: agg(groupBy(rows, (r) => r.category)),
    perLang: agg(groupBy(rows, (r) => r.lang)),
    queries: rows,
  };
}
