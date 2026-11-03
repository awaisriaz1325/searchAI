import { describe, expect, it } from 'vitest';
import { postCheck } from '../src/postcheck.ts';

const row = (id: number, priceMinor: number) => ({
  id,
  portal: 'cars' as const,
  title: '',
  description: '',
  lang: 'en',
  priceMinor,
  lat: 53.55,
  lon: 9.99,
  facts: { fuel: 'diesel' },
});

describe('postCheck', () => {
  it('drops a row above the max price and counts the violation', () => {
    const { kept, violations } = postCheck([row(1, 100), row(2, 999_999)], { priceMaxMinor: 1_000, facts: {} });
    expect(kept.map((r) => r.id)).toEqual([1]);
    expect(violations).toBe(1);
  });
});
