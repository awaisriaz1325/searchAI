import { describe, expect, it } from 'vitest';
import { FTS_CONFIG, PORTALS, factsSchemas, matchesFilters } from '../src/index.ts';

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

describe('matchesFilters', () => {
  const van = {
    portal: 'cars' as const,
    priceMinor: 2_000_000,
    lat: 53.6,
    lon: 10.0,
    facts: { fuel: 'diesel', body: 'van', mileage_km: 90_000 },
  };
  it('accepts a listing inside every constraint', () => {
    expect(
      matchesFilters(
        {
          portal: 'cars',
          priceMaxMinor: 2_500_000,
          geo: { lat: 53.55, lon: 9.99, radiusKm: 50 },
          facts: { fuel: { eq: 'diesel' }, mileage_km: { max: 100_000 } },
        },
        van,
      ),
    ).toBe(true);
  });
  it('rejects price, distance, and a missing constrained fact', () => {
    expect(matchesFilters({ priceMaxMinor: 1_000_000, facts: {} }, van)).toBe(false);
    expect(matchesFilters({ geo: { lat: 48.14, lon: 11.58, radiusKm: 50 }, facts: {} }, van)).toBe(false);
    expect(matchesFilters({ facts: { gearbox: { eq: 'manual' } } }, van)).toBe(false);
  });
});
