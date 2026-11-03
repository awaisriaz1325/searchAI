import type { SearchResponse } from '@searchai/search';

const BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000];

/** Minimal Prometheus text exposition: counters plus a per-stage latency histogram. */
export class Metrics {
  private requests = 0;
  private cacheHits = 0;
  private violations = 0;
  private noMatch = 0;
  private degraded = new Map<string, number>();
  private plans = new Map<string, number>();
  private stages = new Map<string, { counts: number[]; sum: number; n: number }>();

  record(r: SearchResponse): void {
    this.requests++;
    if (r.cache === 'hit') this.cacheHits++;
    this.violations += r.violations;
    if (r.reason === 'no_match_for_filters') this.noMatch++;
    for (const d of r.degraded) this.degraded.set(d, (this.degraded.get(d) ?? 0) + 1);
    if (r.plan) this.plans.set(r.plan.kind, (this.plans.get(r.plan.kind) ?? 0) + 1);
    const total = Object.values(r.stageMs).reduce((s, v) => s + v, 0);
    for (const [stage, ms] of [...Object.entries(r.stageMs), ['total', total] as const]) {
      const h = this.stages.get(stage) ?? { counts: BUCKETS.map(() => 0), sum: 0, n: 0 };
      BUCKETS.forEach((b, i) => {
        if (ms <= b) h.counts[i]!++;
      });
      h.sum += ms;
      h.n++;
      this.stages.set(stage, h);
    }
  }

  render(): string {
    const out = [
      '# TYPE search_requests_total counter',
      `search_requests_total ${this.requests}`,
      '# TYPE search_cache_hits_total counter',
      `search_cache_hits_total ${this.cacheHits}`,
      '# TYPE search_constraint_violations_total counter',
      `search_constraint_violations_total ${this.violations}`,
      '# TYPE search_no_match_total counter',
      `search_no_match_total ${this.noMatch}`,
      '# TYPE search_degraded_total counter',
      ...[...this.degraded].map(([k, v]) => `search_degraded_total{reason="${k}"} ${v}`),
      '# TYPE search_plan_total counter',
      ...[...this.plans].map(([k, v]) => `search_plan_total{kind="${k}"} ${v}`),
      '# TYPE search_stage_ms histogram',
    ];
    for (const [stage, h] of this.stages) {
      BUCKETS.forEach((b, i) => out.push(`search_stage_ms_bucket{stage="${stage}",le="${b}"} ${h.counts[i]}`));
      out.push(`search_stage_ms_bucket{stage="${stage}",le="+Inf"} ${h.n}`);
      out.push(`search_stage_ms_sum{stage="${stage}"} ${h.sum.toFixed(1)}`, `search_stage_ms_count{stage="${stage}"} ${h.n}`);
    }
    return out.join('\n') + '\n';
  }
}
