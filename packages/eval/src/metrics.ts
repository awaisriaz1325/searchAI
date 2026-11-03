/** Exponential-gain nDCG@k: Σ (2^rel − 1) / log2(i + 2), normalised by the ideal ordering. */
export function ndcgAt(k: number, rels: number[], ideal: number[]): number {
  const dcg = (xs: number[]) => xs.slice(0, k).reduce((s, r, i) => s + (2 ** r - 1) / Math.log2(i + 2), 0);
  const best = dcg([...ideal].sort((a, b) => b - a));
  return best === 0 ? 0 : dcg(rels) / best;
}

/** |top-k ∩ relevant| / min(|relevant|, k): 1.0 means the first k results are as good as possible. */
export function recallAt(k: number, retrieved: number[], relevant: Set<number>): number {
  if (!relevant.size) return 0;
  const hits = retrieved.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / Math.min(relevant.size, k);
}

export function mrr(retrieved: number[], relevant: Set<number>): number {
  const i = retrieved.findIndex((id) => relevant.has(id));
  return i < 0 ? 0 : 1 / (i + 1);
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
