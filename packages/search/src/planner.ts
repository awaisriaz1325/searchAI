import type { HardFilters } from '@searchai/core';
import type { Tx } from '@searchai/db';
import { filtersToSql } from './filters-sql.ts';

export interface Plan {
  kind: 'exact' | 'ann';
  /** Rows matching the hard filters, counted up to threshold + 1. */
  estimatedRows: number;
}

/** Counts survivors (capped) to choose exact ranking or an HNSW iterative scan. */
export async function planSearch(tx: Tx, f: HardFilters, threshold: number): Promise<Plan> {
  const [r] = await tx`SELECT count(*)::int AS n FROM (SELECT 1 FROM listings l WHERE ${filtersToSql(tx, f)} LIMIT ${threshold + 1}) s`;
  const n = r!.n as number;
  return { kind: n <= threshold ? 'exact' : 'ann', estimatedRows: n };
}
