import { factsSchemas, type FactConstraint, type HardFilters, type Portal } from '@searchai/core';
import { PLACES } from '@searchai/datagen';
import { DEFAULT_RADIUS_KM, type LlmParserPort, type ParsedQuery } from '@searchai/search';
import { firstJsonObject, type Llm } from './llm.ts';

const SYSTEM =
  'You turn a marketplace search query into JSON search filters. Reply with one JSON object only. ' +
  'Leave out anything the query does not say.';

function prompt(text: string, parsed: ParsedQuery): string {
  const portal = parsed.portal;
  const fields = portal ? Object.keys(factsSchemas[portal].shape).join(', ') : 'any listing fact';
  return (
    `Query: ${text}\nAlready understood: ${JSON.stringify(parsed.filters)}\nNot understood: ${parsed.unparsed.join(', ')}\n` +
    `Fields: ${fields}\nReply as {"price_max_eur"?: number, "price_min_eur"?: number, "city"?: string, ` +
    `"facts"?: {"<field>": {"eq"?: value, "min"?: number, "max"?: number}}}\nJSON:`
  );
}

function toFilters(json: Record<string, unknown>, portal: Portal | null): HardFilters {
  const f: HardFilters = { facts: {} };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const max = num(json.price_max_eur);
  const min = num(json.price_min_eur);
  if (max !== undefined) f.priceMaxMinor = Math.round(max * 100);
  if (min !== undefined) f.priceMinMinor = Math.round(min * 100);
  if (typeof json.city === 'string') {
    const name = json.city.toLowerCase().trim();
    const place = PLACES.find((p) => p.aliases.includes(name));
    if (place) f.geo = { lat: place.lat, lon: place.lon, radiusKm: DEFAULT_RADIUS_KM };
  }
  const allowed = portal ? factsSchemas[portal].shape : null;
  if (json.facts && typeof json.facts === 'object') {
    for (const [field, c] of Object.entries(json.facts as Record<string, FactConstraint>)) {
      if (!c || typeof c !== 'object') continue;
      const schema = allowed?.[field as keyof typeof allowed] as { safeParse(v: unknown): { success: boolean } } | undefined;
      if (allowed && !schema) continue;
      const out: FactConstraint = {};
      if (c.eq !== undefined && (!schema || schema.safeParse(c.eq).success)) out.eq = c.eq;
      if (num(c.min) !== undefined) out.min = c.min;
      if (num(c.max) !== undefined) out.max = c.max;
      if (Object.keys(out).length) f.facts[field] = out;
    }
  }
  return f;
}

/**
 * LLM fallback for what the deterministic parser left unparsed. Bounded by `timeoutMs`:
 * on timeout the search goes on with the parser's filters and records the degradation.
 */
export function createLlmParser(llm: Llm, timeoutMs = 800): LlmParserPort {
  return async (text, parsed) => {
    const t = performance.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)));
    const call = llm.generate(prompt(text, parsed), { maxTokens: 96, system: SYSTEM }).catch(() => null);
    const r = await Promise.race([call, timeout]);
    clearTimeout(timer);
    const ms = performance.now() - t;
    if (!r) return { filters: { facts: {} }, timedOut: true, ms, tokensIn: 0, tokensOut: 0 };
    const json = firstJsonObject(r.text) ?? {};
    return { filters: toFilters(json, parsed.portal), timedOut: false, ms, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  };
}
