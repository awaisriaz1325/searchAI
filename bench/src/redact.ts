/** Replaces vector literals ('[0.1,0.2,...]') in EXPLAIN output so plans stay readable. */
export const redactVectors = (line: string) => line.replace(/'\[[^\]]*\]'/g, "'<query vector>'");
