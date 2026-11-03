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
