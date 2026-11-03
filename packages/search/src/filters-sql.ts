import { factsSchemas, type HardFilters } from '@searchai/core';
import type { Tx } from '@searchai/db';
import type postgres from 'postgres';

/** Every fact field any portal defines. Field names are inlined into SQL, so only these pass. */
const KNOWN_FIELDS = new Set(Object.values(factsSchemas).flatMap((s) => Object.keys(s.shape)));
const INT_FIELDS = new Set(['mileage_km', 'year', 'year_built', 'salary_min', 'salary_max']);

/** WHERE clause for the hard filters on alias `l`. Values are always bound parameters. */
export function filtersToSql(sql: Tx | postgres.Sql, f: HardFilters): postgres.PendingQuery<postgres.Row[]> {
  const conds: postgres.PendingQuery<postgres.Row[]>[] = [sql`l.status = 'published'`];
  if (f.portal) conds.push(sql`l.portal = ${f.portal}`);
  if (f.priceMaxMinor !== undefined) conds.push(sql`l.price_minor <= ${f.priceMaxMinor}`);
  if (f.priceMinMinor !== undefined) conds.push(sql`l.price_minor >= ${f.priceMinMinor}`);
  if (f.geo) {
    const r = f.geo.radiusKm * 1000;
    conds.push(
      sql`earth_box(ll_to_earth(${f.geo.lat}, ${f.geo.lon}), ${r}) @> ll_to_earth(l.lat, l.lon)
          AND earth_distance(ll_to_earth(${f.geo.lat}, ${f.geo.lon}), ll_to_earth(l.lat, l.lon)) <= ${r}`,
    );
  }
  for (const [field, c] of Object.entries(f.facts)) {
    if (!KNOWN_FIELDS.has(field)) continue;
    const text = sql.unsafe(`(l.facts->>'${field}')`);
    const num = sql.unsafe(`((l.facts->>'${field}')::${INT_FIELDS.has(field) ? 'int' : 'numeric'})`);
    if (typeof c.eq === 'boolean') conds.push(sql`${text}::boolean = ${c.eq}`);
    else if (c.eq !== undefined) conds.push(sql`${text} = ${c.eq}`);
    if (c.min !== undefined) conds.push(sql`${num} >= ${c.min}`);
    if (c.max !== undefined) conds.push(sql`${num} <= ${c.max}`);
  }
  return conds.reduce((acc, c) => sql`${acc} AND ${c}`);
}
