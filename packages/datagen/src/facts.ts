import {
  BODIES,
  CATEGORIES,
  CONDITIONS,
  CONTRACTS,
  GEARBOXES,
  HOME_TYPES,
  REMOTE,
  SENIORITIES,
  type Facts,
  type Portal,
} from '@searchai/core';
import { CAR_MODELS, JOB_ROLES, MARKET_BRANDS } from './lexicon.ts';
import type { Rng } from './rng.ts';

export interface FactsAndPrice {
  facts: Facts;
  /** EUR, whole units. Cars/homes/marketplace: asking price. Rentals: monthly rent. Jobs: max annual salary. */
  priceEur: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

export function generateFacts(portal: Portal, rng: Rng): FactsAndPrice {
  switch (portal) {
    case 'cars': {
      const m = rng.pick(CAR_MODELS);
      const year = rng.int(2008, 2025);
      const age = 2026 - year;
      const mileage_km = roundTo(clamp(rng.normal(age * 15_000, age * 6_000 + 3_000), 0, 400_000), 500);
      const body = rng.pick(m.bodies) as (typeof BODIES)[number];
      const base = body === 'van' || body === 'pickup' ? 38_000 : body === 'hatchback' ? 24_000 : 42_000;
      const priceEur = roundTo(clamp(base * Math.pow(0.86, age) * (1 + rng.normal(0, 0.15)), 1_500, 120_000), 100);
      return {
        facts: {
          make: m.make,
          model: m.model,
          year,
          fuel: rng.pick(m.fuels) as Facts<'cars'>['fuel'],
          body,
          mileage_km,
          gearbox: rng.pick(GEARBOXES),
        },
        priceEur,
      };
    }
    case 'homes': {
      const type = rng.pick(HOME_TYPES);
      const rooms = type === 'apartment' ? rng.int(1, 5) : rng.int(3, 8);
      const area_m2 = roundTo(rooms * rng.int(18, 32), 1);
      const year_built = rng.int(1900, 2025);
      const priceEur = roundTo(area_m2 * rng.int(2_500, 9_000), 1_000);
      return { facts: { type, rooms, area_m2, year_built }, priceEur };
    }
    case 'rentals': {
      const type = rng.chance(0.8) ? 'apartment' : rng.pick(HOME_TYPES);
      const rooms = rng.chance(0.15) ? 1.5 : rng.int(1, type === 'apartment' ? 4 : 6);
      const area_m2 = roundTo(rooms * rng.int(20, 32), 1);
      const priceEur = roundTo(area_m2 * rng.int(11, 26), 10);
      const month = String(rng.int(1, 12)).padStart(2, '0');
      return {
        facts: { type, rooms, area_m2, furnished: rng.chance(0.35), available_from: `2027-${month}-01` },
        priceEur,
      };
    }
    case 'jobs': {
      const role = rng.pick(Object.keys(JOB_ROLES));
      const seniority = rng.pick(SENIORITIES);
      const base = { junior: 38_000, mid: 55_000, senior: 72_000, lead: 90_000 }[seniority];
      const salary_min = roundTo(base * (1 + rng.normal(0, 0.12)), 1_000);
      const salary_max = salary_min + roundTo(rng.int(5_000, 25_000), 1_000);
      return {
        facts: { role, seniority, remote: rng.pick(REMOTE), salary_min, salary_max, contract: rng.pick(CONTRACTS) },
        priceEur: salary_max,
      };
    }
    case 'marketplace': {
      const category = rng.pick(CATEGORIES);
      const condition = rng.pick(CONDITIONS);
      const base = { electronics: 450, furniture: 250, bikes: 600, fashion: 60, sports: 120, kids: 180 }[category];
      const priceEur = roundTo(clamp(base * (1 + rng.normal(0, 0.45)), 5, 4_000), 5);
      return { facts: { category, condition, brand: rng.pick(MARKET_BRANDS[category]!) }, priceEur };
    }
  }
}
