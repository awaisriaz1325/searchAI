import { matchesFilters, type HardFilters } from '@searchai/core';
import type { ListingRow } from './types.ts';

/**
 * Defence in depth: re-asserts every hard constraint on the final rows, in code, after SQL.
 * A row that fails is dropped and counted; the count is a metric that must stay at zero.
 */
export function postCheck(rows: ListingRow[], f: HardFilters): { kept: ListingRow[]; violations: number } {
  const kept = rows.filter((r) => matchesFilters(f, r));
  return { kept, violations: rows.length - kept.length };
}
