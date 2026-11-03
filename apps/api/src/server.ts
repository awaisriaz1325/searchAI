/**
 * Environment:
 *   DATABASE_URL  postgres://postgres:postgres@localhost:5433/searchai_1k
 *   REDIS_URL     redis://localhost:6380 (unset: in-memory cache)
 *   EMBEDDER      e5 (default) | hash
 *   LLM_PARSE=1   enable the local LLM query-parse fallback
 *   RERANK=1      enable the local cross-encoder
 *   PORT          8787
 */
import { serve } from '@hono/node-server';
import { createSql } from '@searchai/db';
import * as ml from '@searchai/ml';
import { DEFAULT_CONFIG, createMemoryCache, createRedisCache, createSearch, loadPrices, type SearchDeps } from '@searchai/search';
import { Metrics, buildApp } from './app.ts';

const env = process.env;
const sql = createSql(env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai_1k', { max: 40 });
const metrics = new Metrics();
const deps: SearchDeps = {
  sql,
  embedder: env.EMBEDDER === 'hash' ? ml.createHashEmbedder() : await ml.createE5Embedder(),
  prices: await loadPrices(),
  config: DEFAULT_CONFIG,
  cache: env.REDIS_URL ? createRedisCache(env.REDIS_URL) : createMemoryCache(),
  onResponse: (r) => metrics.record(r),
};
if (env.LLM_PARSE === '1') deps.llmParser = ml.createLlmParser(await ml.createQwenLlm(), DEFAULT_CONFIG.llmParseTimeoutMs);

const app = buildApp({ search: createSearch(deps), metrics, sql });
const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`searchAI API on :${port} (embedder ${deps.embedder.model}, llmParse ${!!deps.llmParser}, rerank ${!!deps.reranker})`);
