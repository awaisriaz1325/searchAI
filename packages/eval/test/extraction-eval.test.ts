import { describe, expect, it } from 'vitest';
import { generateListings } from '@searchai/datagen';
import { extractFactsRegex, scoreExtraction } from '../src/extraction-eval.ts';

describe('extraction scoring', () => {
  it('scores precision and recall per field', () => {
    const truth = [{ portal: 'cars' as const, facts: { fuel: 'diesel', body: 'van', mileage_km: 90_000 } }];
    const got = [{ fuel: 'diesel', body: 'sedan' }];
    const s = scoreExtraction(truth, got);
    expect(s.cars.fields.fuel).toMatchObject({ precision: 1, recall: 1 });
    expect(s.cars.fields.body).toMatchObject({ precision: 0, recall: 0 });
    expect(s.cars.fields.mileage_km).toMatchObject({ recall: 0 });
    expect(s.cars.micro.precision).toBeCloseTo(0.5);
    expect(s.cars.micro.recall).toBeCloseTo(1 / 3);
  });

  it('regex baseline reads fuel and mileage from a German car listing', () => {
    const car = [...generateListings({ seed: 1, count: 1 })][0]!;
    const f = extractFactsRegex('cars', `${car.title}\n${car.description}`);
    expect(f).toMatchObject({ fuel: 'electric', body: 'van', mileage_km: 255_000, gearbox: 'automatic' });
  });
});
