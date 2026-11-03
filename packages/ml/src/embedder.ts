import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { MODELS, fileVersion } from './models.ts';

export interface Embedder {
  model: string;
  /** Changes whenever the model weights change; stored per row so stale vectors can be found. */
  version: string;
  dim: 384;
  embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]>;
}

/** multilingual-e5-small on CPU: mean pooling, L2-normalised, with e5's query/passage prefixes. */
export async function createE5Embedder(opts: { batchSize?: number } = {}): Promise<Embedder> {
  const batchSize = opts.batchSize ?? 32;
  const extractor: FeatureExtractionPipeline = await pipeline('feature-extraction', MODELS.embedder, {
    dtype: 'fp32',
  });
  const version = await fileVersion(MODELS.embedder, 'onnx/model.onnx');
  return {
    model: MODELS.embedder,
    version,
    dim: 384,
    async embed(texts, kind) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize).map((t) => `${kind}: ${t}`);
        const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
        const data = tensor.data as Float32Array;
        for (let r = 0; r < batch.length; r++) out.push(data.slice(r * 384, (r + 1) * 384));
      }
      return out;
    },
  };
}
