import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import type { CachePort } from './search.ts';

export const TTL = { result: 60, parse: 86_400, embed: 86_400 } as const;

const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)]))
      : v;

/** sha256 of a key-order-independent JSON of the parts. Role is part of every key. */
export function cacheKey(parts: {
  kind: 'result' | 'parse' | 'embed';
  norm: string;
  role: 'anon';
  portal?: string;
  filters?: unknown;
  limit?: number;
  rerank?: boolean;
}): string {
  return `sai:${parts.kind}:${createHash('sha256').update(JSON.stringify(stable(parts))).digest('hex').slice(0, 32)}`;
}

/** Lowercased, trimmed, single-spaced: "  Diesel  Kombi " and "diesel kombi" share a cache entry. */
export const normalizeQuery = (q: string) => q.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');

/** In-process cache for tests and single-node dev. */
export function createMemoryCache(now: () => number = Date.now): CachePort {
  const store = new Map<string, { value: unknown; expires: number }>();
  return {
    async get<T>(key: string) {
      const e = store.get(key);
      if (!e) return null;
      if (e.expires <= now()) {
        store.delete(key);
        return null;
      }
      return structuredClone(e.value) as T;
    },
    async set(key, value, ttlSec) {
      store.set(key, { value: structuredClone(value), expires: now() + ttlSec * 1000 });
    },
  };
}

/** Redis-backed cache (local Redis here; Upstash's REST client fits the same two methods in production). */
export function createRedisCache(url: string): CachePort & { close(): Promise<void> } {
  const redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on('error', () => {}); // surfaced per call as cache_error, never crashes the process
  return {
    async get<T>(key: string) {
      const v = await redis.get(key);
      return v === null ? null : (JSON.parse(v) as T);
    },
    async set(key, value, ttlSec) {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    },
    async close() {
      await redis.quit();
    },
  };
}
