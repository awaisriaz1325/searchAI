import { describe, expect, it } from 'vitest';
import { FTS_CONFIG, PORTALS, factsSchemas } from '../src/index.ts';

describe('portal facts schemas', () => {
  it('accepts a valid car', () => {
    expect(() =>
      factsSchemas.cars.parse({
        make: 'volkswagen',
        model: 'transporter',
        year: 2019,
        fuel: 'diesel',
        body: 'van',
        mileage_km: 90000,
        gearbox: 'manual',
      }),
    ).not.toThrow();
  });

  it('rejects an unknown fuel', () => {
    expect(factsSchemas.cars.safeParse({ fuel: 'steam' }).success).toBe(false);
  });

  it('defines five portals and simple FTS for Polish', () => {
    expect(PORTALS.length).toBe(5);
    expect(FTS_CONFIG.pl).toBe('simple');
  });
});
