import { beforeAll, describe, expect, it } from 'vitest';
import { createE5Embedder, type Embedder } from '../src/index.ts';

const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, v, i) => s + v * b[i]!, 0);
let embedder: Embedder;

beforeAll(async () => {
  embedder = await createE5Embedder();
});

describe.skipIf(process.env.SKIP_MODELS === '1')('multilingual-e5 embedder', () => {
  it('returns unit-length 384-dim vectors and a version', async () => {
    const [v] = await embedder.embed(['diesel van'], 'query');
    expect(v!.length).toBe(384);
    expect(Math.hypot(...v!)).toBeCloseTo(1, 3);
    expect(embedder.dim).toBe(384);
    expect(embedder.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('places a German van listing closer to an English van query than a flat', async () => {
    const [q] = await embedder.embed(['diesel van'], 'query');
    const [van, flat] = await embedder.embed(
      ['Diesel Transporter, 90.000 km', 'Dreizimmerwohnung mit Balkon'],
      'passage',
    );
    expect(cos(q!, van!)).toBeGreaterThan(cos(q!, flat!));
  });
});
