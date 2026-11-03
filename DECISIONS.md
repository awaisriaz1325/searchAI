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
