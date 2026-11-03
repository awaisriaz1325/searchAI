import type { Facts, Lang, Portal } from '@searchai/core';
import { FACT_WORDS, FEATURES, JOB_ROLES, WORDS } from './lexicon.ts';
import type { Place } from './places.ts';
import type { Rng } from './rng.ts';

const THOUSANDS: Record<Lang, string> = { de: '.', en: ',', fr: ' ', es: '.', pl: ' ' };

export function formatNumber(n: number, lang: Lang): string {
  const [int, frac] = String(n).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS[lang]);
  if (frac === undefined) return grouped;
  return `${grouped}${lang === 'en' ? '.' : ','}${frac}`;
}

/** Money in the conventions of the language, sometimes in "25k" shorthand. */
export function formatMoney(eur: number, lang: Lang, rng: Rng): string {
  const short = eur >= 1_000 && eur % 1_000 === 0 && rng.chance(0.15);
  const num = short ? `${eur / 1_000}k` : formatNumber(eur, lang);
  if (lang === 'en') return `€${num}`;
  if (lang === 'pl' && rng.chance(0.5)) return `${num} EUR`;
  return `${num} €`;
}

/** Indexes into FEATURES.jobs: skills that fit each role. */
const ROLE_SKILLS: Record<string, number[]> = {
  'software engineer': [0, 2, 1],
  'data engineer': [1, 3, 0],
  accountant: [5],
  nurse: [6],
  'sales manager': [7],
  'support agent': [4],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A word for a fact value; `variant` 0 is the plain form, higher picks a synonym. */
export function factWord(key: string, lang: Lang, variant: number): string {
  const words = FACT_WORDS[key]?.[lang];
  if (!words?.length) return key.split(':')[1]!.replace('_', ' ');
  return words[Math.min(variant, words.length - 1)]!;
}

function features(portal: Portal, lang: Lang, rng: Rng, n: number): string {
  return rng.shuffle([...FEATURES[portal][lang]]).slice(0, n).join(', ');
}

export interface RenderedText {
  title: string;
  description: string;
}

/** Renders facts to free text. About 1 in 10 listings leaves one fact out of the text. */
export function renderListing(
  portal: Portal,
  facts: Facts,
  priceEur: number,
  lang: Lang,
  place: Place,
  rng: Rng,
): RenderedText {
  const city = place.display[lang] ?? place.name;
  const v = () => (rng.chance(0.3) ? 1 : 0);
  const money = formatMoney(priceEur, lang, rng);
  const omit = rng.chance(0.1) ? rng.int(0, 2) : -1;
  const keep = (i: number, s: string) => (i === omit ? '' : s);

  switch (portal) {
    case 'cars': {
      const f = facts as Facts<'cars'>;
      const make = f.make === 'volkswagen' && rng.chance(0.4) ? 'VW' : cap(f.make);
      const fuel = factWord(`fuel:${f.fuel}`, lang, v());
      const body = factWord(`body:${f.body}`, lang, v());
      const gear = factWord(`gearbox:${f.gearbox}`, lang, 0);
      const km = `${formatNumber(f.mileage_km, lang)} km`;
      const feats = features(portal, lang, rng, 3);
      const t = {
        en: [`${make} ${cap(f.model)} ${f.year}, ${fuel} ${body}`, `${f.year} ${make} ${f.model}. ${keep(0, `${cap(fuel)}, `)}${keep(1, `${gear} gearbox, `)}${keep(2, `${km} on the clock. `)}${cap(feats)}. Located in ${city}. Asking ${money}.`],
        de: [`${make} ${cap(f.model)} ${cap(body)} ${cap(fuel)} ${f.year}`, `Baujahr ${f.year}. ${keep(0, `${cap(fuel)}, `)}${keep(1, `${cap(gear)}, `)}${keep(2, `Laufleistung ${km}. `)}${cap(feats)}. Standort ${city}. Preis ${money} VB.`],
        fr: [`${make} ${cap(f.model)} ${body} ${fuel} ${f.year}`, `Année ${f.year}. ${keep(0, `Moteur ${fuel}, `)}${keep(1, `boîte ${gear}, `)}${keep(2, `${km} au compteur. `)}${cap(feats)}. Visible à ${city}. Prix ${money}.`],
        es: [`${make} ${cap(f.model)} ${body} ${fuel} ${f.year}`, `Año ${f.year}. ${keep(0, `Motor ${fuel}, `)}${keep(1, `cambio ${gear}, `)}${keep(2, `${km}. `)}${cap(feats)}. En ${city}. Precio ${money}.`],
        pl: [`${make} ${cap(f.model)} ${body} ${fuel} ${f.year}`, `Rok ${f.year}. ${keep(0, `Silnik ${fuel}, `)}${keep(1, `skrzynia ${gear}, `)}${keep(2, `przebieg ${km}. `)}${cap(feats)}. Lokalizacja ${city}. Cena ${money}.`],
      }[lang];
      return { title: t[0]!, description: t[1]! };
    }
    case 'homes': {
      const f = facts as Facts<'homes'>;
      const type = factWord(`type:${f.type}`, lang, v());
      const rooms = formatNumber(f.rooms, lang);
      const area = `${formatNumber(f.area_m2, lang)} m²`;
      const feats = features(portal, lang, rng, 3);
      const t = {
        en: [`${rooms}-room ${type} in ${city}`, `${cap(type)} for sale: ${keep(0, `${rooms} rooms, `)}${keep(1, `${area}, `)}${keep(2, `built ${f.year_built}. `)}${cap(feats)}. Price ${money}.`],
        de: [`${rooms}-Zimmer-${cap(type)} in ${city}`, `${cap(type)} zu verkaufen: ${keep(0, `${rooms} Zimmer, `)}${keep(1, `${area} Wohnfläche, `)}${keep(2, `Baujahr ${f.year_built}. `)}${cap(feats)}. Kaufpreis ${money}.`],
        fr: [`${cap(type)} ${rooms} pièces à ${city}`, `${cap(type)} à vendre : ${keep(0, `${rooms} pièces, `)}${keep(1, `${area}, `)}${keep(2, `construit en ${f.year_built}. `)}${cap(feats)}. Prix ${money}.`],
        es: [`${cap(type)} de ${rooms} habitaciones en ${city}`, `${cap(type)} en venta: ${keep(0, `${rooms} habitaciones, `)}${keep(1, `${area}, `)}${keep(2, `construido en ${f.year_built}. `)}${cap(feats)}. Precio ${money}.`],
        pl: [`${cap(type)} ${rooms} pokoje, ${city}`, `${cap(type)} na sprzedaż: ${keep(0, `${rooms} pokoje, `)}${keep(1, `${area}, `)}${keep(2, `rok budowy ${f.year_built}. `)}${cap(feats)}. Cena ${money}.`],
      }[lang];
      return { title: t[0]!, description: t[1]! };
    }
    case 'rentals': {
      const f = facts as Facts<'rentals'>;
      const type = factWord(`type:${f.type}`, lang, v());
      const furn = factWord(`furnished:${f.furnished}`, lang, 0);
      const rooms = formatNumber(f.rooms, lang);
      const area = `${formatNumber(f.area_m2, lang)} m²`;
      const per = WORDS.perMonth[lang][0]!;
      const feats = features(portal, lang, rng, 2);
      const t = {
        en: [`${cap(furn)} ${rooms}-room ${type} to rent, ${city}`, `${keep(0, `${area}, `)}${keep(1, `${furn}, `)}available from ${f.available_from}. ${cap(feats)}. Rent ${money} ${per}.`],
        de: [`${cap(furn)}e ${rooms}-Zimmer-${cap(type)} zur Miete, ${city}`, `${keep(0, `${area}, `)}${keep(1, `${furn}, `)}frei ab ${f.available_from}. ${cap(feats)}. Miete ${money} ${per}.`],
        fr: [`${cap(type)} ${furn} ${rooms} pièces à louer, ${city}`, `${keep(0, `${area}, `)}${keep(1, `${furn}, `)}disponible le ${f.available_from}. ${cap(feats)}. Loyer ${money} ${per}.`],
        es: [`${cap(type)} ${furn} de ${rooms} habitaciones en alquiler, ${city}`, `${keep(0, `${area}, `)}${keep(1, `${furn}, `)}disponible desde ${f.available_from}. ${cap(feats)}. Alquiler ${money} ${per}.`],
        pl: [`${cap(type)} ${rooms} pokoje na wynajem, ${city}`, `${keep(0, `${area}, `)}${keep(1, `${furn}, `)}dostępne od ${f.available_from}. ${cap(feats)}. Czynsz ${money} ${per}.`],
      }[lang];
      return { title: t[0]!, description: t[1]! };
    }
    case 'jobs': {
      const f = facts as Facts<'jobs'>;
      const role = JOB_ROLES[f.role]![lang][0]!;
      const sen = factWord(`seniority:${f.seniority}`, lang, 0);
      const remote = factWord(`remote:${f.remote}`, lang, v());
      const contract = factWord(`contract:${f.contract}`, lang, 0);
      const range = `${formatMoney(f.salary_min, lang, rng)} – ${formatMoney(f.salary_max, lang, rng)}`;
      const sal = WORDS.salary[lang][0]!;
      const skills = ROLE_SKILLS[f.role]!.map((i) => FEATURES.jobs[lang][i]!).slice(0, 2).join(', ');
      const t = {
        en: [`${cap(sen)} ${role} (${remote}), ${city}`, `We are hiring a ${sen} ${role}. ${keep(0, `${cap(contract)}, `)}${keep(1, `${remote}. `)}Skills: ${skills}. ${keep(2, `${cap(sal)} ${range} per year.`)}`],
        de: [`${cap(sen)} ${cap(role)} (${remote}), ${city}`, `Wir suchen: ${sen} ${role}. ${keep(0, `${cap(contract)}, `)}${keep(1, `${remote}. `)}Kenntnisse: ${skills}. ${keep(2, `${cap(sal)} ${range} jährlich.`)}`],
        fr: [`${cap(role)} ${sen} (${remote}), ${city}`, `Nous recrutons un ${role} ${sen}. ${keep(0, `${cap(contract)}, `)}${keep(1, `${remote}. `)}Compétences : ${skills}. ${keep(2, `${cap(sal)} ${range} par an.`)}`],
        es: [`${cap(role)} ${sen} (${remote}), ${city}`, `Buscamos ${role} ${sen}. ${keep(0, `${cap(contract)}, `)}${keep(1, `${remote}. `)}Habilidades: ${skills}. ${keep(2, `${cap(sal)} ${range} al año.`)}`],
        pl: [`${cap(role)} ${sen} (${remote}), ${city}`, `Zatrudnimy: ${role} ${sen}. ${keep(0, `${cap(contract)}, `)}${keep(1, `${remote}. `)}Umiejętności: ${skills}. ${keep(2, `${cap(sal)} ${range} rocznie.`)}`],
      }[lang];
      return { title: t[0]!, description: t[1]! };
    }
    case 'marketplace': {
      const f = facts as Facts<'marketplace'>;
      const item = factWord(`category:${f.category}`, lang, rng.int(0, 1));
      const cond = factWord(`condition:${f.condition}`, lang, 0);
      const feats = features(portal, lang, rng, 2);
      const t = {
        en: [`${cap(f.brand)} ${item}, ${cond}`, `${keep(0, `${cap(cond)}. `)}${cap(feats)}. Pickup in ${city}. ${money}.`],
        de: [`${cap(f.brand)} ${cap(item)}, ${cond}`, `${keep(0, `${cap(cond)}. `)}${cap(feats)}. Abholung in ${city}. ${money}.`],
        fr: [`${cap(item)} ${cap(f.brand)}, ${cond}`, `${keep(0, `${cap(cond)}. `)}${cap(feats)}. À ${city}. ${money}.`],
        es: [`${cap(item)} ${cap(f.brand)}, ${cond}`, `${keep(0, `${cap(cond)}. `)}${cap(feats)}. En ${city}. ${money}.`],
        pl: [`${cap(item)} ${cap(f.brand)}, ${cond}`, `${keep(0, `${cap(cond)}. `)}${cap(feats)}. Odbiór ${city}. ${money}.`],
      }[lang];
      return { title: t[0]!, description: t[1]! };
    }
  }
}
