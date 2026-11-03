import { createHash } from 'node:crypto';
import type { Embedder } from './embedder.ts';

/**
 * Offline stand-in for tests and CI without model weights: the hashing trick over word
 * tokens. Shared words land close together; synonyms do not. Never used for reported quality.
 */
export function createHashEmbedder(): Embedder {
  const vec = (text: string) => {
    const v = new Float32Array(384);
    for (const tok of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
      const d = createHash('sha256').update(tok).digest();
      v[d.readUInt32BE(0) % 384]! += d[4]! % 2 ? -1 : 1;
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  };
  return { model: 'hash', version: 'hash00000001', dim: 384, embed: async (texts) => texts.map(vec) };
}
