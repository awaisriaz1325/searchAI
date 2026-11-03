import { Hono } from 'hono';
import { z } from 'zod';
import { PORTALS } from '@searchai/core';
import type { Sql } from '@searchai/db';
import type { SearchFn } from '@searchai/search';
import { Metrics } from './metrics.ts';

export { Metrics };

const SearchBody = z.object({
  q: z.string().max(300),
  portal: z.enum(PORTALS).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  rerank: z.boolean().optional(),
});

export function buildApp(deps: { search: SearchFn; metrics: Metrics; sql: Sql }) {
  const app = new Hono();

  app.post('/search', async (c) => {
    const body = SearchBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid_request', issues: body.error.issues }, 400);
    try {
      return c.json(await deps.search(body.data));
    } catch (err) {
      console.error('search_failed', err instanceof Error ? err.message : err);
      return c.json({ error: 'search_failed' }, 500);
    }
  });

  app.get('/health', async (c) => {
    try {
      await deps.sql`SELECT 1`;
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  app.get('/metrics', (c) => c.text(deps.metrics.render(), 200, { 'content-type': 'text/plain; version=0.0.4' }));
  return app;
}
