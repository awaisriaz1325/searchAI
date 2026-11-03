import { PORTALS, type Portal } from '@searchai/core';
import { MAKE_ALIASES } from '@searchai/datagen';
import { parseQuery } from '@searchai/search';

/** Deterministic baseline: the query parser run over listing text, plus make and year. */
export function extractFactsRegex(portal: Portal, text: string): Record<string, unknown> {
  const p = parseQuery(text, { portal });
  const out: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(p.filters.facts)) out[k] = c.eq ?? c.max ?? c.min;
  const lower = text.toLowerCase();
  if (portal === 'cars') {
    for (const [make, aliases] of Object.entries(MAKE_ALIASES))
      if (aliases.some((a) => new RegExp(`(?<![\\p{L}])${a}(?![\\p{L}])`, 'u').test(lower))) out.make = make;
    const y = lower.match(/(?<!\d)(19[5-9]\d|20[0-2]\d)(?!\d)/);
    if (y) out.year = Number(y[1]);
  }
  if (portal === 'homes') {
    const y = lower.match(/(?:baujahr|built|construit en|construido en|rok budowy)\s+(\d{4})/);
    if (y) out.year_built = Number(y[1]);
  }
  return out;
}

const same = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) <= Math.max(0.01 * Math.abs(b), 1e-9)
    : typeof a === 'string' && typeof b === 'string'
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;

export interface PRF {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}
const prf = (tp: number, fp: number, fn: number): PRF => {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { precision: r3(precision), recall: r3(recall), f1: r3(precision + recall ? (2 * precision * recall) / (precision + recall) : 0), tp, fp, fn };
};

export type ExtractionScores = Record<Portal, { n: number; fields: Record<string, PRF>; micro: PRF }>;

/**
 * Field-level precision/recall against generator truth. A wrong value counts as both a false
 * positive and a false negative. Recall's ceiling is below 1: about 1 in 10 listings leaves a
 * fact out of its text, and nothing can extract what the text does not say.
 */
export function scoreExtraction(
  truth: { portal: Portal; facts: Record<string, unknown> }[],
  got: Record<string, unknown>[],
): ExtractionScores {
  const out = {} as ExtractionScores;
  for (const portal of PORTALS) {
    const counts = new Map<string, [number, number, number]>();
    let n = 0;
    truth.forEach((t, i) => {
      if (t.portal !== portal) return;
      n++;
      const g = got[i] ?? {};
      for (const field of new Set([...Object.keys(t.facts), ...Object.keys(g)])) {
        const c = counts.get(field) ?? [0, 0, 0];
        const has = field in g;
        const ok = has && same(g[field], t.facts[field]);
        if (ok) c[0]++;
        else {
          if (has) c[1]++;
          if (field in t.facts) c[2]++;
        }
        counts.set(field, c);
      }
    });
    const fields = Object.fromEntries([...counts].map(([f, [tp, fp, fn]]) => [f, prf(tp, fp, fn)]));
    const sum = [...counts.values()].reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
    out[portal] = { n, fields, micro: prf(sum[0]!, sum[1]!, sum[2]!) };
  }
  return out;
}
