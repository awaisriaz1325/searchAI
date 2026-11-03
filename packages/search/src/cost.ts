import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

interface Price {
  value: number;
}
export interface Prices {
  priced_at: string;
  embed_usd_per_1m_tokens: Price;
  rerank_usd_per_1m_tokens: Price;
  llm_usd_per_1m_input: Price;
  llm_usd_per_1m_output: Price;
  db_usd_per_vcpu_hour: Price;
}

export async function loadPrices(path = fileURLToPath(new URL('../../../config/prices.json', import.meta.url))): Promise<Prices> {
  return JSON.parse(await readFile(path, 'utf8')) as Prices;
}

export type Usage = { embedTokens?: number; rerankTokens?: number; llmIn?: number; llmOut?: number; modelCalls?: number };

export interface CostReport {
  modelCalls: number;
  tokens: { embed: number; rerank: number; llmIn: number; llmOut: number };
  dbMs: number;
  modelMs: number;
  /** Estimated USD per 1,000 searches like this one, at hosted-API list prices. */
  usdPer1k: { embed: number; rerank: number; llm: number; db: number; total: number };
  pricedAt: string;
}

const DB_STAGES = new Set(['plan', 'vector', 'keyword', 'load']);
const MODEL_STAGES = new Set(['embed', 'llmParse', 'rerank']);

/** Collects per-stage time and model usage for one search and prices it. */
export class CostMeter {
  readonly stageMs: Record<string, number> = {};
  private usage = { embed: 0, rerank: 0, llmIn: 0, llmOut: 0, calls: 0 };

  add(stage: string, ms: number, usage: Usage = {}): void {
    this.stageMs[stage] = Math.round(((this.stageMs[stage] ?? 0) + ms) * 10) / 10;
    this.usage.embed += usage.embedTokens ?? 0;
    this.usage.rerank += usage.rerankTokens ?? 0;
    this.usage.llmIn += usage.llmIn ?? 0;
    this.usage.llmOut += usage.llmOut ?? 0;
    this.usage.calls += usage.modelCalls ?? 0;
  }

  async time<T>(stage: string, fn: () => Promise<T> | T, usage?: (r: T) => Usage): Promise<T> {
    const t = performance.now();
    const r = await fn();
    this.add(stage, performance.now() - t, usage?.(r));
    return r;
  }

  report(p: Prices): CostReport {
    const sum = (set: Set<string>) => Object.entries(this.stageMs).filter(([k]) => set.has(k)).reduce((s, [, v]) => s + v, 0);
    const dbMs = sum(DB_STAGES);
    const perM = (tokens: number, price: number) => (tokens / 1e6) * price * 1000;
    const usd = {
      embed: perM(this.usage.embed, p.embed_usd_per_1m_tokens.value),
      rerank: perM(this.usage.rerank, p.rerank_usd_per_1m_tokens.value),
      llm: perM(this.usage.llmIn, p.llm_usd_per_1m_input.value) + perM(this.usage.llmOut, p.llm_usd_per_1m_output.value),
      db: (dbMs / 3_600_000) * p.db_usd_per_vcpu_hour.value * 1000,
      total: 0,
    };
    usd.total = usd.embed + usd.rerank + usd.llm + usd.db;
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    return {
      modelCalls: this.usage.calls,
      tokens: { embed: this.usage.embed, rerank: this.usage.rerank, llmIn: this.usage.llmIn, llmOut: this.usage.llmOut },
      dbMs: Math.round(dbMs * 10) / 10,
      modelMs: Math.round(sum(MODEL_STAGES) * 10) / 10,
      usdPer1k: Object.fromEntries(Object.entries(usd).map(([k, v]) => [k, round(v)])) as CostReport['usdPer1k'],
      pricedAt: p.priced_at,
    };
  }
}

/** Rough token count (≈4 chars per token) for pricing; the local models' tokenizers differ from Voyage's anyway. */
export const approxTokens = (text: string) => Math.ceil(text.length / 4);
