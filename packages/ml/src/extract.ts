import { createHash } from 'node:crypto';
import { factsSchemas, type Facts, type Lang, type Portal } from '@searchai/core';
import { CAR_MODELS, JOB_ROLES } from '@searchai/datagen';
import { parseNumber } from '@searchai/search';
import type { z } from 'zod';
import { firstJsonObject, type Llm } from './llm.ts';

export interface Extraction {
  facts: Partial<Facts>;
  /** JSON parsed and at least one field passed its schema. */
  valid: boolean;
  retries: number;
  ms: number;
  tokensIn: number;
  tokensOut: number;
}

const HINTS: Partial<Record<string, string>> = {
  make: [...new Set(CAR_MODELS.map((m) => m.make))].join(' | '),
  role: Object.keys(JOB_ROLES).join(' | '),
  mileage_km: 'integer kilometres',
  year: 'integer',
  year_built: 'integer',
  rooms: 'number',
  area_m2: 'number',
  salary_min: 'integer EUR per year',
  salary_max: 'integer EUR per year',
  furnished: 'true | false',
  available_from: 'YYYY-MM-DD',
};

function fieldSpec(portal: Portal): string {
  return Object.entries(factsSchemas[portal].shape)
    .map(([field, schema]) => {
      const options = (schema as unknown as { options?: string[] }).options;
      return `  "${field}": ${options ? options.join(' | ') : (HINTS[field] ?? 'string')}`;
    })
    .join('\n');
}

export const EXTRACT_SYSTEM =
  'You extract structured facts from marketplace listings. Reply with one JSON object only. ' +
  'Use only the allowed values. Leave out any field the listing does not state.';

export function extractionPrompt(portal: Portal, text: string): string {
  return `Portal: ${portal}\nFields:\n${fieldSpec(portal)}\n\nListing:\n${text}\n\nJSON:`;
}

/** Changes whenever the prompt template changes; stored with extracted facts. */
export const PROMPT_HASH = createHash('sha256')
  .update(EXTRACT_SYSTEM + extractionPrompt('cars', '') + extractionPrompt('jobs', ''))
  .digest('hex')
  .slice(0, 12);

/** Light coercion of small-model output before validation: "90.000" -> 90000, "Automatic" -> "automatic". */
function coerce(schema: z.ZodType, value: unknown, lang: Lang): unknown {
  const def = (schema as unknown as { def?: { type?: string } }).def;
  const type = def?.type;
  if (typeof value === 'string') {
    const v = value.trim();
    if (type === 'number') return parseNumber(v.replace(/[^\d.,\s k]/gi, '').trim(), lang) ?? v;
    if (type === 'boolean') return /^(true|yes|ja|oui|sí|si|tak)$/i.test(v) ? true : /^(false|no|nein|non|nie)$/i.test(v) ? false : v;
    if (type === 'enum' || type === 'string') return v.toLowerCase();
  }
  return value;
}

/** Validates field by field, so one bad value does not discard the good ones. */
export function validateFacts(portal: Portal, raw: Record<string, unknown>, lang: Lang): Partial<Facts> {
  const shape = factsSchemas[portal].shape as Record<string, z.ZodType>;
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(raw)) {
    const schema = shape[field];
    if (!schema || value === null || value === undefined || value === '') continue;
    const r = schema.safeParse(coerce(schema, value, lang));
    if (r.success) out[field] = r.data;
  }
  return out as Partial<Facts>;
}

export async function extractFacts(llm: Llm, portal: Portal, text: string, lang: Lang): Promise<Extraction> {
  const t = performance.now();
  let prompt = extractionPrompt(portal, text);
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await llm.generate(prompt, { maxTokens: 160, system: EXTRACT_SYSTEM });
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;
    const json = firstJsonObject(r.text);
    if (json) {
      const facts = validateFacts(portal, json, lang);
      return { facts, valid: Object.keys(facts).length > 0, retries: attempt, ms: performance.now() - t, tokensIn, tokensOut };
    }
    prompt = `${extractionPrompt(portal, text)}\n\nYour previous reply was not valid JSON. Reply with a single JSON object and nothing else.`;
  }
  return { facts: {}, valid: false, retries: 1, ms: performance.now() - t, tokensIn, tokensOut };
}
