import type { HardFilters, Portal } from '@searchai/core';
import { asRole, type Sql } from '@searchai/db';
import { TTL, cacheKey, normalizeQuery } from './cache.ts';
import type { SearchConfig } from './config.ts';
import { CostMeter, approxTokens, type CostReport, type Prices } from './cost.ts';
import { rrf } from './fusion.ts';
import { keywordLeg, vectorLeg } from './legs.ts';
import { parseQuery, type ParsedQuery } from './parse/parse.ts';
import { planSearch, type Plan } from './planner.ts';
import { postCheck } from './postcheck.ts';
import type { Hit, ListingRow } from './types.ts';

export interface EmbedderPort {
  model: string;
  embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]>;
}
export interface RerankerPort {
  model: string;
  score(query: string, docs: string[]): Promise<number[]>;
}
export type LlmParserPort = (
  text: string,
  parsed: ParsedQuery,
) => Promise<{ filters: HardFilters; timedOut: boolean; ms: number; tokensIn: number; tokensOut: number }>;
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
}

export interface SearchRequest {
  q: string;
  portal?: Portal;
  limit?: number;
  rerank?: boolean;
}

export interface SearchResponse {
  results: ListingRow[];
  appliedFilters: HardFilters;
  parsed: ParsedQuery;
  plan: Plan | null;
  stageMs: Record<string, number>;
  cost: CostReport;
  degraded: string[];
  violations: number;
  cache: 'hit' | 'miss' | 'off';
  reason?: 'no_match_for_filters' | 'empty_query';
}

export interface SearchDeps {
  sql: Sql;
  embedder: EmbedderPort;
  prices: Prices;
  config: SearchConfig;
  llmParser?: LlmParserPort;
  reranker?: RerankerPort;
  cache?: CachePort;
  /** Called with every response, for metrics. */
  onResponse?: (r: SearchResponse) => void;
}

export type SearchFn = (req: SearchRequest) => Promise<SearchResponse>;

/** Fields the parser left empty are filled from the LLM; the parser always wins a conflict. */
export function mergeFilters(base: HardFilters, extra: HardFilters): HardFilters {
  return {
    ...extra,
    ...base,
    priceMaxMinor: base.priceMaxMinor ?? extra.priceMaxMinor,
    priceMinMinor: base.priceMinMinor ?? extra.priceMinMinor,
    geo: base.geo ?? extra.geo,
    facts: { ...extra.facts, ...base.facts },
  };
}

const ROW_COLUMNS = 'id, portal, title, description, lang, price_minor, lat, lon, facts';

export function createSearch(deps: SearchDeps): SearchFn {
  const { sql, embedder, config } = deps;

  return async (req) => {
    const meter = new CostMeter();
    const degraded: string[] = [];
    const limit = Math.min(Math.max(1, req.limit ?? config.defaultLimit), 50);
    const finish = (r: Omit<SearchResponse, 'stageMs' | 'cost' | 'degraded'>): SearchResponse => {
      const res = { ...r, stageMs: meter.stageMs, cost: meter.report(deps.prices), degraded };
      deps.onResponse?.(res);
      return res;
    };

    const parsed = await meter.time('parse', () => parseQuery(req.q, { portal: req.portal }));
    if (!req.q.trim()) {
      return finish({ results: [], appliedFilters: parsed.filters, parsed, plan: null, violations: 0, cache: 'off', reason: 'empty_query' });
    }

    const norm = normalizeQuery(req.q);
    const cache = deps.cache;
    const safeCache = {
      get: async <T,>(key: string): Promise<T | null> => {
        if (!cache) return null;
        try {
          return await cache.get<T>(key);
        } catch {
          degraded.push('cache_error');
          return null;
        }
      },
      set: async (key: string, value: unknown, ttl: number) => {
        if (!cache) return;
        try {
          await cache.set(key, value, ttl);
        } catch {
          degraded.push('cache_error');
        }
      },
    };
    const resultKey = cacheKey({ kind: 'result', norm, role: 'anon', portal: req.portal, limit, rerank: req.rerank !== false });
    const cached = await meter.time('cache', () => safeCache.get<SearchResponse>(resultKey));
    if (cached) return finish({ ...cached, cache: 'hit' });

    // Embedding and the (rare) LLM parse run while nothing else waits on them.
    const embedKey = cacheKey({ kind: 'embed', norm, role: 'anon' });
    const embedding = (async () => {
      const hit = await safeCache.get<number[]>(embedKey);
      if (hit) return [Float32Array.from(hit)];
      const v = await meter.time('embed', () => embedder.embed([req.q], 'query'), () => ({ embedTokens: approxTokens(req.q), modelCalls: 1 }));
      await safeCache.set(embedKey, Array.from(v[0]!), TTL.embed);
      return v;
    })();
    let filters = parsed.filters;
    if (deps.llmParser && parsed.confidence < 1 && parsed.unparsed.length > 0) {
      const llm = await deps.llmParser(req.q, parsed);
      meter.add('llmParse', llm.ms, { llmIn: llm.tokensIn, llmOut: llm.tokensOut, modelCalls: 1 });
      if (llm.timedOut) degraded.push('llm_parse_timeout');
      else filters = mergeFilters(filters, llm.filters);
    }
    if (req.portal) filters = { ...filters, portal: req.portal };

    const plan = await meter.time('plan', () => asRole(sql, 'anon', null, (tx) => planSearch(tx, filters, config.exactThreshold)));
    if (plan.estimatedRows === 0) {
      await embedding.catch(() => undefined);
      return finish({ results: [], appliedFilters: filters, parsed, plan, violations: 0, cache: cache ? 'miss' : 'off', reason: 'no_match_for_filters' });
    }

    const [qvec] = await embedding;
    const k = config.candidateK;
    const [vector, keyword] = await Promise.all([
      meter.time('vector', () => asRole(sql, 'anon', null, (tx) => vectorLeg(tx, filters, qvec!, plan, k, config))),
      meter.time('keyword', () => asRole(sql, 'anon', null, (tx) => keywordLeg(tx, filters, req.q, parsed.lang, k))),
    ]);
    const fused: Hit[] = await meter.time('fuse', () => rrf([vector, keyword], config.rrfK));

    const wantRerank = deps.reranker && req.rerank !== false && parsed.semantic.trim().length > 0;
    const loadIds = fused.slice(0, wantRerank ? Math.max(limit, config.rerankTop) : limit).map((h) => h.id);
    let rows = await meter.time('load', () =>
      asRole(sql, 'anon', null, async (tx) => {
        const r = await tx.unsafe(`SELECT ${ROW_COLUMNS} FROM listings WHERE id = ANY($1::bigint[])`, [loadIds]);
        return r.map((x) => ({ ...x, id: Number(x.id), priceMinor: Number(x.price_minor) }) as unknown as ListingRow);
      }),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    rows = loadIds.map((id) => byId.get(id)).filter((r): r is ListingRow => !!r);

    if (wantRerank && rows.length > 1) {
      const docs = rows.map((r) => `${r.title}\n${r.description}`);
      try {
        const scores = await meter.time('rerank', () => deps.reranker!.score(req.q, docs), () => ({
          rerankTokens: docs.reduce((s, d) => s + approxTokens(d) + approxTokens(req.q), 0),
          modelCalls: 1,
        }));
        rows = rows.map((r, i) => ({ ...r, score: scores[i] })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      } catch {
        degraded.push('rerank_error');
      }
    }
    const { kept, violations } = await meter.time('postcheck', () => postCheck(rows.slice(0, limit), filters));
    const response = finish({ results: kept, appliedFilters: filters, parsed, plan, violations, cache: cache ? 'miss' : 'off' });
    if (!degraded.length) await safeCache.set(resultKey, response, TTL.result);
    return response;
  };
}
