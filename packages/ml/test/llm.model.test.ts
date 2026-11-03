import { describe, expect, it } from 'vitest';
import { generateListings } from '@searchai/datagen';
import { createQwenLlm, extractFacts } from '../src/index.ts';

describe.skipIf(process.env.SKIP_MODELS === '1')('Qwen2.5-0.5B extraction', () => {
  it('extracts most facts from a German car listing', async () => {
    const car = [...generateListings({ seed: 1, count: 1 })][0]!;
    const llm = await createQwenLlm();
    const r = await extractFacts(llm, 'cars', `${car.title}\n${car.description}`, car.lang);
    const truth = car.facts as Record<string, unknown>;
    const correct = Object.entries(r.facts).filter(([k, v]) => truth[k] === v).length;
    console.log(JSON.stringify({ text: car.description, truth, got: r.facts, correct, ms: Math.round(r.ms) }));
    expect(correct).toBeGreaterThanOrEqual(4);
  });
});
