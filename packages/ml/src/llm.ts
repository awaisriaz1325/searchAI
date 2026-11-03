import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import { MODELS } from './models.ts';

export interface LlmResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  ms: number;
}
export interface Llm {
  model: string;
  generate(prompt: string, opts: { maxTokens: number; system?: string }): Promise<LlmResult>;
}

/**
 * Qwen2.5-0.5B-Instruct (4-bit ONNX) on CPU, greedy decoding. Calls are serialised: one
 * generation at a time, because parallel generations on 4 CPUs only slow each other down.
 */
export async function createQwenLlm(): Promise<Llm> {
  const gen: TextGenerationPipeline = await pipeline('text-generation', MODELS.llm, { dtype: 'q4' });
  let queue: Promise<unknown> = Promise.resolve();
  const run = async (prompt: string, maxTokens: number, system?: string): Promise<LlmResult> => {
    const t = performance.now();
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ];
    const out = (await gen(messages, { max_new_tokens: maxTokens, do_sample: false })) as unknown as {
      generated_text: { role: string; content: string }[];
    }[];
    const text = out[0]!.generated_text.at(-1)!.content;
    const count = (s: string) => gen.tokenizer.encode(s).length;
    return { text, tokensIn: count(messages.map((m) => m.content).join('\n')), tokensOut: count(text), ms: performance.now() - t };
  };
  return {
    model: MODELS.llm,
    generate(prompt, opts) {
      const next = queue.then(() => run(prompt, opts.maxTokens, opts.system));
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

/** The first balanced {...} object in `text`, parsed; null if there is none. */
export function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        const v = JSON.parse(text.slice(start, i + 1));
        return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
