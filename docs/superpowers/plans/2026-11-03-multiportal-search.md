# searchAI (multiportal search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public TypeScript repo with one hybrid search layer over five marketplace portals: measured quality on 1,000 real-model listings, measured latency and index behaviour at 2M listings, and a cost figure for every search.

**Architecture:** npm workspaces:
- `core`: shared types and zod schemas.
- `db`: Drizzle + raw SQL migration, RLS.
- `datagen`: seeded generator with ground truth.
- `ml`: transformers.js models.
- `search`: parse → plan → parallel legs → RRF → rerank → post-check.
- `eval`: metrics, nightly runner.
- `apps/api`: Hono.
- `bench`: 2M benchmarks.

Postgres 17 + pgvector 0.8 and Redis run in Docker.

**Tech Stack:** Node 22, TypeScript 7.0.2 (strict), drizzle-orm 0.45.4, drizzle-kit 0.31.11, postgres (postgres.js) 4.0.0, pgvector 0.3.0, hono 4.13.16, @hono/node-server 2.1.6, zod 4.6.7, ioredis 6.0.0, @huggingface/transformers 4.3.2, vitest 5.1.0, tsx 4.23.15, autocannon 8.0.0, eslint 10.14.0. Image `pgvector/pgvector:0.8.0-pg17`, `redis:7.4-alpine`.

**Spec:** `docs/superpowers/specs/2026-11-03-multiportal-search-design.md`

## Global Constraints

- Free only. No hosted model APIs. Models: `Xenova/multilingual-e5-small` (384-dim, prefixes `query: ` / `passage: `), `onnx-community/Qwen2.5-0.5B-Instruct` (q4), optional reranker `Xenova/bge-reranker-base`. Swap to a multilingual reranker only if the benchmark shows it helps.
- Languages: `de`, `en`, `fr`, `es`, `pl`. FTS configs: german, english, french, spanish, simple (pl).
- Portals: `cars`, `homes`, `rentals`, `jobs`, `marketplace`.
- Prices: all EUR, stored as `price_minor` (integer cents).
- Data sizes: real models on exactly 1,000 listings (200 per portal, 40 per language per portal). Scale set: 2,000,000 listings.
- Quality numbers come only from the 1,000 set. 2M numbers are latency and index behaviour only. Every README table states: data source, rows, hardware, pgvector version, and the command that produced it.
- Search runs as Postgres role `anon` only. Results contain only `status = 'published'` rows.
- The LLM never runs per result row and never decides prices or distances.
- Latency target: p95 ≤ 2000 ms at concurrency 8 on 4 vCPU / 15 GB, with the LLM-parse path included. Concurrency 32 is reported as measured.
- LLM query parse timeout defaults to 800 ms. Planner exact/ANN threshold starts at 20,000 survivors and is set from bench data.
- Hard-constraint violation rate in final results must be 0, measured against the facts search used. Violations vs true facts are reported separately.
- EXPLAIN output is saved with vector literals replaced by `'<query vector>'`.
- No claims of production readiness. A README "Limits" section is required.
- Environment: Docker needs `dockerd` started in the build container. If it can't start, stop and ask Awais before building pgvector from source.
- Commits end with the session attribution lines. Push to `main` on `github.com/awaisriaz1325/searchAI`.

## Review Focus

- **Locale number formats.** "25.000 €" (de), "25,000" (en), "25k", "€25 000", "100.000 km". Each must parse to the same value, and "2,5 Zimmer" must parse as 2.5 rooms. → Task 4 test `parses locale numbers`.
- **Zero eligible rows** for hard filters (e.g. an EV under €1,000). The response must be empty with `reason: 'no_match_for_filters'`, never the nearest wrong listings. → Task 7 test `returns empty with reason when filters match nothing`.
- **Model failure.** The LLM returns invalid JSON, times out, or the model fails to load. Search still answers via the parser, and `stageMs.llmParse` / `degraded: ['llm_parse_timeout']` record it. → Task 9 test `falls back to parser on timeout`.
- **Unknown or ambiguous terms.** An unknown city, or "golf" (car model vs sport item). An unknown city produces no geo filter plus `unparsed: ['<city>']`, never a silent default. Portal ambiguity searches all portals unless the request pins one. → Task 4 tests `unknown city is reported unparsed` and `ambiguous term does not force portal`.
- **Injection through query text.** Quotes, `;`, `%`, `\` must never reach SQL unparameterized. → Task 7 test `query text with SQL metacharacters is parameterized`.

---

### Task 1: Workspace scaffold, core types, CI

**Files:**
- Create: `package.json` (workspaces `packages/*`, `apps/*`, `bench`), `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.nvmrc` (22), `vitest.workspace.ts`
- Create: `packages/core/src/portals.ts`, `packages/core/src/index.ts`
- Create: `.github/workflows/ci.yml`
- Test: `packages/core/test/portals.test.ts`

**Interfaces:**
- Produces:
  - `type Portal = 'cars'|'homes'|'rentals'|'jobs'|'marketplace'`, `PORTALS: readonly Portal[]`
  - `type Lang = 'de'|'en'|'fr'|'es'|'pl'`, `LANGS`, `FTS_CONFIG: Record<Lang, string>`
  - `factsSchemas: Record<Portal, z.ZodObject>`, `type Facts<P extends Portal>`
  - `interface HardFilters { portal?: Portal; priceMaxMinor?: number; priceMinMinor?: number; geo?: {lat: number; lon: number; radiusKm: number}; facts: Record<string, {eq?: string|boolean; min?: number; max?: number}> }`
- Facts fields per portal:
  - cars: make, model, year, fuel(`petrol|diesel|hybrid|electric`), body(`van|suv|sedan|hatchback|estate|pickup|coupe|convertible`), mileage_km, gearbox(`manual|automatic`)
  - homes: type(`apartment|house|townhouse`), rooms, area_m2, year_built
  - rentals: type, rooms, area_m2, furnished, available_from (ISO date)
  - jobs: role, seniority(`junior|mid|senior|lead`), remote(`onsite|hybrid|remote`), salary_min, salary_max, contract(`full_time|part_time|contract`)
  - marketplace: category(`electronics|furniture|bikes|fashion|sports|kids`), condition(`new|like_new|good|fair`), brand

- [ ] **Step 1: Write failing test.** `portals.test.ts`:
  - `factsSchemas.cars.parse({make:'volkswagen',model:'transporter',year:2019,fuel:'diesel',body:'van',mileage_km:90000,gearbox:'manual'})` succeeds;
  - `factsSchemas.cars.safeParse({fuel:'steam'}).success === false`;
  - `PORTALS.length === 5`, `FTS_CONFIG.pl === 'simple'`.
- [ ] **Step 2: Run** `npx vitest run packages/core`. Expect FAIL (module missing).
- [ ] **Step 3: Implement** `portals.ts` with zod schemas exactly as listed above.
- [ ] **Step 4: Run** `npx vitest run packages/core`. Expect PASS. Run `npx tsc -b` and `npx eslint .` cleanly.
- [ ] **Step 5: CI.** `ci.yml` runs on push: `npm ci`, `tsc -b`, `eslint .`, `vitest run` (unit), then the integration job with a `pgvector/pgvector:0.8.0-pg17` service container running `vitest run --project integration`.
- [ ] **Step 6: Commit** `chore: scaffold workspace, core portal schemas, CI`. Include the spec and this plan.

### Task 2: Database schema, migration, RLS, Docker

**Files:**
- Create: `docker-compose.yml` (postgres 17 + pgvector 0.8 on 5433; redis on 6380; postgres command flags `shared_buffers=2GB maintenance_work_mem=2GB max_parallel_maintenance_workers=3 work_mem=64MB`)
- Create: `packages/db/migrations/0001_init.sql`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/migrate.ts`
- Test: `packages/db/test/rls.integration.test.ts`

**Interfaces:**
- Produces:
  - `createSql(url: string): postgres.Sql`
  - `asRole<T>(sql, role: 'anon'|'authenticated', uid: string|null, fn: (tx) => Promise<T>): Promise<T>` (runs `SET LOCAL ROLE` and `set_config('request.jwt.claim.sub', uid, true)` in one transaction)
  - `migrate(url): Promise<void>`
  - Drizzle tables `listings`, `listingEmbeddings`, `places`
- Migration 0001 must create:
  - extensions `vector`, `cube`, `earthdistance`, `pg_trgm`;
  - roles `anon`, `authenticated` (NOLOGIN), schema `auth` with `auth.uid()` reading `request.jwt.claim.sub`;
  - enum `portal`;
  - table `listings(id bigint PK, portal, owner_id uuid, status text check in ('draft','published'), title, description, lang text, price_minor bigint, currency char(3) default 'EUR', lat, lon, facts jsonb, facts_source text check in ('truth','extracted'), created_at)`;
  - generated `fts tsvector` = `setweight(to_tsvector(lang_cfg, title),'A') || setweight(to_tsvector(lang_cfg, description),'B') || to_tsvector('simple', title)`, where `lang_cfg` comes from an IMMUTABLE function `fts_config(lang text) returns regconfig`;
  - `listing_embeddings(listing_id PK FK, model text, model_version text, embedding halfvec(384), embedded_at)`;
  - `places(name_norm text PK, lat, lon, country)`.
- Indexes:
  - btree `(portal, status, price_minor)`;
  - partial btree `((facts->>'fuel'), (facts->>'body'), ((facts->>'mileage_km')::int)) WHERE portal='cars'`;
  - GIN `facts jsonb_path_ops`; GIN `fts`; GiST `ll_to_earth(lat, lon)`; GIN trgm on title.
- RLS:
  - enabled on `listings` and `listing_embeddings`;
  - policy anon SELECT `status='published'`;
  - authenticated SELECT `status='published' OR owner_id = auth.uid()`;
  - embeddings policy via `EXISTS` on a visible listing.
- HNSW indexes are **not** in 0001. They are created per portal after load by `packages/db/src/indexes.ts` (Task 6).

- [ ] **Step 1: Start Docker.** Start `dockerd` in the background if `docker info` fails, then `docker compose up -d`. Check that `SELECT extversion FROM pg_extension WHERE extname='vector'` gives `0.8.0` after migrate. If dockerd can't start, stop and report.
- [ ] **Step 2: Write failing integration test** `rls.integration.test.ts`:
  - insert one published and one draft listing with embeddings;
  - as `anon`: `SELECT count(*) FROM listings` = 1, `SELECT count(*) FROM listing_embeddings` = 1;
  - as `authenticated` with the draft's owner uid: 2; with another uid: 1;
  - as anon, `ORDER BY embedding <=> $1 LIMIT 10` returns only the published id.
- [ ] **Step 3: Run** `npx vitest run --project integration packages/db`. Expect FAIL.
- [ ] **Step 4: Implement** the migration, schema, client and `asRole`. Grant SELECT on the tables to anon and authenticated.
- [ ] **Step 5: Run** the integration test. Expect PASS.
- [ ] **Step 6: Commit** `feat(db): schema, RLS roles and policies, docker compose`.

### Task 3: Multilingual data generator with ground truth

**Files:**
- Create: `packages/datagen/src/rng.ts`, `facts.ts`, `render.ts`, `lexicon.ts`, `places.ts`, `queries.ts`, `cli.ts`
- Test: `packages/datagen/test/datagen.test.ts`

**Interfaces:**
- Consumes: `Portal`, `Lang`, `factsSchemas`, `HardFilters` (Task 1).
- Produces:
  - `interface GeneratedListing { id: number; portal: Portal; lang: Lang; title: string; description: string; priceMinor: number; lat: number; lon: number; facts: Facts; status: 'published'|'draft'; ownerId: string }`
  - `generateListings(opts: {seed: number; count: number; startId?: number}): Iterable<GeneratedListing>` (round-robin portal × lang; 5% drafts)
  - `PLACES: {name: string; aliases: string[]; lat; lon; country}[]` (≥ 30 EU cities with local names, e.g. Hamburg / Hambourg / Hamburgo, München / Munich / Monachium)
  - `interface GoldenQuery { id: string; portal: Portal|null; lang: Lang; text: string; category: 'filter'|'filter_semantic'|'paraphrase'|'cross_language'|'typo'|'impossible'; filters: HardFilters; intent: {field: string; values: string[]}[] }`
  - `generateGoldenQueries(seed): GoldenQuery[]` (exactly 40 per portal)
  - `relevance(q: GoldenQuery, l: GeneratedListing): 0|1|2|3` (0 if any hard filter fails; else 1 + number of intent matches, capped at 3)
- Rendering must vary:
  - number formats per lang ("25.000 €", "€25,000", "25k €", "25 000 zł-free EUR"-style spacing for pl/fr);
  - synonyms from `lexicon.ts` (e.g. van: Transporter / Kastenwagen / fourgon / furgoneta / dostawczy);
  - unit spellings ("km", "Tkm", "000 km");
  - 10% of listings omit one fact from the text;
  - 3% typos in queries of category `typo`.

- [ ] **Step 1: Write failing tests:**
  - the same seed gives identical first 50 listings;
  - 1,000 listings give 200 per portal and 40 per (portal, lang);
  - every `facts` passes `factsSchemas[portal]`;
  - `generateGoldenQueries(1).filter(q => q.portal==='cars').length === 40`;
  - every non-impossible golden query has ≥ 1 listing with relevance ≥ 1 in `generateListings({seed:1,count:1000})`, and every `impossible` query has 0.
- [ ] **Step 2: Run** `npx vitest run packages/datagen`. Expect FAIL.
- [ ] **Step 3: Implement.** Use a seeded PRNG (mulberry32) in `rng.ts`. The CLI writes `data/listings-1k.jsonl`, `data/golden-queries.json` and `data/places.json`, all committed.
- [ ] **Step 4: Run tests.** Expect PASS. Run `npx tsx packages/datagen/src/cli.ts --count 1000 --seed 1` to produce the data files.
- [ ] **Step 5: Commit** `feat(datagen): seeded multilingual listings and labeled golden queries`.

### Task 4: Deterministic query parser

**Files:**
- Create: `packages/search/src/parse/normalize.ts`, `numbers.ts`, `dictionary.ts`, `parse.ts`
- Test: `packages/search/test/parse.test.ts`

**Interfaces:**
- Consumes: `HardFilters`, `Portal`, `Lang` (Task 1); `PLACES`, `lexicon` (Task 3).
- Produces:
  - `interface ParsedQuery { lang: Lang; portal: Portal|null; filters: HardFilters; semantic: string; unparsed: string[]; confidence: number }`
  - `parseQuery(text: string, opts?: {portal?: Portal}): ParsedQuery`
  - `detectLang(text): Lang` (stop-word scoring over the 5 langs, default `en`)
  - `parseNumber(token: string, lang: Lang): number|null`
- Default geo radius when a city is named: 50 km.

- [ ] **Step 1: Write failing tests:**
  - `parseQuery('diesel van under €25,000 near Hamburg, under 100,000 km')` gives portal `cars`, `priceMaxMinor 2_500_000`, `facts.fuel.eq 'diesel'`, `facts.body.eq 'van'`, `facts.mileage_km.max 100000`, geo near (53.55, 9.99) with radius 50;
  - the German equivalent `'Diesel Transporter bis 25.000 € bei Hamburg unter 100.000 km'` gives the same filters and lang `de`;
  - `parses locale numbers`: '25.000 €'(de) / '25,000'(en) / '25k' / '€25 000'(fr) all give 25000; '2,5 Zimmer'(de) gives rooms 2.5;
  - `unknown city is reported unparsed`: 'van near Atlantis' gives no geo, and `unparsed` includes 'atlantis';
  - `ambiguous term does not force portal`: 'golf' gives portal null;
  - `''` and `'   '` give empty filters, `semantic ''`, no throw;
  - on the 200 golden queries, exact-match of parsed filters ≥ 0.80 (measured; record the actual value in the test output).
- [ ] **Step 2: Run** `npx vitest run packages/search -t parse`. Expect FAIL.
- [ ] **Step 3: Implement.** The parse removes matched spans from the text, so the remainder becomes `semantic`. `confidence` = matched constraint tokens / constraint-like tokens.
- [ ] **Step 4: Run tests.** Expect PASS.
- [ ] **Step 5: Commit** `feat(search): deterministic multilingual query parser`.

### Task 5: Local embedder

**Files:**
- Create: `packages/ml/src/embedder.ts`, `packages/ml/src/models.ts`
- Test: `packages/ml/test/embedder.model.test.ts` (vitest project `model`, skipped when `SKIP_MODELS=1`)

**Interfaces:**
- Produces:
  - `interface Embedder { model: string; version: string; dim: 384; embed(texts: string[], kind: 'query'|'passage'): Promise<Float32Array[]> }`
  - `createE5Embedder(opts?: {batchSize?: number}): Promise<Embedder>` (pipeline `feature-extraction`, mean pooling, normalize, prefix `query: ` / `passage: `; `version` = the model revision hash)
  - `MODEL_CACHE_DIR = process.env.MODEL_CACHE ?? '.models'`

- [ ] **Step 1: Write failing test:**
  - output length 384, L2 norm ≈ 1 (±1e-3);
  - cosine('query: diesel van', 'passage: Diesel Transporter, 90.000 km') > cosine('query: diesel van', 'passage: Dreizimmerwohnung mit Balkon').
- [ ] **Step 2: Run** `npx vitest run --project model packages/ml`. Expect FAIL.
- [ ] **Step 3: Implement.** Batch default 32. Record texts/sec in the log.
- [ ] **Step 4: Run.** Expect PASS. Note the measured throughput in `DECISIONS.md`.
- [ ] **Step 5: Commit** `feat(ml): local multilingual-e5 embedder`.

### Task 6: Ingest pipeline and per-portal HNSW

**Files:**
- Create: `packages/db/src/ingest.ts`, `packages/db/src/indexes.ts`, `packages/db/src/cli-ingest.ts`
- Test: `packages/db/test/ingest.integration.test.ts`

**Interfaces:**
- Consumes: `GeneratedListing` (Task 3), `Embedder` (Task 5), `createSql`, `migrate` (Task 2).
- Produces:
  - `ingestListings(sql, listings: AsyncIterable<GeneratedListing>|Iterable<GeneratedListing>, opts: {embedder?: Embedder; vectorsFor?: (l) => Float32Array; factsSource: 'truth'|'extracted'; factsOverride?: Map<number, Facts>; batch?: number}): Promise<{rows: number; ms: number}>` (COPY-based; embeds `title + '\n' + description` as passage)
  - `buildVectorIndexes(sql, opts: {perPortal: boolean; m?: 16; efConstruction?: 64}): Promise<Record<string, {ms: number; bytes: number}>>` (per-portal partial HNSW `USING hnsw (embedding halfvec_cosine_ops) WHERE` via a `portal` column copied into `listing_embeddings`; add that column in this task's migration `0002_embedding_portal.sql`)
  - `reembedStale(sql, embedder): Promise<number>` (rows whose `model_version` ≠ the embedder's)

- [ ] **Step 1: Write failing integration test:**
  - ingest 50 generated listings with a fake embedder (deterministic vectors);
  - `count(*)` = 50; `buildVectorIndexes(perPortal: true)` creates 5 indexes, listed in `pg_indexes`;
  - `reembedStale` with a fake embedder of a different version returns 50.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** CLI: `npm run ingest -- --file data/listings-1k.jsonl --real-embeddings`.
- [ ] **Step 4: Run test.** Expect PASS. Run the CLI on the 1k set with the real embedder. Record the ms in `DECISIONS.md`.
- [ ] **Step 5: Commit** `feat(db): ingest pipeline, per-portal HNSW, re-embed job`.

### Task 7: Search core: planner, legs, fusion, post-check, cost

**Files:**
- Create: `packages/search/src/filters-sql.ts`, `planner.ts`, `legs.ts`, `fusion.ts`, `postcheck.ts`, `cost.ts`, `search.ts`, `config.ts`
- Test: `packages/search/test/fusion.test.ts`, `postcheck.test.ts`, `packages/search/test/search.integration.test.ts`

**Interfaces:**
- Consumes: `ParsedQuery`, `parseQuery` (Task 4); `Embedder` (Task 5); `asRole` (Task 2).
- Produces:
  - `filtersToSql(sql, f: HardFilters): postgres.Fragment` (parameterized only)
  - `planSearch(sql, f): Promise<{kind: 'exact'|'ann'; estimatedRows: number}>` (capped count `SELECT count(*) FROM (SELECT 1 ... LIMIT threshold+1)`)
  - `vectorLeg(sql, f, qvec, plan, k): Promise<Hit[]>`: exact = materialized CTE then order; ann = `SET LOCAL hnsw.iterative_scan = relaxed_order`, `hnsw.ef_search = config.efSearch` (default 100), and `hnsw.max_scan_tuples`.
  - `keywordLeg(sql, f, text, lang, k): Promise<Hit[]>`: `websearch_to_tsquery(fts_config(lang), text) || websearch_to_tsquery('simple', text)`, `ts_rank_cd`; trigram fallback when FTS returns < 5.
  - `rrf(lists: Hit[][], k = 60): Hit[]`
  - `postCheck(rows: ListingRow[], f): {kept: ListingRow[]; violations: number}`
  - `interface CostMeter { add(stage: string, ms: number, usage?: {modelCalls?: number; tokens?: number}): void; report(prices: Prices): CostReport }`
  - `interface SearchRequest { q: string; portal?: Portal; limit?: number; rerank?: boolean }`
  - `interface SearchResponse { results: ListingRow[]; appliedFilters: HardFilters; parsed: ParsedQuery; plan; stageMs: Record<string, number>; cost: CostReport; degraded: string[]; reason?: 'no_match_for_filters' }`
  - `createSearch(deps: {sql; embedder; llmParser?; reranker?; cache?; prices; config}): (req: SearchRequest) => Promise<SearchResponse>`
- Legs run concurrently with `Promise.all`, each on its own pooled connection inside `asRole('anon')`. The embedding runs concurrently with the deterministic parse.

- [ ] **Step 1: Write failing unit tests:**
  - `rrf` ranks an item at rank 2 in both lists above one at rank 1 in one list;
  - `postCheck` drops a row with price above `priceMaxMinor` and counts 1 violation.
- [ ] **Step 2: Write failing integration tests** (1k set ingested with a fake embedder; real embedder in the `model` project):
  - the Hamburg query returns ≤ 20 results, all satisfying the filters, `plan.kind === 'exact'`;
  - `returns empty with reason when filters match nothing`: 'electric van under €1,000' gives `results []`, `reason 'no_match_for_filters'`;
  - `query text with SQL metacharacters is parameterized`: `"van'; DROP TABLE listings; --"` returns normally and the `listings` count is unchanged;
  - drafts never appear;
  - `stageMs` has keys `parse`, `embed`, `plan`, `vector`, `keyword`, `fuse`, `postcheck`.
- [ ] **Step 3: Run.** Expect FAIL.
- [ ] **Step 4: Implement.** `config/prices.json` holds Voyage embed and rerank $/1M tokens, a Qwen API $/1M in/out, a DB $/vCPU-hour, and a `priced_at` date. Copy current list prices with their source URL in a `source` field. Token count = model tokenizer length.
- [ ] **Step 5: Run.** Expect PASS.
- [ ] **Step 6: Commit** `feat(search): planner, parallel hybrid legs, RRF, post-check, cost meter`.

### Task 8: Cache and HTTP API

**Files:**
- Create: `packages/search/src/cache.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/metrics.ts`
- Test: `apps/api/test/api.integration.test.ts`, `packages/search/test/cache.test.ts`

**Interfaces:**
- Consumes: `createSearch`, `SearchRequest`, `SearchResponse` (Task 7).
- Produces:
  - `interface Cache { get<T>(key): Promise<T|null>; set(key, value, ttlSec): Promise<void> }`
  - `createRedisCache(url)`, `createMemoryCache()`
  - `cacheKey(parts: {kind: 'result'|'parse'|'embed'; norm: string; portal?; filters?; role: 'anon'}): string` (sha256 of a stable JSON)
  - TTLs: result 60 s, parse and embed 24 h. Cache failures are logged and counted as `degraded: ['cache_error']`, never thrown.
  - `buildApp(deps): Hono` with:
    - `POST /search` (zod-validated body; `q` ≤ 300 chars; 400 on invalid);
    - `GET /health`;
    - `GET /metrics` (Prometheus text: request count, stage histograms, cache hit ratio, degraded counts, violations).

- [ ] **Step 1: Write failing tests:**
  - `cacheKey` is stable across object key order;
  - a second identical request gives `stageMs.cache === 'hit'` path with no embed call (spy);
  - `POST /search {q: ''}` returns 200 with empty results; `{q: 'x'.repeat(301)}` returns 400;
  - `/metrics` contains `search_requests_total`.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expect PASS. `npm run dev -w apps/api` serves on :8787.
- [ ] **Step 5: Commit** `feat(api): Hono search API, Redis cache, metrics`.

### Task 9: LLM extraction and LLM query-parse fallback

**Files:**
- Create: `packages/ml/src/llm.ts`, `packages/ml/src/extract.ts`, `packages/ml/src/llm-parse.ts`, `packages/eval/src/extraction-eval.ts`
- Test: `packages/ml/test/extract.test.ts` (with a fake LLM), `packages/ml/test/llm.model.test.ts`

**Interfaces:**
- Produces:
  - `interface Llm { model: string; generate(prompt: string, opts: {maxTokens: number; timeoutMs: number}): Promise<{text: string; tokensIn: number; tokensOut: number; ms: number}> }`
  - `createQwenLlm(): Promise<Llm>` (greedy decoding)
  - `extractFacts(llm, portal, text): Promise<{facts: Partial<Facts>; valid: boolean; retries: number; ms: number; tokensIn: number; tokensOut: number}>` (prompt includes the portal's JSON shape and allowed enum values; parse the first JSON object; zod `.partial()` validate; 1 retry with the error message on invalid)
  - `createLlmParser(llm, timeoutMs = 800): (text, parsed: ParsedQuery) => Promise<{filters: HardFilters; timedOut: boolean; ms: number; tokens: number}>` (called by `createSearch` only when `parsed.confidence < 1` and `unparsed.length > 0`; merges only fields the parser left empty)
  - `runExtractionEval(llm, listings): Promise<ExtractionReport>`: per portal and field precision / recall / F1, schema-valid rate, mean ms; and the same for a regex baseline `extractFactsRegex(portal, text)` built from Task 4's parser.
  - The CLI writes `results/extraction-1k.json` and `data/facts-extracted-1k.jsonl`, stamped with `model` and `promptHash`.

- [ ] **Step 1: Write failing tests (fake LLM):**
  - invalid JSON then valid on retry gives `valid true, retries 1`;
  - an enum outside the allowed values gives the field dropped and `valid false` if nothing remains;
  - `falls back to parser on timeout`: a fake LLM that sleeps 2 s with `timeoutMs` 800 gives `timedOut true`, and `createSearch` returns results with `degraded` containing `'llm_parse_timeout'` within 1,200 ms.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** Model test: extract from one known German car listing; ≥ 4 of 7 fields correct.
- [ ] **Step 4: Run** all tests. Expect PASS. Run the extraction CLI on 1k listings in the background and record the totals in `DECISIONS.md`.
- [ ] **Step 5: Commit** `feat(ml): local LLM fact extraction and query-parse fallback with timeout`.

### Task 10: Optional reranker

**Files:**
- Create: `packages/ml/src/reranker.ts`
- Test: `packages/ml/test/reranker.model.test.ts`

**Interfaces:**
- Produces:
  - `interface Reranker { model: string; score(query: string, docs: string[]): Promise<number[]> }`
  - `createCrossEncoder(): Promise<Reranker>`
- `createSearch` applies it to the top 30 only when `req.rerank !== false` and `parsed.semantic.trim().length > 0`.

- [ ] **Step 1: Write failing model test.** A relevant doc scores higher than an irrelevant one for an English pair.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run.** Expect PASS.
- [ ] **Step 4: Commit** `feat(ml): optional cross-encoder rerank`.

### Task 11: Search eval and nightly workflow

**Files:**
- Create: `packages/eval/src/metrics.ts`, `run.ts`, `compare.ts`, `report.ts`
- Create: `.github/workflows/nightly-eval.yml`
- Create: `results/baseline.json` (from the first full run)
- Test: `packages/eval/test/metrics.test.ts`, `compare.test.ts`

**Interfaces:**
- Consumes: `generateGoldenQueries`, `relevance` (Task 3); `createSearch` (Task 7).
- Produces:
  - `ndcgAt(k, rels: number[], ideal: number[]): number`, `recallAt(k, retrieved: number[], relevantIds: Set<number>)`, `mrr(...)`
  - `runSearchEval(search, queries, listings, opts: {factsSource: 'truth'|'extracted'; rerank: boolean}): Promise<EvalReport>`. Per portal × category: nDCG@10, recall@20, MRR, zero-result rate (answerable), impossible accuracy, violations vs used facts, violations vs true facts, p50/p95 latency, cost per 1k searches. Also parse exact-match, parser vs parser+LLM.
  - `compareToBaseline(current, baseline, tolerance = {ndcg: 0.02, recall: 0.02, violations: 0}): {ok: boolean; regressions: string[]}`
  - `npm run eval` writes `results/nightly/<YYYY-MM-DD>.json` and `results/nightly/README.md` (trend table, last 14 runs).

- [ ] **Step 1: Write failing tests:**
  - `ndcgAt(3,[3,2,0],[3,2,1])` ≈ 0.9532 (±1e-3);
  - `compareToBaseline` flags a 0.03 nDCG drop, accepts a 0.01 drop, and flags any violation > 0.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** Run the matrix truth / extracted × rerank on / off on the 1k set. Commit the baseline.
- [ ] **Step 4: Nightly workflow.**
  - cron `17 2 * * *`;
  - Postgres service; `actions/cache` keyed on model ids for `.models`;
  - ingest 1k with real embeddings, run the eval, `compareToBaseline` (fails the job on regression);
  - commit `results/nightly/*` via `GITHUB_TOKEN` with `contents: write`.
  - Extraction re-runs only if `promptHash` or model differs from `data/facts-extracted-1k.jsonl`.
- [ ] **Step 5: Run** `npm run eval` locally. Expect `ok: true` against the fresh baseline.
- [ ] **Step 6: Commit** `feat(eval): per-portal golden eval, baseline compare, nightly workflow`.

### Task 12: 2M scale benchmark

**Files:**
- Create: `bench/src/load-2m.ts`, `bench/src/strategies.ts`, `bench/src/jsonb-vs-column.ts`, `bench/src/redact.ts`
- Test: `bench/test/redact.test.ts`, `bench/test/perturb.test.ts`

**Interfaces:**
- Consumes: `generateListings` (Task 3), `ingestListings`, `buildVectorIndexes` (Task 6), `filtersToSql`, `vectorLeg` (Task 7).
- Produces:
  - `perturbFrom(realVecs: Float32Array[], rng, sigma = 0.15): (l: GeneratedListing) => Float32Array` (picks a real vector of the same portal, adds Gaussian noise, re-normalizes)
  - `redactVectors(line: string): string`
  - CLI `npm run bench:load -- --rows 2000000` writes `results/bench/load.json` (rows, load s, per-index build s and size).
  - CLI `npm run bench:strategies` writes `results/bench/strategies.json` and `.md`:
    - scenarios selective (the Hamburg query), medium (cars diesel ≤ €25k), broad (cars ≤ €60k), cross-portal (homes ≤ €400k);
    - strategies prefilter_exact, hnsw_postfilter(ef 40), hnsw_iterative(relaxed_order, ef 100), per-portal partial HNSW vs global HNSW, planner;
    - p50/p95, rows returned, recall@20 vs exact; 50 queries per cell, warm;
    - redacted `EXPLAIN (ANALYZE, BUFFERS)` per scenario.
  - CLI `npm run bench:jsonb` compares the jsonb expression index vs a typed column for `mileage_km`.

- [ ] **Step 1: Write failing tests:**
  - `redactVectors("... '[0.1,0.2]'::halfvec ...")` contains `'<query vector>'` and no digits inside brackets;
  - a perturbed vector has norm ≈ 1 and cosine to its source > 0.8.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** and run the load, then the strategies, in the background. Set `config.exactThreshold` from the crossover where prefilter_exact p95 exceeds hnsw_iterative p95 at recall ≥ 0.95. Record the reasoning in `DECISIONS.md`.
- [ ] **Step 4: Run tests.** Expect PASS. Check that the result files exist and that the Hamburg scenario's recall@20 is reported for every strategy.
- [ ] **Step 5: Commit** `feat(bench): 2M listings, filtered-vector strategies, jsonb vs column`.

### Task 13: End-to-end load test and cost report

**Files:**
- Create: `bench/src/loadtest.ts`, `bench/src/cost-report.ts`

**Interfaces:**
- Consumes: `buildApp` (Task 8), the golden query texts (Task 3), the 2M DB (Task 12).
- Produces:
  - `npm run bench:load-test` runs autocannon against `/search` at concurrency 1, 8 and 32, for 60 s each, with the cache cold (flushed, unique queries) and warm. It writes `results/bench/loadtest.json` (p50/p95/p99, RPS, errors, mean `stageMs` from responses).
  - `npm run cost` writes `results/cost.md`: per-search model calls and tokens and DB ms; the $ estimate per 1k searches via `config/prices.json`; and the effect of the cache hit ratio and the parser-first rate.

- [ ] **Step 1: Run** the load test against a server on the 2M DB with the real embedder and LLM-parse enabled.
- [ ] **Step 2: Verify.** `loadtest.json` shows p95 at concurrency 8 and whether it is ≤ 2000 ms. If it fails, profile with `stageMs`, fix the top stage, and re-run. Report honestly either way.
- [ ] **Step 3: Commit** `feat(bench): concurrency load test and cost per search report`.

### Task 14: README, DECISIONS, final verification, push

**Files:**
- Create: `README.md`, `DECISIONS.md` (accumulated across tasks), `LICENSE` (MIT)

- [ ] **Step 1: Write the README:**
  - one-paragraph pitch;
  - a mermaid diagram of the search path;
  - "Results" tables pulled from the `results/*` files (quality on the 1k set, extraction, parse, 2M strategies, load test, cost), each with source / rows / hardware / pgvector version / command;
  - "When a vector index is the wrong tool" (from bench data);
  - "Reproduce";
  - "Limits" (synthetic data, small models, EUR only, no images, CPU only, n of runs).
- [ ] **Step 2: Verify.** `npm ci && npx tsc -b && npx eslint . && npx vitest run` (unit + integration). Check that every number in the README matches its results file (spot-check script `scripts/check-readme-numbers.ts` that greps each cited number from the JSON).
- [ ] **Step 3: Commit** `docs: README with measured results, decisions log`, then `git push -u origin main`.
