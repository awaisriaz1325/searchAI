import { AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers';
import { MODELS } from './models.ts';

export interface Reranker {
  model: string;
  /** Relevance in 0..1 for each doc, in input order. */
  score(query: string, docs: string[]): Promise<number[]>;
}

/** bge-reranker-base cross-encoder on CPU. Scores (query, doc) pairs jointly, so it is slower than embeddings. */
export async function createCrossEncoder(opts: { batchSize?: number } = {}): Promise<Reranker> {
  const tokenizer = await AutoTokenizer.from_pretrained(MODELS.reranker);
  const model = await AutoModelForSequenceClassification.from_pretrained(MODELS.reranker, { dtype: 'fp32' });
  const batchSize = opts.batchSize ?? 16;
  return {
    model: MODELS.reranker,
    async score(query, docs) {
      const out: number[] = [];
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        const inputs = tokenizer(Array(batch.length).fill(query), { text_pair: batch, padding: true, truncation: true, max_length: 256 });
        const { logits } = await model(inputs);
        for (const x of logits.data as Float32Array) out.push(1 / (1 + Math.exp(-x)));
      }
      return out;
    },
  };
}
