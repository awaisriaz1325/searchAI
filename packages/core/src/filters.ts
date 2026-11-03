import type { HardFilters, Portal } from './portals.ts';

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export interface FilterableListing {
  portal: Portal;
  priceMinor: number;
  lat: number;
  lon: number;
  facts: Record<string, unknown>;
}

/**
 * True when a listing satisfies every hard constraint. A constrained fact that is missing
 * fails: an unknown mileage is not "under 100,000 km". Shared by the label generator and
 * the search post-check, so both agree on what "satisfies the filters" means.
 */
export function matchesFilters(f: HardFilters, l: FilterableListing): boolean {
  if (f.portal && l.portal !== f.portal) return false;
  if (f.priceMaxMinor !== undefined && l.priceMinor > f.priceMaxMinor) return false;
  if (f.priceMinMinor !== undefined && l.priceMinor < f.priceMinMinor) return false;
  if (f.geo && haversineKm(f.geo.lat, f.geo.lon, l.lat, l.lon) > f.geo.radiusKm) return false;
  for (const [field, c] of Object.entries(f.facts)) {
    const value = l.facts[field];
    if (value === undefined || value === null) return false;
    if (c.eq !== undefined && value !== c.eq) return false;
    if (c.min !== undefined && !(typeof value === 'number' && value >= c.min)) return false;
    if (c.max !== undefined && !(typeof value === 'number' && value <= c.max)) return false;
  }
  return true;
}
