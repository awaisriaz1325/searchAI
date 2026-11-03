/**
 * End-to-end /search latency under concurrency, against the 2M database, real models.
 *   npm run bench:load-test
 * Starts the API as a child process per cache mode (cold: CACHE=off; warm: cache prefilled with
 * every query), then runs C concurrent clients for DURATION seconds each, cycling the 200
 * golden queries. Records every latency, so p50/p95/p99 are exact, not histogram estimates.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { GoldenQuery } from '@searchai/datagen';
import { percentile } from '../../packages/eval/src/metrics.ts';

const DURATION = Number(process.env.LOADTEST_SECONDS ?? 60);
const LEVELS = (process.env.LOADTEST_CONCURRENCY ?? '1,8,32').split(',').map(Number);
const PORT = 8790;
const golden = JSON.parse(readFileSync('data/golden-queries.json', 'utf8')) as GoldenQuery[];
const bodies = golden.map((g) => JSON.stringify({ q: g.text, portal: g.portal ?? undefined, limit: 20, rerank: false }));

async function startServer(env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn('npx', ['tsx', 'apps/api/src/server.ts'], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: process.env.BENCH_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai_2m', LLM_PARSE: '1', ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/health`)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server did not start');
}

async function level(c: number) {
  const latencies: number[] = [];
  const stages: Record<string, number[]> = {};
  let errors = 0;
  let next = 0;
  const end = Date.now() + DURATION * 1000;
  await Promise.all(
    Array.from({ length: c }, async () => {
      while (Date.now() < end) {
        const body = bodies[next++ % bodies.length]!;
        const t = performance.now();
        try {
          const res = await fetch(`http://localhost:${PORT}/search`, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
          const json = (await res.json()) as { stageMs?: Record<string, number> };
          if (!res.ok) errors++;
          latencies.push(performance.now() - t);
          for (const [k, v] of Object.entries(json.stageMs ?? {})) (stages[k] ??= []).push(v);
        } catch {
          errors++;
        }
      }
    }),
  );
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    concurrency: c,
    requests: latencies.length,
    rps: +(latencies.length / DURATION).toFixed(1),
    errors,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    meanStageMs: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, +mean(v).toFixed(1)])),
    under2sAtP95: percentile(latencies, 95) <= 2000,
  };
}

const report: Record<string, unknown[]> = {};
for (const mode of ['cold', 'warm'] as const) {
  const server = await startServer(mode === 'cold' ? { CACHE: 'off' } : {});
  try {
    if (mode === 'warm') for (const b of bodies) await fetch(`http://localhost:${PORT}/search`, { method: 'POST', body: b, headers: { 'content-type': 'application/json' } });
    else for (const b of bodies.slice(0, 10)) await fetch(`http://localhost:${PORT}/search`, { method: 'POST', body: b, headers: { 'content-type': 'application/json' } });
    report[mode] = [];
    for (const c of LEVELS) {
      const r = await level(c);
      report[mode]!.push(r);
      console.log(mode, JSON.stringify(r));
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));
  }
}
mkdirSync('results/bench', { recursive: true });
writeFileSync('results/bench/loadtest.json', JSON.stringify({ durationSeconds: DURATION, hardware: '4 vCPU / 15 GB; API, Postgres and models on the same machine', llmParse: true, rerank: false, report }, null, 1));
process.exit();
