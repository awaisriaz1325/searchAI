import { describe, expect, it } from 'vitest';
import { createCrossEncoder } from '../src/index.ts';

describe.skipIf(process.env.SKIP_MODELS === '1')('cross-encoder reranker', () => {
  it('scores a relevant passage above an irrelevant one', async () => {
    const rr = await createCrossEncoder();
    const [relevant, irrelevant] = await rr.score('family car with room for luggage', [
      'Skoda Octavia estate, large boot, isofix, 2019',
      'Three-room apartment with balcony in the city centre',
    ]);
    expect(relevant!).toBeGreaterThan(irrelevant!);
  });
});
