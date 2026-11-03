import { z } from 'zod';

export const PORTALS = ['cars', 'homes', 'rentals', 'jobs', 'marketplace'] as const;
export type Portal = (typeof PORTALS)[number];

export const LANGS = ['de', 'en', 'fr', 'es', 'pl'] as const;
export type Lang = (typeof LANGS)[number];

/** Postgres text-search configuration per listing language. */
export const FTS_CONFIG: Record<Lang, string> = {
  de: 'german',
  en: 'english',
  fr: 'french',
  es: 'spanish',
  pl: 'simple',
};

export const FUELS = ['petrol', 'diesel', 'hybrid', 'electric'] as const;
export const BODIES = ['van', 'suv', 'sedan', 'hatchback', 'estate', 'pickup', 'coupe', 'convertible'] as const;
export const GEARBOXES = ['manual', 'automatic'] as const;
export const HOME_TYPES = ['apartment', 'house', 'townhouse'] as const;
export const SENIORITIES = ['junior', 'mid', 'senior', 'lead'] as const;
export const REMOTE = ['onsite', 'hybrid', 'remote'] as const;
export const CONTRACTS = ['full_time', 'part_time', 'contract'] as const;
export const CATEGORIES = ['electronics', 'furniture', 'bikes', 'fashion', 'sports', 'kids'] as const;
export const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;

const year = z.number().int().min(1950).max(2030);
const nonNegInt = z.number().int().nonnegative();

export const factsSchemas = {
  cars: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year,
    fuel: z.enum(FUELS),
    body: z.enum(BODIES),
    mileage_km: nonNegInt,
    gearbox: z.enum(GEARBOXES),
  }),
  homes: z.object({
    type: z.enum(HOME_TYPES),
    rooms: z.number().positive(),
    area_m2: z.number().positive(),
    year_built: z.number().int().min(1850).max(2030),
  }),
  rentals: z.object({
    type: z.enum(HOME_TYPES),
    rooms: z.number().positive(),
    area_m2: z.number().positive(),
    furnished: z.boolean(),
    available_from: z.iso.date(),
  }),
  jobs: z.object({
    role: z.string().min(1),
    seniority: z.enum(SENIORITIES),
    remote: z.enum(REMOTE),
    salary_min: nonNegInt,
    salary_max: nonNegInt,
    contract: z.enum(CONTRACTS),
  }),
  marketplace: z.object({
    category: z.enum(CATEGORIES),
    condition: z.enum(CONDITIONS),
    brand: z.string().min(1),
  }),
} as const;

export type FactsByPortal = { [P in Portal]: z.infer<(typeof factsSchemas)[P]> };
export type Facts<P extends Portal = Portal> = FactsByPortal[P];

/** One constraint on a fact: equality, or an inclusive numeric range. */
export interface FactConstraint {
  eq?: string | boolean;
  min?: number;
  max?: number;
}

/** Constraints a result must satisfy; never relaxed by ranking. */
export interface HardFilters {
  portal?: Portal;
  priceMaxMinor?: number;
  priceMinMinor?: number;
  geo?: { lat: number; lon: number; radiusKm: number };
  facts: Record<string, FactConstraint>;
}
