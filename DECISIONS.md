# Decisions

Each entry: what was decided, why, and the measurement behind it where there is one.
Hardware for all measurements: 4 vCPU / 15 GB RAM cloud container, no GPU.

## 2026-11-03: Embedding model: multilingual-e5-small, fp32, CPU

- One model for all five languages; 384 dimensions keep the 2M-row index small (stored as `halfvec`, 2 bytes per dimension).
- e5 needs `query: ` / `passage: ` prefixes; the embedder adds them, callers never do.
- Measured: 1,000 listings (title + description) embedded in 11.2 s, **89 listings/s**, batch 32.
  Embedding all 2M listings with it would take about 6.2 hours on this machine, which is why the
  2M benchmark uses vectors derived from these real ones instead (see the benchmark entry).
- Each row stores the model name and a version (first 12 hex chars of the ONNX file's sha256),
  so `reembedStale` can find vectors from an older model.

## 2026-11-03: Query parser runs before any model

- The deterministic parser (dictionaries in five languages, locale number formats, a city table,
  one-edit typo tolerance) turns most queries into hard filters in under a millisecond.
- Measured on the 200 golden queries: **0.995 exact match** of parsed filters.
  This is optimistic: the parser and the data generator share one vocabulary, so the
  test set contains no words the parser has never seen. Real member queries will score lower;
  the LLM fallback exists for what the dictionaries miss.

## 2026-11-03: LLM extraction measured against a rule baseline, and the rules won

Qwen2.5-0.5B-Instruct (4-bit, CPU) extracted typed facts from all 1,000 listings
(`results/extraction-1k.json`): 99.8% schema-valid JSON, 3.7 s and ~207 tokens per listing.

| portal | LLM micro-F1 | regex baseline micro-F1 |
|---|---|---|
| cars | 0.760 | 0.916 |
| homes | 0.839 | 0.989 |
| rentals | 0.764 | 0.830 |
| jobs | 0.595 | 0.904 |
| marketplace | 0.583 | 0.800 |

The baseline is the query parser run over the listing text (plus make and year regexes),
with precision 1.0 on every portal. Two caveats cut in opposite directions:
- The baseline shares the generator's vocabulary, so this is its best case. Real listings
  with unseen wording would pull its recall down; the LLM degrades more gracefully there.
- A 0.5B model is the smallest that runs here at all. Observed failure modes: it reads
  "400.000 km" as the JSON number `400.000` (= 400), guesses a wrong make when the title
  says "VW", and maps "Transporter" to `sedan`.

Decision: extraction stays **rules first, LLM for the fields rules leave empty**, the same
shape as query parsing. Next step (not done): a thousands-separator check against the source
text, and a larger model or a hosted one behind the same `Llm` interface, measured on this set.

## 2026-11-03: The selective 2M query is heap-bound, and a covering expression index does not fix it

"diesel van under €25,000 near Hamburg, under 100,000 km" matches 511 of 2M listings. The plan
(`results/bench/strategies.json`) uses `listings_cars_hot` (fuel, body, mileage expression index),
reads 34,426 candidate rows from the heap, and filters price and distance there: about 126 of
130 ms. Two experiments, both reverted:

- A second expression index ending in `price_minor`: the planner kept the old index (no change).
- A covering index with `INCLUDE (id, price_minor, lat, lon)`: still an Index Scan, not an Index
  Only Scan, at 200-230 ms, and 27 MB against 3.4 MB. Postgres does not plan index-only scans when
  the query's conditions are expressions over a column (`facts->>'fuel'`) that is not itself in the
  index.

Conclusion: at this scale, hot filters belong in typed (generated) columns, which allow composite
B-trees and index-only scans. `bench/src/jsonb-vs-column.ts` measures that trade.

## 2026-11-03: ANN recall at 2M is not measurable on derived vectors, and the README says so

On the 2M set, the HNSW paths return results 11-16% farther than the exact top 20 (distance
ratio) on the broad scenarios. To find out why (`results/bench/ef-sweep.json`, cars ≤ €60k,
380k eligible rows):

- `ef_search` 40 → 1000 with m=16: recall (within 0.01 cosine distance of the exact 20th) goes
  0.22 → 0.26 and then stops moving.
- Rebuilt with m=32, ef_construction=200 (159 s vs 52 s, 521 MB vs 468 MB): 0.34 → 0.37, still a plateau.
- `iterative_scan` relaxed_order, strict_order and off: identical recall.

A plateau that a bigger search budget cannot move means the true neighbours are unreachable in the
graph, not merely unvisited. The cause is how the 2M vectors were made: about 2,000 noisy copies of
each of the 1,000 real embeddings. HNSW's neighbour pruning on such dense near-duplicate clusters
leaves poorly linked islands. Real listings are not 2,000 copies of each other.

What stands: latency, plan choice, index build time/size, and the filter strategy comparison
(post-filtering an HNSW top-40 returns 0 of 20 rows on the selective query, at any data shape).
What does not: absolute ANN recall at 2M. Measuring it needs 2M distinct real embeddings:
~6.2 h on this CPU, or about $4 at Voyage list price.

## 2026-11-03: Hot filters: promote to typed columns once a portal is large

`results/bench/jsonb-vs-column.json`, 2M rows, "cars, diesel, mileage ≤ X" (≈68k matching rows):

| index | p50 | p95 | plan | size |
|---|---|---|---|---|
| partial expression index on `facts` jsonb | 52.9 ms | 100.5 ms | Index Scan, heap fetches | 3.6 MB |
| generated typed columns + B-tree | **4.5 ms** | 8.6 ms | Index Only Scan, 0 heap fetches | 2.9 MB |

Cost: adding two stored generated columns rewrote the 2M-row table in 226 s (plus a VACUUM, without
which the rewrite leaves no visibility map and the typed index is *slower*, 104 ms; caught in a
first run and fixed). Decision: facts stay in `jsonb` (one schema for 20+ portals, no migration per
new field), and each portal's two or three hottest filters get typed generated columns once traffic
justifies a rewrite. This repo keeps the jsonb indexes so the app's default schema stays one shape.

## 2026-11-03: Exact/ANN planner threshold stays at 20,000

Measured exact ranking cost at 2M: 135,652 survivors in 732 ms p50, about 5.4 µs per survivor, so
20,000 survivors ≈ 110 ms. Below that, exact ranking is both exact and inside budget. The plan was to
set the threshold where ANN reaches recall ≥ 0.95; that crossover cannot be measured credibly on the
derived vectors (previous entry), so the threshold is set by the latency budget alone.
