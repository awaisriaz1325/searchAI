export interface SearchConfig {
  /** Survivors at or below this are ranked exactly; above it, by HNSW iterative scan. */
  exactThreshold: number;
  efSearch: number;
  maxScanTuples: number;
  /** Candidates each leg returns before fusion. */
  candidateK: number;
  defaultLimit: number;
  rrfK: number;
  rerankTop: number;
  llmParseTimeoutMs: number;
}

export const DEFAULT_CONFIG: SearchConfig = {
  exactThreshold: 20_000,
  efSearch: 100,
  maxScanTuples: 20_000,
  candidateK: 50,
  defaultLimit: 20,
  rrfK: 60,
  rerankTop: 30,
  llmParseTimeoutMs: 800,
};
