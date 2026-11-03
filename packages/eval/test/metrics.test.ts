import { describe, expect, it } from 'vitest';
import { mrr, ndcgAt, recallAt } from '../src/metrics.ts';
import { compareToBaseline, type EvalSummary } from '../src/compare.ts';

describe('ranking metrics', () => {
  it('nDCG@3 with exponential gain', () => {
    // (2^3-1)/log2(2) + (2^2-1)/log2(3) = 8.8928; ideal adds (2^1-1)/log2(4) = 0.5
    expect(ndcgAt(3, [3, 2, 0], [3, 2, 1])).toBeCloseTo(0.9468, 3);
    expect(ndcgAt(3, [0, 0, 0], [0, 0, 0])).toBe(0);
  });
  it('recall@k caps the denominator at k', () => {
    expect(recallAt(2, [1, 2, 3], new Set([2, 3, 4]))).toBeCloseTo(0.5);
    expect(recallAt(20, [1], new Set([1]))).toBe(1);
  });
  it('MRR is the reciprocal rank of the first relevant result', () => {
    expect(mrr([5, 6, 7], new Set([7]))).toBeCloseTo(1 / 3);
    expect(mrr([5], new Set([9]))).toBe(0);
  });
});

const summary = (ndcg: number, violations = 0): EvalSummary => ({
  configs: { 'truth/rerank-off': { overall: { ndcg10: ndcg, recall20: 0.8, violations }, perPortal: {} } },
});

describe('compareToBaseline', () => {
  it('flags a 0.03 nDCG drop and accepts a 0.01 drop', () => {
    expect(compareToBaseline(summary(0.77), summary(0.8)).ok).toBe(false);
    expect(compareToBaseline(summary(0.79), summary(0.8)).ok).toBe(true);
  });
  it('flags any constraint violation', () => {
    const r = compareToBaseline(summary(0.8, 1), summary(0.8));
    expect(r.ok).toBe(false);
    expect(r.regressions.join()).toContain('violations');
  });
});
