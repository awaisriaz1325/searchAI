export interface Place {
  /** Canonical lowercase key. */
  name: string;
  /** Every lowercase spelling a listing or query may use, including the canonical one. */
  aliases: string[];
  /** Display name per language for rendering; falls back to the first alias. */
  display: Partial<Record<'de' | 'en' | 'fr' | 'es' | 'pl', string>>;
  lat: number;
  lon: number;
  country: string;
}

const p = (
  name: string,
  lat: number,
  lon: number,
  country: string,
  display: Place['display'],
  extra: string[] = [],
): Place => ({
  name,
  lat,
  lon,
  country,
  display,
  aliases: [...new Set([name, ...Object.values(display).map((d) => d!.toLowerCase()), ...extra])],
});

/** 36 EU cities with their local and foreign names. */
export const PLACES: Place[] = [
  p('hamburg', 53.55, 9.99, 'DE', { de: 'Hamburg', en: 'Hamburg', fr: 'Hambourg', es: 'Hamburgo', pl: 'Hamburg' }),
  p('berlin', 52.52, 13.405, 'DE', { de: 'Berlin', en: 'Berlin', fr: 'Berlin', es: 'Berlín', pl: 'Berlin' }, ['berlin']),
  p('munich', 48.137, 11.575, 'DE', { de: 'München', en: 'Munich', fr: 'Munich', es: 'Múnich', pl: 'Monachium' }, ['muenchen', 'munchen']),
  p('cologne', 50.938, 6.96, 'DE', { de: 'Köln', en: 'Cologne', fr: 'Cologne', es: 'Colonia', pl: 'Kolonia' }, ['koeln', 'koln']),
  p('frankfurt', 50.11, 8.682, 'DE', { de: 'Frankfurt', en: 'Frankfurt', fr: 'Francfort', es: 'Fráncfort', pl: 'Frankfurt' }),
  p('stuttgart', 48.776, 9.183, 'DE', { de: 'Stuttgart', en: 'Stuttgart', fr: 'Stuttgart', es: 'Stuttgart', pl: 'Stuttgart' }),
  p('dusseldorf', 51.227, 6.773, 'DE', { de: 'Düsseldorf', en: 'Dusseldorf', fr: 'Düsseldorf', es: 'Düsseldorf', pl: 'Düsseldorf' }, ['duesseldorf']),
  p('leipzig', 51.34, 12.375, 'DE', { de: 'Leipzig', en: 'Leipzig', fr: 'Leipzig', es: 'Leipzig', pl: 'Lipsk' }),
  p('hanover', 52.375, 9.732, 'DE', { de: 'Hannover', en: 'Hanover', fr: 'Hanovre', es: 'Hannover', pl: 'Hanower' }),
  p('bremen', 53.079, 8.801, 'DE', { de: 'Bremen', en: 'Bremen', fr: 'Brême', es: 'Bremen', pl: 'Brema' }),
  p('dresden', 51.05, 13.738, 'DE', { de: 'Dresden', en: 'Dresden', fr: 'Dresde', es: 'Dresde', pl: 'Drezno' }),
  p('nuremberg', 49.452, 11.077, 'DE', { de: 'Nürnberg', en: 'Nuremberg', fr: 'Nuremberg', es: 'Núremberg', pl: 'Norymberga' }, ['nuernberg']),
  p('vienna', 48.208, 16.373, 'AT', { de: 'Wien', en: 'Vienna', fr: 'Vienne', es: 'Viena', pl: 'Wiedeń' }),
  p('zurich', 47.377, 8.541, 'CH', { de: 'Zürich', en: 'Zurich', fr: 'Zurich', es: 'Zúrich', pl: 'Zurych' }, ['zuerich']),
  p('paris', 48.857, 2.352, 'FR', { de: 'Paris', en: 'Paris', fr: 'Paris', es: 'París', pl: 'Paryż' }),
  p('lyon', 45.764, 4.836, 'FR', { de: 'Lyon', en: 'Lyon', fr: 'Lyon', es: 'Lyon', pl: 'Lyon' }),
  p('marseille', 43.296, 5.37, 'FR', { de: 'Marseille', en: 'Marseille', fr: 'Marseille', es: 'Marsella', pl: 'Marsylia' }),
  p('toulouse', 43.605, 1.444, 'FR', { de: 'Toulouse', en: 'Toulouse', fr: 'Toulouse', es: 'Toulouse', pl: 'Tuluza' }),
  p('lille', 50.63, 3.057, 'FR', { de: 'Lille', en: 'Lille', fr: 'Lille', es: 'Lille', pl: 'Lille' }),
  p('bordeaux', 44.838, -0.579, 'FR', { de: 'Bordeaux', en: 'Bordeaux', fr: 'Bordeaux', es: 'Burdeos', pl: 'Bordeaux' }),
  p('madrid', 40.417, -3.704, 'ES', { de: 'Madrid', en: 'Madrid', fr: 'Madrid', es: 'Madrid', pl: 'Madryt' }),
  p('barcelona', 41.385, 2.173, 'ES', { de: 'Barcelona', en: 'Barcelona', fr: 'Barcelone', es: 'Barcelona', pl: 'Barcelona' }),
  p('valencia', 39.47, -0.376, 'ES', { de: 'Valencia', en: 'Valencia', fr: 'Valence', es: 'Valencia', pl: 'Walencja' }),
  p('seville', 37.389, -5.984, 'ES', { de: 'Sevilla', en: 'Seville', fr: 'Séville', es: 'Sevilla', pl: 'Sewilla' }),
  p('bilbao', 43.263, -2.935, 'ES', { de: 'Bilbao', en: 'Bilbao', fr: 'Bilbao', es: 'Bilbao', pl: 'Bilbao' }),
  p('malaga', 36.721, -4.421, 'ES', { de: 'Málaga', en: 'Malaga', fr: 'Malaga', es: 'Málaga', pl: 'Malaga' }),
  p('warsaw', 52.23, 21.012, 'PL', { de: 'Warschau', en: 'Warsaw', fr: 'Varsovie', es: 'Varsovia', pl: 'Warszawa' }, ['warszawie']),
  p('krakow', 50.065, 19.945, 'PL', { de: 'Krakau', en: 'Krakow', fr: 'Cracovie', es: 'Cracovia', pl: 'Kraków' }, ['krakowie']),
  p('wroclaw', 51.108, 17.039, 'PL', { de: 'Breslau', en: 'Wroclaw', fr: 'Wrocław', es: 'Breslavia', pl: 'Wrocław' }, ['wrocławiu']),
  p('poznan', 52.406, 16.925, 'PL', { de: 'Posen', en: 'Poznan', fr: 'Poznań', es: 'Poznan', pl: 'Poznań' }, ['poznaniu']),
  p('gdansk', 54.352, 18.646, 'PL', { de: 'Danzig', en: 'Gdansk', fr: 'Gdańsk', es: 'Gdansk', pl: 'Gdańsk' }, ['gdańsku']),
  p('lodz', 51.759, 19.456, 'PL', { de: 'Lodz', en: 'Lodz', fr: 'Łódź', es: 'Lodz', pl: 'Łódź' }, ['łodzi']),
  p('amsterdam', 52.368, 4.904, 'NL', { de: 'Amsterdam', en: 'Amsterdam', fr: 'Amsterdam', es: 'Ámsterdam', pl: 'Amsterdam' }),
  p('brussels', 50.85, 4.352, 'BE', { de: 'Brüssel', en: 'Brussels', fr: 'Bruxelles', es: 'Bruselas', pl: 'Bruksela' }),
  p('prague', 50.075, 14.438, 'CZ', { de: 'Prag', en: 'Prague', fr: 'Prague', es: 'Praga', pl: 'Praga' }),
  p('copenhagen', 55.676, 12.568, 'DK', { de: 'Kopenhagen', en: 'Copenhagen', fr: 'Copenhague', es: 'Copenhague', pl: 'Kopenhaga' }),
];

