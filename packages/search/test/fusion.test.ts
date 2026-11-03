import { describe, expect, it } from 'vitest';
import { rrf } from '../src/fusion.ts';

describe('rrf', () => {
  it('ranks an item found by both legs above one found by a single leg', () => {
    const fused = rrf([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }, { id: 2 }],
    ]);
    expect(fused[0]!.id).toBe(2);
    expect(fused.map((h) => h.id).sort()).toEqual([1, 2, 3]);
  });
  it('handles an empty leg', () => {
    expect(rrf([[{ id: 7 }], []]).map((h) => h.id)).toEqual([7]);
  });
});
