import type { Hit } from './types.ts';

/** Reciprocal Rank Fusion: score = Σ 1 / (k + rank). Robust, and has no weight to tune. */
export function rrf(lists: Hit[][], k = 60): Hit[] {
  const scores = new Map<number, number>();
  for (const list of lists)
    list.forEach((hit, rank) => scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (k + rank + 1)));
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }));
}
