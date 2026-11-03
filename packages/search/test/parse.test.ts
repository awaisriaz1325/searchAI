import { describe, expect, it } from 'vitest';
import { generateGoldenQueries } from '@searchai/datagen';
import { filtersEqual, parseNumber, parseQuery } from '../src/parse/parse.ts';

const HAMBURG = { lat: 53.55, lon: 9.99, radiusKm: 50 };

describe('parseQuery', () => {
  it('parses the job-post query', () => {
    const p = parseQuery('diesel van under €25,000 near Hamburg, under 100,000 km');
    expect(p.portal).toBe('cars');
    expect(p.filters.priceMaxMinor).toBe(2_500_000);
    expect(p.filters.facts).toMatchObject({
      fuel: { eq: 'diesel' },
      body: { eq: 'van' },
      mileage_km: { max: 100_000 },
    });
    expect(p.filters.geo).toEqual(HAMBURG);
  });

  it('parses the same query in German', () => {
    const p = parseQuery('Diesel Transporter bis 25.000 € bei Hamburg unter 100.000 km');
    expect(p.lang).toBe('de');
    expect(p.filters.priceMaxMinor).toBe(2_500_000);
    expect(p.filters.facts).toMatchObject({ fuel: { eq: 'diesel' }, body: { eq: 'van' }, mileage_km: { max: 100_000 } });
    expect(p.filters.geo).toEqual(HAMBURG);
  });

  it('parses locale numbers', () => {
    expect(parseNumber('25.000 €', 'de')).toBe(25_000);
    expect(parseNumber('25,000', 'en')).toBe(25_000);
    expect(parseNumber('25k', 'en')).toBe(25_000);
    expect(parseNumber('€25 000', 'fr')).toBe(25_000);
    expect(parseNumber('2,5', 'de')).toBe(2.5);
    expect(parseQuery('Wohnung mieten ab 2,5 Zimmer').filters.facts.rooms).toEqual({ min: 2.5 });
  });

  it('unknown city is reported unparsed', () => {
    const p = parseQuery('van near Atlantis');
    expect(p.filters.geo).toBeUndefined();
    expect(p.unparsed).toContain('atlantis');
  });

  it('ambiguous term does not force portal', () => {
    expect(parseQuery('golf').portal).toBeNull();
  });

  it('handles empty input', () => {
    for (const q of ['', '   ']) {
      const p = parseQuery(q);
      expect(p.filters.facts).toEqual({});
      expect(p.semantic).toBe('');
    }
  });

  it('keeps soft wording as the semantic remainder', () => {
    expect(parseQuery('family car diesel under €20,000').semantic).toBe('family car');
  });

  it('tolerates a one-letter transposition in a fact word', () => {
    expect(parseQuery('transpotrer bis 10.000 €').filters.facts.body).toEqual({ eq: 'van' });
  });

  it('matches the labeled filters on at least 80% of golden queries', () => {
    const golden = generateGoldenQueries(1);
    const ok = golden.filter((q) => filtersEqual(parseQuery(q.text, { portal: q.portal ?? undefined }).filters, q.filters));
    const rate = ok.length / golden.length;
    console.log(`parser exact-match on ${golden.length} golden queries: ${rate.toFixed(3)}`);
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });
});
