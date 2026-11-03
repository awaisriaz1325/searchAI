/**
 * Runs local LLM fact extraction over the 1k listings and scores it against generator truth
 * and against the regex baseline. Resumable: listings already in the output are skipped.
 *   npm run extract
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Portal } from '@searchai/core';
import type { GeneratedListing } from '@searchai/datagen';
import { PROMPT_HASH, createQwenLlm, extractFacts, MODELS } from '@searchai/ml';
import { extractFactsRegex, scoreExtraction } from './extraction-eval.ts';

const IN = 'data/listings-1k.jsonl';
const OUT = 'data/facts-extracted-1k.jsonl';
interface Row { id: number; facts: Record<string, unknown>; valid: boolean; ms: number; tokensIn: number; tokensOut: number; model: string; promptHash: string }

const listings = readFileSync(IN, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GeneratedListing);
const done = new Map<number, Row>();
if (existsSync(OUT))
  for (const line of readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as Row;
    if (r.promptHash === PROMPT_HASH && r.model === MODELS.llm) done.set(r.id, r);
  }
if (done.size === 0) writeFileSync(OUT, '');

const todo = listings.filter((l) => !done.has(l.id));
if (todo.length) {
  const llm = await createQwenLlm();
  const t0 = performance.now();
  for (const [i, l] of todo.entries()) {
    const r = await extractFacts(llm, l.portal, `${l.title}\n${l.description}`, l.lang);
    const row: Row = { id: l.id, facts: r.facts as Record<string, unknown>, valid: r.valid, ms: Math.round(r.ms), tokensIn: r.tokensIn, tokensOut: r.tokensOut, model: llm.model, promptHash: PROMPT_HASH };
    appendFileSync(OUT, JSON.stringify(row) + '\n');
    done.set(l.id, row);
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${todo.length} extracted, ${((performance.now() - t0) / (i + 1) / 1000).toFixed(1)} s/listing`);
  }
}

const rows = listings.map((l) => done.get(l.id)!);
const truth = listings.map((l) => ({ portal: l.portal as Portal, facts: l.facts as Record<string, unknown> }));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const report = {
  model: MODELS.llm,
  promptHash: PROMPT_HASH,
  listings: listings.length,
  hardware: '4 vCPU / 15 GB, CPU only',
  llm: {
    scores: scoreExtraction(truth, rows.map((r) => r.facts)),
    schemaValidRate: +(rows.filter((r) => r.valid).length / rows.length).toFixed(3),
    meanMs: Math.round(mean(rows.map((r) => r.ms))),
    meanTokensIn: Math.round(mean(rows.map((r) => r.tokensIn))),
    meanTokensOut: Math.round(mean(rows.map((r) => r.tokensOut))),
  },
  regexBaseline: { scores: scoreExtraction(truth, listings.map((l) => extractFactsRegex(l.portal, `${l.title}\n${l.description}`))) },
};
mkdirSync('results', { recursive: true });
writeFileSync('results/extraction-1k.json', JSON.stringify(report, null, 1));
for (const [name, s] of [['llm', report.llm.scores], ['regex', report.regexBaseline.scores]] as const)
  console.log(name, Object.fromEntries(Object.entries(s).map(([p, v]) => [p, v.micro.f1])));
