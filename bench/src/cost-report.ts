/**
 * Cost per search, from measured runs (no new measurements):
 *   npm run cost
 * Reads results/nightly/<latest>.json (per-query model usage and $ estimate) and
 * results/bench/loadtest.json (cache effect under load), writes results/cost.md.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { EvalReport } from '../../packages/eval/src/run.ts';

const prices = JSON.parse(readFileSync('config/prices.json', 'utf8'));
const latest = readdirSync('results/nightly').filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1)!;
const nightly = JSON.parse(readFileSync(`results/nightly/${latest}`, 'utf8')) as { reports: Record<string, EvalReport> };
const load = JSON.parse(readFileSync('results/bench/loadtest.json', 'utf8')) as { report: Record<string, { concurrency: number; p95Ms: number; rps: number }[]> };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lines = [
  '# Cost per search',
  '',
  `Prices: \`config/prices.json\`, priced ${prices.priced_at}. Embedding and rerank at Voyage list price ($${prices.embed_usd_per_1m_tokens.value}/1M tokens);`,
  `LLM at qwen-flash list price ($${prices.llm_usd_per_1m_input.value} in / $${prices.llm_usd_per_1m_output.value} out per 1M tokens, third-party source, unverified);`,
  `database time at an assumed $${prices.db_usd_per_vcpu_hour.value} per vCPU-hour. Everything here actually ran on local CPU models for $0;`,
  'these are estimates of what the same calls would cost on hosted APIs. Token counts are approximate (characters / 4).',
  '',
  '| config | queries | LLM parse used | est. $ per 1,000 searches |',
  '|---|---|---|---|',
];
for (const [name, rep] of Object.entries(nightly.reports)) {
  const q = rep.queries;
  const llmShare = q.filter((r) => r.llmParseUsed).length / q.length;
  lines.push(`| ${name} | ${q.length} | ${(llmShare * 100).toFixed(1)}% | $${mean(q.map((r) => r.usdPer1k)).toFixed(4)} |`);
}
const cold = load.report.cold?.find((r) => r.concurrency === 8);
const warm = load.report.warm?.find((r) => r.concurrency === 8);
if (cold && warm)
  lines.push(
    '',
    '## Cache effect (concurrency 8, 2M listings)',
    '',
    `- Cold (no cache): p95 ${cold.p95Ms} ms, ${cold.rps} searches/s.`,
    `- Warm (every query cached): p95 ${warm.p95Ms} ms, ${warm.rps} searches/s. A cache hit makes no model call and no vector query.`,
  );
lines.push(
  '',
  '## Why it is cheap',
  '',
  '- The deterministic parser handles most queries; the LLM runs only when the parser leaves constraint-like text it cannot read.',
  '- One embedding call per uncached query; query embeddings are cached for 24 h, results for 60 s.',
  '- The LLM never runs per result row; the optional reranker scores at most 30 candidates.',
);
writeFileSync('results/cost.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
