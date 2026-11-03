export interface Headline {
  ndcg10: number;
  recall20: number;
  violations: number;
}
export interface ConfigSummary {
  overall: Headline;
  perPortal: Record<string, Headline>;
}
export interface EvalSummary {
  configs: Record<string, ConfigSummary>;
}

export interface Tolerance {
  ndcg: number;
  recall: number;
  violations: number;
}

/** Fails on a quality drop beyond tolerance in any config or portal, and on any violation. */
export function compareToBaseline(
  current: EvalSummary,
  baseline: EvalSummary,
  tol: Tolerance = { ndcg: 0.02, recall: 0.02, violations: 0 },
): { ok: boolean; regressions: string[] } {
  const regressions: string[] = [];
  for (const [name, cur] of Object.entries(current.configs)) {
    const base = baseline.configs[name];
    const check = (scope: string, c: Headline, b?: Headline) => {
      if (c.violations > tol.violations) regressions.push(`${name} ${scope}: ${c.violations} violations`);
      if (!b) return;
      if (b.ndcg10 - c.ndcg10 > tol.ndcg + 1e-9) regressions.push(`${name} ${scope}: nDCG@10 ${b.ndcg10} -> ${c.ndcg10}`);
      if (b.recall20 - c.recall20 > tol.recall + 1e-9) regressions.push(`${name} ${scope}: recall@20 ${b.recall20} -> ${c.recall20}`);
    };
    check('overall', cur.overall, base?.overall);
    for (const [p, h] of Object.entries(cur.perPortal)) check(p, h, base?.perPortal[p]);
  }
  return { ok: regressions.length === 0, regressions };
}
