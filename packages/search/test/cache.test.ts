import { describe, expect, it } from 'vitest';
import { cacheKey, createMemoryCache } from '../src/cache.ts';

describe('cache', () => {
  it('cacheKey ignores object key order', () => {
    const a = cacheKey({ kind: 'result', norm: 'van', filters: { portal: 'cars', facts: { a: 1, b: 2 } }, role: 'anon' });
    const b = cacheKey({ role: 'anon', filters: { facts: { b: 2, a: 1 }, portal: 'cars' }, norm: 'van', kind: 'result' });
    expect(a).toBe(b);
    expect(a).not.toBe(cacheKey({ kind: 'result', norm: 'vans', role: 'anon' }));
  });

  it('memory cache expires entries', async () => {
    let now = 1_000;
    const c = createMemoryCache(() => now);
    await c.set('k', { v: 1 }, 60);
    expect(await c.get('k')).toEqual({ v: 1 });
    now += 61_000;
    expect(await c.get('k')).toBeNull();
  });
});
