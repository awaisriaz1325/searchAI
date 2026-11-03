import { describe, expect, it } from 'vitest';
import { createRng, generateListings } from '@searchai/datagen';
import { redactVectors } from '../src/redact.ts';
import { perturbFrom } from '../src/perturb.ts';

const unit = (seed: number) => {
  const v = Float32Array.from({ length: 384 }, (_, i) => Math.sin(seed * 31 + i));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe('redactVectors', () => {
  it('replaces vector literals in EXPLAIN output', () => {
    const line = "Order By: (embedding <=> '[0.1,-0.2,3e-4]'::halfvec)";
    const out = redactVectors(line);
    expect(out).toContain("'<query vector>'");
    expect(out).not.toMatch(/\[[-\d.,e]+\]/);
  });
});

describe('perturbFrom', () => {
  it('derives a unit vector close to a real vector of the same portal and kind', () => {
    const real = [...generateListings({ seed: 1, count: 50 })].map((l, i) => ({ listing: l, vector: unit(i) }));
    const derive = perturbFrom(real, createRng(3));
    const target = [...generateListings({ seed: 1, count: 1, startId: 5_001 })][0]!;
    const { vector, sourceId } = derive(target);
    const source = real.find((r) => r.listing.id === sourceId)!;
    expect(source.listing.portal).toBe(target.portal);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 3);
    expect(cos(vector, source.vector)).toBeGreaterThan(0.8);
  });
});
