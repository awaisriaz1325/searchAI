/**
 * The nightly search eval: loads the 1k listings with real embeddings, runs the 200 golden
 * queries under each configuration, writes results, and compares against the baseline.
 *   npm run eval                    # all configs, compare to results/baseline.json
 *   npm run eval -- --quick         # truth facts, no rerank
 *   npm run eval -- --write-baseline
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Facts } from '@searchai/core';
import type { GeneratedListing, GoldenQuery } from '@searchai/datagen';
import { buildVectorIndexes, createSql, ingestListings, recreateDatabase } from '@searchai/db';
import { createCrossEncoder, createE5Embedder, createLlmParser, createQwenLlm, MODELS } from '@searchai/ml';
import { DEFAULT_CONFIG, createSearch, loadPrices } from '@searchai/search';
import { compareToBaseline, type EvalSummary } from './compare.ts';
import { runSearchEval, type EvalReport } from './run.ts';

const { values } = parseArgs({
  options: { quick: { type: 'boolean', default: false }, 'write-baseline': { type: 'boolean', default: false } },
});
const ADMIN = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai';
const readJsonl = <T>(p: string) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as T);

const listings = readJsonl<GeneratedListing>('data/listings-1k.jsonl');
const queries = JSON.parse(readFileSync('data/golden-queries.json', 'utf8')) as GoldenQuery[];
const extractedPath = 'data/facts-extracted-1k.jsonl';
const extracted = existsSync(extractedPath) ? readJsonl<{ id: number; facts: Partial<Facts> }>(extractedPath) : [];
const haveExtracted = extracted.length === listings.length;

const embedder = await createE5Embedder();
const prices = await loadPrices();
const llmParser = process.env.LLM_PARSE === '0' ? undefined : createLlmParser(await createQwenLlm(), DEFAULT_CONFIG.llmParseTimeoutMs);
const reranker = values.quick ? undefined : await createCrossEncoder();

async function load(name: string, facts?: Map<number, Partial<Facts>>) {
  const url = await recreateDatabase(ADMIN, name);
  const sql = createSql(url);
  await ingestListings(sql, listings, { embedder, factsSource: facts ? 'extracted' : 'truth', factsOverride: facts });
  await buildVectorIndexes(sql, { perPortal: true });
  await sql`VACUUM ANALYZE listings`;
  return sql;
}

const configs: [string, 'truth' | 'extracted', boolean][] = values.quick
  ? [['truth/rerank-off', 'truth', false]]
  : [
      ['truth/rerank-off', 'truth', false],
      ['truth/rerank-on', 'truth', true],
      ...(haveExtracted ? ([['extracted/rerank-off', 'extracted', false], ['extracted/rerank-on', 'extracted', true]] as const) : []),
    ].map((c) => [...c] as [string, 'truth' | 'extracted', boolean]);

const dbs = { truth: await load('searchai_eval_truth'), extracted: haveExtracted ? await load('searchai_eval_extracted', new Map(extracted.map((r) => [r.id, r.facts]))) : null };

const reports: Record<string, EvalReport> = {};
for (const [name, facts, rerank] of configs) {
  const sql = dbs[facts]!;
  const search = createSearch({ sql, embedder, prices, config: DEFAULT_CONFIG, llmParser, reranker });
  await search({ q: 'warm up', portal: 'cars' });
  reports[name] = await runSearchEval(search, queries, listings, { rerank });
  const o = reports[name].overall;
  console.log(`${name.padEnd(22)} nDCG@10 ${o.ndcg10}  recall@20 ${o.recall20}  MRR ${o.mrr}  abstain ${o.abstainAccuracy}  violations ${o.violations}/${o.violationsTruth}  p95 ${o.p95Ms} ms`);
}
await dbs.truth.end();
await dbs.extracted?.end();

const date = new Date().toISOString().slice(0, 10);
const summary: EvalSummary = {
  configs: Object.fromEntries(Object.entries(reports).map(([k, r]) => [k, { overall: r.overall, perPortal: r.perPortal }])),
};
const meta = {
  date,
  listings: listings.length,
  queries: queries.length,
  models: { embedder: MODELS.embedder, llmParse: llmParser ? MODELS.llm : null, reranker: reranker ? MODELS.reranker : null },
  hardware: '4 vCPU / 15 GB, CPU only (local); GitHub-hosted runner in CI',
  data: 'synthetic, seed 1 (packages/datagen)',
};
mkdirSync('results/nightly', { recursive: true });
writeFileSync(`results/nightly/${date}.json`, JSON.stringify({ ...meta, ...summary, reports }, null, 1));
writeFileSync('results/eval-latest.json', JSON.stringify({ ...meta, configs: Object.fromEntries(Object.entries(reports).map(([k, r]) => [k, { overall: r.overall, perPortal: r.perPortal, perCategory: r.perCategory, perLang: r.perLang }])) }, null, 1));

// Trend table over the last 14 nightly runs.
const runs = readdirSync('results/nightly').filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-14);
const lines = ['# Nightly search eval', '', '| date | config | nDCG@10 | recall@20 | MRR | abstain | violations | p95 ms |', '|---|---|---|---|---|---|---|---|'];
for (const f of runs) {
  const r = JSON.parse(readFileSync(`results/nightly/${f}`, 'utf8')) as { date: string; reports: Record<string, EvalReport> };
  for (const [name, rep] of Object.entries(r.reports)) {
    const o = rep.overall;
    lines.push(`| ${r.date} | ${name} | ${o.ndcg10} | ${o.recall20} | ${o.mrr} | ${o.abstainAccuracy} | ${o.violations} | ${o.p95Ms} |`);
  }
}
writeFileSync('results/nightly/README.md', lines.join('\n') + '\n');

if (values['write-baseline']) {
  writeFileSync('results/baseline.json', JSON.stringify({ ...meta, ...summary }, null, 1));
  console.log('baseline written');
} else if (existsSync('results/baseline.json')) {
  const verdict = compareToBaseline(summary, JSON.parse(readFileSync('results/baseline.json', 'utf8')) as EvalSummary);
  console.log(verdict.ok ? 'baseline: ok' : `baseline: REGRESSION\n${verdict.regressions.join('\n')}`);
  if (!verdict.ok) process.exitCode = 1;
}
process.exit();
