import { describe, expect, it } from 'vitest';
import { parseQuery } from '@searchai/search';
import { createLlmParser, extractFacts, type Llm } from '../src/index.ts';

/** Replays canned replies in order; optionally slow. */
function fakeLlm(replies: string[], delayMs = 0): Llm & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    model: 'fake',
    prompts,
    async generate(prompt) {
      prompts.push(prompt);
      await new Promise((r) => setTimeout(r, delayMs));
      return { text: replies.shift() ?? '{}', tokensIn: 100, tokensOut: 20, ms: delayMs };
    },
  };
}

describe('extractFacts', () => {
  it('retries once after invalid JSON and then succeeds', async () => {
    const llm = fakeLlm(['not json at all', '{"fuel": "diesel", "body": "van", "mileage_km": "90.000"}']);
    const r = await extractFacts(llm, 'cars', 'VW Transporter Diesel, 90.000 km', 'de');
    expect(r.valid).toBe(true);
    expect(r.retries).toBe(1);
    expect(r.facts).toEqual({ fuel: 'diesel', body: 'van', mileage_km: 90_000 });
    expect(llm.prompts[1]).toContain('not valid JSON');
  });

  it('drops a value outside the allowed enum, and is invalid when nothing remains', async () => {
    const r = await extractFacts(fakeLlm(['{"fuel": "steam"}']), 'cars', 'steam car', 'en');
    expect(r.facts).toEqual({});
    expect(r.valid).toBe(false);
  });

  it('keeps valid fields when one field is invalid', async () => {
    const r = await extractFacts(fakeLlm(['{"fuel": "steam", "gearbox": "Automatic"}']), 'cars', 'x', 'en');
    expect(r.facts).toEqual({ gearbox: 'automatic' });
    expect(r.valid).toBe(true);
  });
});

describe('createLlmParser', () => {
  it('falls back to parser on timeout', async () => {
    const parser = createLlmParser(fakeLlm(['{"facts": {}}'], 2_000), 800);
    const q = 'diesel vann near Atlantis';
    const t = performance.now();
    const r = await parser(q, parseQuery(q));
    expect(r.timedOut).toBe(true);
    expect(performance.now() - t).toBeLessThan(1_000);
  });

  it('maps the LLM answer to hard filters', async () => {
    const llm = fakeLlm(['{"price_max_eur": 12000, "city": "Hamburg", "facts": {"body": {"eq": "van"}}}']);
    const q = 'a camper bus under twelve grand near hamburg';
    const r = await createLlmParser(llm, 800)(q, parseQuery(q, { portal: 'cars' }));
    expect(r.timedOut).toBe(false);
    expect(r.filters.priceMaxMinor).toBe(1_200_000);
    expect(r.filters.facts.body).toEqual({ eq: 'van' });
    expect(r.filters.geo?.radiusKm).toBe(50);
  });
});
