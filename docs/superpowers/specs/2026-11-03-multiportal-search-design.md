# multiportal-search: design

Date: 2026-11-03. Status: draft, awaiting approval.

## Intent

A public portfolio repo for Awais's application to an "AI Search & Data Engineer" role. The client runs 20+ marketplace portals (cars, homes, rentals, jobs, a general marketplace) on one Postgres database, and their AI layer has to "find the right answer, every time". The repo must read as if it were the first month of that job, built in their stack, with **every claim backed by a number the reader can reproduce**.

The reader is a technical founder skimming a GitHub link from an Upwork proposal. They will look at the README first, then the numbers, then one or two source files. The README has to answer their screening questions on its own: how retrieval was measured and with what results, how a filtered multilingual query gets answered under 2 s at 2M listings, when a vector index is the wrong tool, and what each search costs.

## Goals

1. **One library, five portals.** Cars, homes, rentals, jobs and marketplace listings share one `listings` table, one search API and one eval harness. Portal-specific facts live in typed JSON validated per portal.
2. **Hybrid search.** Exact filters (SQL), multilingual keyword search (Postgres FTS + trigram), semantic search (pgvector), fused, then reranked.
3. **Multilingual.** Listings and queries in German, English, French, Spanish and Polish (my call: the client's example query uses €/Hamburg, and these five cover the likely EU markets). Cross-language retrieval: a German query finds an English listing.
4. **Query understanding.** Free text → structured filters + semantic remainder. A deterministic parser runs first; a local LLM with schema-validated JSON output handles what the parser can't, under a hard timeout.
5. **LLM structured extraction.** Listing free text → typed facts per portal, using a local LLM. Measured field by field against ground truth.
6. **Evaluation set per portal, scored every night.** A GitHub Actions schedule. It fails on regression against a committed baseline.
7. **Latency.** Under 2 s from request to results, measured per stage (p50/p95/p99), at 2M listings, under concurrency.
8. **Cost per search.** Every search reports model calls, tokens, DB time and CPU time. Converted to dollars with a configurable price table for the hosted-API equivalents (Voyage, Qwen API), clearly labelled as an estimate.
9. **Index health.** Embedding model/version tracked per row, re-embed job, sampled ANN-vs-exact recall check, index size and build time reported.

## Non-goals

- No UI or live hosted demo (Awais: repo for now).
- No paid or hosted model APIs (Awais: free for now). Provider interfaces exist so Voyage, Claude or Qwen-API adapters can be added later. None are implemented.
- No image understanding. The job mentions images, but a free local vision model on 4 CPUs is out of scope. Listed in the README as next work.
- No real-world scraped data. All data is generated (see Data).
- No auth system, payments or multi-region deployment.

## Anti-goals (would make this a failure even if it works)

- **A number the reader cannot reproduce**, or one whose data source is unclear. Every table in the README states: real model or synthetic, row count, hardware, pgvector version, and the command that produced it.
- **Quality claims from synthetic vectors.** Quality numbers come only from the 1,000-listing set with real models. The 2M set is for latency and index behaviour only.
- **An LLM in the per-row loop**, or deciding prices and distances. LLMs only parse the query at the start and extract facts at ingest.
- **Silent failure.** A filtered ANN query that returns fewer rows than asked, a model timeout, or a cache miss storm must show up in metrics, never just as worse results.
- **Hard-constraint violations in results.** A result above the user's max price is a bug, not a ranking issue. This is measured as its own metric and must be 0.
- **Overclaiming.** Nothing says "production ready". Limits are stated plainly, like in the first demo repo.

## Constraints

- Free only: open models running locally on CPU (4 vCPU, 15 GB RAM in the build environment).
- **Real models run on 1,000 listings** (Awais's call), both the embedding model and the extraction LLM.
- TypeScript throughout (approach A, below).
- Postgres features must exist on Supabase: pgvector, `cube`/`earthdistance`, `pg_trgm`, RLS, Supabase-style roles.
- **Environment blockers:**
  - Hugging Face downloads are currently denied by the build environment's network policy. Awais is asked to allow-list it, and model work waits on that.
  - pgvector ≥ 0.8 (needed for `halfvec` and iterative index scans) comes from the `pgvector/pgvector:0.8.x` Docker image. The Docker daemon must be started in the build environment. If that fails, building pgvector from source needs Awais's explicit permission.

## Approaches considered

| | Approach | Tradeoff |
|---|---|---|
| **A (picked)** | All TypeScript: Drizzle, a Node HTTP API, transformers.js for both local models | Matches the client's stack exactly; TS ML tooling is thinner, so some things take more work |
| B | Python, like the first demo | Fastest to build, richest ML tools; reads as "Python person" for a TS job |
| C | TS API + Python offline jobs | Realistic in industry; two languages, muddier signal |

Awais picked **A**, because the point is to look like he already works in their codebase.

## Design

### Repo layout (npm workspaces)

```
packages/db       Drizzle schema, SQL migrations (indexes, RLS, roles), seed loaders
packages/ml       transformers.js wrappers: embedder (multilingual-e5-small, 384-dim),
                  extractor (Qwen2.5-0.5B-Instruct, ONNX q4), optional reranker
packages/search   query parser, LLM parse fallback, planner (exact vs ANN), legs, fusion,
                  rerank, cache, cost meter, stage timings
packages/datagen  seeded multilingual listing + query generator with ground-truth facts
packages/eval     golden sets per portal, metrics, nightly runner, baseline compare
apps/api          HTTP server (Hono): POST /search, GET /health, GET /metrics
bench             2M-row load, latency/recall benchmarks, concurrency load test
docker-compose    postgres (pgvector 0.8, pg17) + redis
.github/workflows ci.yml (lint, typecheck, unit tests), nightly-eval.yml (cron)
```

### Data model

- `listings`:
  - **common columns:** id, `portal` (enum), owner_id, status (`draft` / `published`), title, description, `lang`, price_minor + currency, lat/lon, created_at.
  - **`facts jsonb`:** portal-specific, validated by a zod schema per portal:
    - cars: make, model, year, fuel, body, mileage_km, gearbox
    - homes: rooms, area_m2, type, year_built
    - rentals: monthly_rent, rooms, furnished, available_from
    - jobs: title, salary range, remote, seniority, contract
    - marketplace: category, condition, brand
  - **`fts tsvector`:** generated from title + description using the listing's language config (german / english / french / spanish / simple for Polish), plus a `simple` config vector so cross-language exact tokens (brand names) still match.
- `listing_embeddings`: listing_id, model, model_version, `embedding halfvec(384)`, embedded_at. A separate table, so re-embedding and model swaps don't rewrite listings.
- **Indexes:**
  - B-tree on `(portal, status, price_minor)`.
  - Partial expression indexes for hot facts per portal, e.g. `((facts->>'fuel'))` WHERE portal='cars'.
  - GIN `jsonb_path_ops` on facts.
  - GIN on fts.
  - GiST `ll_to_earth(lat, lon)` for radius.
  - `pg_trgm` on title.
  - **HNSW partial per portal** (`WHERE portal = 'cars'`), so one portal's filter never post-filters another portal's neighbours.
- **The benchmark compares** jsonb expression indexes vs typed columns for one hot filter, and one global HNSW vs per-portal partial HNSW, and reports both.
- **RLS:**
  - Supabase-style roles `anon` and `authenticated`, with an `auth.uid()` stub.
  - Search runs as `anon` and sees only `published` rows; owners see their drafts.
  - A test proves drafts never leak through any search leg, the cache included.

### Search path

1. **Normalize:** detect the language, normalize units and numbers ("100.000 km", "100k km", "€25k").
2. **In parallel:**
   - (a) deterministic parser: regex + multilingual dictionaries + city gazetteer table.
   - (b) embed the query.
   - (c) LLM parse, only if (a) leaves unparsed constraint-like tokens. Hard timeout (default 800 ms); zod-validated; on timeout or invalid output, use (a) alone and record that in metrics.
3. **Plan:**
   - Estimate survivors of the hard filters (a capped count).
   - Below a threshold (tuned by benchmark, starting at 20k): exact distance over survivors.
   - Above it: HNSW with `hnsw.iterative_scan = relaxed_order` and a tuned `ef_search`.
   - The chosen plan is recorded per request.
4. **Legs in parallel** (separate pool connections): vector leg and keyword leg (FTS in the detected language + simple, trigram fallback), both under the same hard filters.
5. **Fuse** with RRF.
6. **Rerank:** optional, local multilingual cross-encoder on the top 30, measured on/off. Only when the query has semantic remainder.
7. **Post-check:** re-assert hard constraints on the final rows (defence in depth). A violation is counted and the row dropped.
8. **Cache:**
   - **Results:** Redis keyed by normalized query + portal + filters + role, short TTL.
   - **Parse results and query embeddings:** cached longer.
   - Behind an interface: `ioredis` locally, with the Upstash REST client noted as the production adapter (my call: Upstash's REST API can't be run locally without an extra container).
9. **Response** includes results, applied filters, plan, stage timings and a cost breakdown.

### Data

- **The generator** builds listings from facts first, then renders them to free text in the 5 languages, using varied templates, synonyms, unit formats, typos and missing fields. Ground truth is therefore known exactly.
- **The real-model set:** 1,000 listings across the 5 portals and languages, embedded with multilingual-e5-small and extracted with Qwen2.5-0.5B.
- **The 2M scale set:**
  - Facts and text come from the same generator.
  - Vectors are produced by perturbing the 1,000 real embeddings: nearest real neighbour + noise, re-normalized. They inherit the real distribution's shape instead of the isotropic noise that made the first demo's ANN recall pessimistic.
  - The README states this method.

### Evaluation

- **Golden queries:** about 40 per portal (200 total), spread across languages and categories:
  - pure filter, filter + semantic, paraphrase, cross-language, typo, and impossible (zero true results; must return nothing or say so).
- **Relevance labels** come from the generator's facts:
  - hard constraints define the eligible set;
  - semantic intent is graded 0–3 by rule-based matching on facts.
- **Search metrics, per portal and per category:**
  - nDCG@10, recall@20, MRR;
  - zero-result rate on answerable queries;
  - **hard-constraint violation rate** (must be 0);
  - impossible-query accuracy.
- **Extraction metrics:**
  - field-level precision, recall and F1 per portal, against the generator's facts;
  - the LLM compared against the deterministic-parser baseline;
  - schema-valid rate.
- **Query-parse metrics:** exact-match of parsed filters vs labelled filters, LLM vs parser alone.
- **Nightly job:**
  - a GitHub Actions cron runs the eval on the 1,000-listing set (models cached between runs);
  - it writes `results/nightly/<date>.json` and a markdown trend table;
  - it fails if any metric drops more than a set tolerance below `results/baseline.json`.
- **Separately:** a sampled ANN-vs-exact recall check on the 2M set runs as part of the benchmark.

### Benchmarks (2M listings)

- Load time, and index build time and size per index.
- Filtered-search strategies across selectivities, on pgvector 0.8: prefilter-exact, HNSW post-filter, HNSW iterative scan, per-portal partial HNSW. Reported as p50/p95, rows returned and recall@20 vs exact.
- jsonb expression index vs typed column for one hot filter.
- End-to-end `/search` latency per stage at concurrency 1, 8 and 32 (autocannon), cache cold vs warm.
- `EXPLAIN (ANALYZE, BUFFERS)` for each scenario, saved with query vectors redacted.

### Cost per search

- **Measured per request:** model calls, input tokens, model CPU ms, DB ms, cache hit/miss.
- **Converted with `config/prices.json`:** what the same calls would cost on Voyage embeddings / rerank and a Qwen or Claude API, plus amortized DB cost. Labelled as an estimate with the price date.
- **Reported:** cost per 1,000 searches, and how caching and the parser-first design reduce it.

### Quality bar

- **Tooling:** TypeScript strict, ESLint, Prettier, Vitest.
- **Unit tests:** parser, fusion, planner thresholds, metrics.
- **Integration tests:** against the Docker Postgres (RLS leak test, constraint post-check).
- **CI:** lint, typecheck and unit tests on push, with integration tests in the same workflow using a Postgres service container.
- **Docs:** README with an architecture diagram (mermaid), result tables, the reproduce commands, and a "limits" section. `DECISIONS.md` records each tradeoff with its measurement.

## Decided

- Repo only, no UI (Awais).
- Free only, local models (Awais).
- Real models on 1,000 listings; synthetic scale to 2M (Awais).
- TypeScript, approach A (Awais).

## My calls (Awais can override)

- Repo name `searchAI` (Awais created it at github.com/awaisriaz1325/searchAI).
- Languages de/en/fr/es/pl.
- Models: multilingual-e5-small (embedding), Qwen2.5-0.5B-Instruct (extraction, query parse). Reranker optional and measured.
- `cube`/`earthdistance` instead of PostGIS (fewer extensions, same radius behaviour for this purpose).
- `ioredis` locally behind a cache interface; Upstash adapter documented, not built.
- Postgres 17 + pgvector 0.8 via Docker.

- **Facts on the 1,000 set:** search runs twice, once over LLM-extracted facts (end-to-end) and once over the generator's true facts (retrieval only), and both are reported. The post-check uses the extracted facts. Violations are measured against the true facts and shown separately, so extraction errors are visible, not hidden. The 2M set uses true facts.
- **Latency target:** p95 ≤ 2 s at concurrency 8 on the 4 vCPU / 15 GB machine, LLM-parse path included. Concurrency 32 is reported as measured, pass or fail.
- **Currency:** all generated prices are EUR. Multi-currency is listed as a limit.
- **Nightly job:** re-runs the search and query-parse evals over stored embeddings and facts. Extraction re-runs only when the model or prompt hash changes. Runs on GitHub-hosted runners with a Postgres service container and an Actions cache for models.
- **Roles:** search runs as `anon` only. The `authenticated` role exists for the RLS leak test, and no owner search endpoint is built.
- **Order of work:** everything that doesn't need models is built first. Model work starts once Hugging Face is allow-listed.

## Left to the builder

- Exact template wording and synonym lists in the generator.
- Planner threshold value (set from benchmark data).
- Regression tolerances for the nightly job.
- Module boundaries inside each package.
- Which mermaid diagrams to draw.
