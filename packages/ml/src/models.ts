import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from '@huggingface/transformers';

/** Model cache shared by every model in the repo (git-ignored; cached in CI). */
export const MODEL_CACHE_DIR =
  process.env.MODEL_CACHE ?? fileURLToPath(new URL('../../../.models/', import.meta.url));
env.cacheDir = MODEL_CACHE_DIR;

export const MODELS = {
  embedder: 'Xenova/multilingual-e5-small',
  llm: 'onnx-community/Qwen2.5-0.5B-Instruct',
  reranker: 'Xenova/bge-reranker-base',
} as const;

/** First 12 hex chars of the sha256 of a cached model file: the version stamped on its outputs. */
export async function fileVersion(model: string, file: string): Promise<string> {
  const path = `${MODEL_CACHE_DIR}/${model}/${file}`;
  if (!existsSync(path)) return 'unknown00000';
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex').slice(0, 12);
}
