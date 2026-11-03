import type { Lang, Portal } from '@searchai/core';

type Words = Record<Lang, string[]>;

/**
 * Words for each fact value, per language. The first word is the plain form used in
 * "filter" queries; later words are synonyms used in listings and "paraphrase" queries.
 * Keys are `<field>:<value>`. All lowercase.
 */
export const FACT_WORDS: Record<string, Words> = {
  'fuel:diesel': { en: ['diesel', 'tdi'], de: ['diesel', 'selbstzünder'], fr: ['diesel', 'gazole'], es: ['diésel', 'diesel', 'gasóleo'], pl: ['diesel', 'olej napędowy'] },
  'fuel:petrol': { en: ['petrol', 'gasoline'], de: ['benzin', 'benziner'], fr: ['essence'], es: ['gasolina'], pl: ['benzyna'] },
  'fuel:hybrid': { en: ['hybrid'], de: ['hybrid'], fr: ['hybride'], es: ['híbrido'], pl: ['hybryda'] },
  'fuel:electric': { en: ['electric', 'ev'], de: ['elektro', 'elektroauto'], fr: ['électrique'], es: ['eléctrico'], pl: ['elektryczny'] },
  'body:van': { en: ['van', 'panel van'], de: ['transporter', 'kastenwagen', 'bus'], fr: ['fourgon', 'utilitaire'], es: ['furgoneta', 'furgón'], pl: ['dostawczy', 'bus'] },
  'body:suv': { en: ['suv', '4x4'], de: ['suv', 'geländewagen'], fr: ['suv', '4x4'], es: ['suv', 'todoterreno'], pl: ['suv', 'terenowy'] },
  'body:sedan': { en: ['sedan', 'saloon'], de: ['limousine'], fr: ['berline'], es: ['sedán', 'berlina'], pl: ['sedan'] },
  'body:hatchback': { en: ['hatchback'], de: ['kompaktwagen', 'kleinwagen'], fr: ['citadine', 'compacte'], es: ['compacto', 'utilitario'], pl: ['hatchback', 'kompakt'] },
  'body:estate': { en: ['estate', 'station wagon'], de: ['kombi'], fr: ['break'], es: ['ranchera'], pl: ['kombi'] },
  'body:pickup': { en: ['pickup', 'pick-up'], de: ['pickup', 'pritsche'], fr: ['pick-up'], es: ['pickup', 'pick-up'], pl: ['pickup'] },
  'body:coupe': { en: ['coupe'], de: ['coupé', 'coupe'], fr: ['coupé'], es: ['coupé', 'cupé'], pl: ['coupe'] },
  'body:convertible': { en: ['convertible', 'cabriolet'], de: ['cabrio', 'cabriolet'], fr: ['cabriolet'], es: ['descapotable', 'cabrio'], pl: ['kabriolet'] },
  'gearbox:automatic': { en: ['automatic'], de: ['automatik'], fr: ['automatique'], es: ['automático'], pl: ['automat'] },
  'gearbox:manual': { en: ['manual'], de: ['schaltgetriebe', 'manuell'], fr: ['manuelle'], es: ['manual'], pl: ['manualna'] },
  'type:apartment': { en: ['apartment', 'flat'], de: ['wohnung', 'etagenwohnung'], fr: ['appartement'], es: ['piso', 'apartamento'], pl: ['mieszkanie'] },
  'type:house': { en: ['house', 'detached house'], de: ['haus', 'einfamilienhaus'], fr: ['maison'], es: ['casa', 'chalet'], pl: ['dom'] },
  'type:townhouse': { en: ['townhouse', 'terraced house'], de: ['reihenhaus'], fr: ['maison de ville'], es: ['adosado'], pl: ['szeregowiec'] },
  'furnished:true': { en: ['furnished'], de: ['möbliert'], fr: ['meublé'], es: ['amueblado'], pl: ['umeblowane'] },
  'furnished:false': { en: ['unfurnished'], de: ['unmöbliert'], fr: ['non meublé'], es: ['sin amueblar'], pl: ['nieumeblowane'] },
  'seniority:junior': { en: ['junior'], de: ['junior'], fr: ['junior'], es: ['junior'], pl: ['junior'] },
  'seniority:mid': { en: ['mid-level'], de: ['professional'], fr: ['confirmé'], es: ['semi senior'], pl: ['mid'] },
  'seniority:senior': { en: ['senior'], de: ['senior'], fr: ['senior'], es: ['senior'], pl: ['senior'] },
  'seniority:lead': { en: ['lead'], de: ['lead', 'teamleitung'], fr: ['lead', "chef d'équipe"], es: ['lead', 'jefe de equipo'], pl: ['lead', 'kierownik zespołu'] },
  'remote:remote': { en: ['remote', 'fully remote'], de: ['remote', 'homeoffice'], fr: ['télétravail', 'remote'], es: ['remoto', 'teletrabajo'], pl: ['zdalnie', 'praca zdalna'] },
  'remote:hybrid': { en: ['hybrid work'], de: ['hybrides arbeiten'], fr: ['hybride'], es: ['trabajo híbrido'], pl: ['hybrydowo'] },
  'remote:onsite': { en: ['on-site'], de: ['vor ort'], fr: ['sur site'], es: ['presencial'], pl: ['stacjonarnie'] },
  'contract:full_time': { en: ['full-time'], de: ['vollzeit'], fr: ['temps plein'], es: ['jornada completa'], pl: ['pełny etat'] },
  'contract:part_time': { en: ['part-time'], de: ['teilzeit'], fr: ['temps partiel'], es: ['media jornada'], pl: ['część etatu'] },
  'contract:contract': { en: ['freelance', 'contract'], de: ['freiberuflich'], fr: ['freelance'], es: ['autónomo', 'freelance'], pl: ['b2b', 'kontrakt'] },
  'category:electronics': { en: ['laptop', 'smartphone'], de: ['laptop', 'handy'], fr: ['ordinateur portable', 'smartphone'], es: ['portátil', 'móvil'], pl: ['laptop', 'smartfon'] },
  'category:furniture': { en: ['sofa', 'dining table'], de: ['sofa', 'esstisch'], fr: ['canapé', 'table à manger'], es: ['sofá', 'mesa de comedor'], pl: ['sofa', 'stół'] },
  'category:bikes': { en: ['bike', 'bicycle'], de: ['fahrrad', 'rad'], fr: ['vélo'], es: ['bicicleta', 'bici'], pl: ['rower'] },
  'category:fashion': { en: ['jacket', 'sneakers'], de: ['jacke', 'sneaker'], fr: ['veste', 'baskets'], es: ['chaqueta', 'zapatillas'], pl: ['kurtka', 'buty'] },
  'category:sports': { en: ['tennis racket', 'golf clubs'], de: ['tennisschläger', 'golfschläger'], fr: ['raquette de tennis', 'clubs de golf'], es: ['raqueta de tenis', 'palos de golf'], pl: ['rakieta tenisowa', 'kije golfowe'] },
  'category:kids': { en: ['stroller', 'car seat'], de: ['kinderwagen', 'kindersitz'], fr: ['poussette', 'siège auto'], es: ['carrito de bebé', 'silla de coche'], pl: ['wózek dziecięcy', 'fotelik'] },
  'condition:new': { en: ['new', 'brand new'], de: ['neu', 'neuwertig'], fr: ['neuf'], es: ['nuevo'], pl: ['nowy'] },
  'condition:like_new': { en: ['like new'], de: ['wie neu'], fr: ['comme neuf'], es: ['como nuevo'], pl: ['jak nowy'] },
  'condition:good': { en: ['good condition'], de: ['guter zustand'], fr: ['bon état'], es: ['buen estado'], pl: ['dobry stan'] },
  'condition:fair': { en: ['fair condition'], de: ['gebraucht'], fr: ['usagé'], es: ['usado'], pl: ['używany'] },
};

/** Nouns that name a portal; used to detect it in queries. */
export const PORTAL_WORDS: Record<Portal, Words> = {
  cars: { en: ['car', 'cars'], de: ['auto', 'pkw', 'wagen'], fr: ['voiture'], es: ['coche'], pl: ['samochód', 'auto'] },
  homes: { en: ['home for sale', 'buy'], de: ['kaufen', 'eigentum'], fr: ['à vendre', 'acheter'], es: ['en venta', 'comprar'], pl: ['na sprzedaż', 'kupię'] },
  rentals: { en: ['rent', 'to rent'], de: ['mieten', 'miete'], fr: ['louer', 'location'], es: ['alquiler', 'alquilar'], pl: ['wynajem', 'wynajmę'] },
  jobs: { en: ['job', 'developer', 'engineer'], de: ['job', 'stelle', 'entwickler'], fr: ['emploi', 'poste', 'développeur'], es: ['empleo', 'trabajo', 'desarrollador'], pl: ['praca', 'programista'] },
  marketplace: { en: ['for sale'], de: ['zu verkaufen'], fr: ['vends'], es: ['se vende'], pl: ['sprzedam'] },
};

/** Comparator and unit words, used by the query renderer and the parser. */
export const WORDS = {
  max: { en: ['under', 'below', 'up to', 'max', 'less than'], de: ['bis', 'unter', 'maximal', 'höchstens'], fr: ['moins de', "jusqu'à", 'max'], es: ['menos de', 'hasta', 'máximo'], pl: ['do', 'poniżej', 'maks'] },
  min: { en: ['at least', 'from', 'over', 'min'], de: ['ab', 'mindestens', 'über'], fr: ['au moins', 'à partir de', 'plus de'], es: ['desde', 'al menos', 'más de'], pl: ['od', 'co najmniej', 'powyżej'] },
  near: { en: ['near', 'around', 'in'], de: ['bei', 'nahe', 'in', 'um'], fr: ['près de', 'à', 'autour de'], es: ['cerca de', 'en'], pl: ['w okolicy', 'koło', 'w'] },
  km: { en: ['km'], de: ['km', 'tkm'], fr: ['km'], es: ['km'], pl: ['km'] },
  mileage: { en: ['mileage'], de: ['laufleistung', 'kilometerstand'], fr: ['kilométrage'], es: ['kilometraje'], pl: ['przebieg'] },
  rooms: { en: ['rooms', 'room', 'bedrooms'], de: ['zimmer', 'zi'], fr: ['pièces', 'pièce'], es: ['habitaciones', 'habitación'], pl: ['pokoje', 'pokoi', 'pokój'] },
  area: { en: ['m2', 'm²', 'sqm'], de: ['m2', 'm²', 'qm'], fr: ['m2', 'm²'], es: ['m2', 'm²'], pl: ['m2', 'm²'] },
  perMonth: { en: ['per month', 'a month', '/month'], de: ['monatlich', 'pro monat', 'warm'], fr: ['par mois', '/mois'], es: ['al mes', 'mensuales'], pl: ['miesięcznie', 'na miesiąc'] },
  salary: { en: ['salary'], de: ['gehalt'], fr: ['salaire'], es: ['salario', 'sueldo'], pl: ['pensja', 'wynagrodzenie'] },
} satisfies Record<string, Words>;

export interface Intent {
  id: string;
  /** Primary phrase, then a paraphrase, per language. */
  phrases: Words;
  field: string;
  values?: (string | boolean)[];
  min?: number;
  max?: number;
}

/**
 * Soft, semantic preferences: they raise relevance but never exclude a listing. Their phrases
 * are deliberately absent from the parser's dictionaries, so only semantic search can use them.
 */
export const INTENTS: Record<Portal, Intent[]> = {
  cars: [
    { id: 'family', field: 'body', values: ['suv', 'estate', 'van'], phrases: { en: ['family car', 'room for the kids and luggage'], de: ['familienauto', 'platz für kinder und gepäck'], fr: ['voiture familiale', 'de la place pour les enfants'], es: ['coche familiar', 'espacio para niños y maletas'], pl: ['auto rodzinne', 'miejsce dla dzieci i bagażu'] } },
    { id: 'green', field: 'fuel', values: ['hybrid', 'electric'], phrases: { en: ['low emissions', 'eco friendly'], de: ['umweltfreundlich', 'wenig emissionen'], fr: ['écologique', 'faibles émissions'], es: ['ecológico', 'bajas emisiones'], pl: ['ekologiczny', 'niska emisja'] } },
    { id: 'cargo', field: 'body', values: ['van', 'pickup'], phrases: { en: ['for moving furniture', 'for my trade business'], de: ['zum möbeltransport', 'für handwerker'], fr: ['pour déménager', 'pour artisan'], es: ['para mudanzas', 'para mi negocio'], pl: ['do przeprowadzek', 'dla firmy'] } },
    { id: 'sporty', field: 'body', values: ['coupe', 'convertible'], phrases: { en: ['sporty', 'fun to drive'], de: ['sportlich', 'fahrspaß'], fr: ['sportive', 'plaisir de conduite'], es: ['deportivo', 'divertido de conducir'], pl: ['sportowy', 'frajda z jazdy'] } },
    { id: 'easy', field: 'gearbox', values: ['automatic'], phrases: { en: ['no clutch', 'easy to drive in traffic'], de: ['ohne kupplung', 'entspannt im stau'], fr: ['sans embrayage', 'facile en ville'], es: ['sin embrague', 'fácil en atascos'], pl: ['bez sprzęgła', 'łatwy w korkach'] } },
  ],
  homes: [
    { id: 'family', field: 'type', values: ['house', 'townhouse'], phrases: { en: ['for a growing family', 'with a garden for kids'], de: ['für eine familie', 'mit garten für kinder'], fr: ['pour une famille', 'avec jardin pour enfants'], es: ['para una familia', 'con jardín para niños'], pl: ['dla rodziny', 'z ogrodem dla dzieci'] } },
    { id: 'modern', field: 'year_built', min: 2015, phrases: { en: ['new build', 'modern construction'], de: ['neubau', 'moderne bauweise'], fr: ['construction récente', 'neuf'], es: ['obra nueva', 'construcción moderna'], pl: ['nowe budownictwo', 'nowoczesny'] } },
    { id: 'city', field: 'type', values: ['apartment'], phrases: { en: ['city living', 'close to downtown'], de: ['stadtleben', 'zentrumsnah'], fr: ['vie en ville', 'proche du centre'], es: ['vida en la ciudad', 'cerca del centro'], pl: ['życie w mieście', 'blisko centrum'] } },
  ],
  rentals: [
    { id: 'ready', field: 'furnished', values: [true], phrases: { en: ['move-in ready', 'just bring a suitcase'], de: ['sofort bezugsfertig', 'nur koffer mitbringen'], fr: ['prêt à emménager', 'valise suffit'], es: ['listo para entrar', 'solo trae la maleta'], pl: ['gotowe do wprowadzenia', 'tylko walizka'] } },
    { id: 'small', field: 'rooms', max: 2, phrases: { en: ['for a student', 'small place for one'], de: ['für studenten', 'kleine bleibe'], fr: ['pour étudiant', 'petit logement'], es: ['para estudiante', 'piso pequeño'], pl: ['dla studenta', 'małe lokum'] } },
    { id: 'spacious', field: 'area_m2', min: 90, phrases: { en: ['spacious', 'lots of space'], de: ['großzügig', 'viel platz'], fr: ['spacieux', "beaucoup d'espace"], es: ['amplio', 'mucho espacio'], pl: ['przestronne', 'dużo miejsca'] } },
  ],
  jobs: [
    { id: 'wfh', field: 'remote', values: ['remote'], phrases: { en: ['work from home', 'no commute'], de: ['von zu hause arbeiten', 'kein pendeln'], fr: ['travailler de chez soi', 'sans trajet'], es: ['trabajar desde casa', 'sin desplazamientos'], pl: ['praca z domu', 'bez dojazdów'] } },
    { id: 'entry', field: 'seniority', values: ['junior'], phrases: { en: ['entry level', 'first job after university'], de: ['berufseinstieg', 'nach dem studium'], fr: ['premier emploi', 'débutant accepté'], es: ['primer empleo', 'recién graduado'], pl: ['pierwsza praca', 'po studiach'] } },
    { id: 'leader', field: 'seniority', values: ['lead'], phrases: { en: ['leadership role', 'manage a team'], de: ['führungsrolle', 'team führen'], fr: ["rôle d'encadrement", 'manager une équipe'], es: ['puesto de liderazgo', 'dirigir un equipo'], pl: ['rola kierownicza', 'zarządzanie zespołem'] } },
  ],
  marketplace: [
    { id: 'barely', field: 'condition', values: ['new', 'like_new'], phrases: { en: ['barely used', 'still in the box'], de: ['kaum benutzt', 'noch originalverpackt'], fr: ['à peine utilisé', 'encore emballé'], es: ['casi sin usar', 'en su caja'], pl: ['prawie nieużywany', 'w pudełku'] } },
    { id: 'baby', field: 'category', values: ['kids'], phrases: { en: ['for a newborn', 'baby gear'], de: ['für ein neugeborenes', 'babyausstattung'], fr: ['pour un nouveau-né', 'équipement bébé'], es: ['para un recién nacido', 'cosas de bebé'], pl: ['dla noworodka', 'wyprawka'] } },
    { id: 'outdoor', field: 'category', values: ['bikes', 'sports'], phrases: { en: ['for outdoor exercise', 'to get fit outside'], de: ['für sport draußen', 'fit an der frischen luft'], fr: ['sport en plein air', 'se remettre en forme'], es: ['deporte al aire libre', 'ponerse en forma'], pl: ['sport na świeżym powietrzu', 'żeby schudnąć'] } },
  ],
};

/** Listing-side flavour text per portal: real-world detail that only semantic search can use. */
export const FEATURES: Record<Portal, Words> = {
  cars: { en: ['tow bar', 'roof rack', 'heated seats', 'navigation', 'parking sensors', 'full service history', 'one owner', 'winter tyres', 'cruise control'], de: ['anhängerkupplung', 'dachträger', 'sitzheizung', 'navi', 'einparkhilfe', 'scheckheftgepflegt', 'erste hand', 'winterreifen', 'tempomat'], fr: ['attelage', 'barres de toit', 'sièges chauffants', 'gps', 'radar de recul', 'carnet d’entretien', 'première main', 'pneus hiver', 'régulateur de vitesse'], es: ['enganche', 'baca', 'asientos calefactables', 'navegador', 'sensores de aparcamiento', 'libro de mantenimiento', 'único dueño', 'neumáticos de invierno', 'control de crucero'], pl: ['hak', 'bagażnik dachowy', 'podgrzewane fotele', 'nawigacja', 'czujniki parkowania', 'serwisowany w aso', 'pierwszy właściciel', 'opony zimowe', 'tempomat'] },
  homes: { en: ['balcony', 'garden', 'lift', 'garage', 'renovated', 'quiet street', 'fitted kitchen', 'near a park'], de: ['balkon', 'garten', 'aufzug', 'garage', 'saniert', 'ruhige lage', 'einbauküche', 'parknähe'], fr: ['balcon', 'jardin', 'ascenseur', 'garage', 'rénové', 'rue calme', 'cuisine équipée', 'proche d’un parc'], es: ['balcón', 'jardín', 'ascensor', 'garaje', 'reformado', 'calle tranquila', 'cocina equipada', 'cerca de un parque'], pl: ['balkon', 'ogród', 'winda', 'garaż', 'po remoncie', 'cicha okolica', 'zabudowana kuchnia', 'blisko parku'] },
  rentals: { en: ['balcony', 'pets allowed', 'close to the metro', 'washing machine', 'bright', 'bills included'], de: ['balkon', 'haustiere erlaubt', 'u-bahn-nähe', 'waschmaschine', 'hell', 'nebenkosten inklusive'], fr: ['balcon', 'animaux acceptés', 'proche du métro', 'lave-linge', 'lumineux', 'charges comprises'], es: ['balcón', 'se admiten mascotas', 'cerca del metro', 'lavadora', 'luminoso', 'gastos incluidos'], pl: ['balkon', 'zwierzęta mile widziane', 'blisko metra', 'pralka', 'jasne', 'media w cenie'] },
  jobs: { en: ['typescript', 'postgresql', 'react', 'kubernetes', 'customer support', 'accounting', 'nursing', 'sales'], de: ['typescript', 'postgresql', 'react', 'kubernetes', 'kundenservice', 'buchhaltung', 'pflege', 'vertrieb'], fr: ['typescript', 'postgresql', 'react', 'kubernetes', 'support client', 'comptabilité', 'soins infirmiers', 'commercial'], es: ['typescript', 'postgresql', 'react', 'kubernetes', 'atención al cliente', 'contabilidad', 'enfermería', 'ventas'], pl: ['typescript', 'postgresql', 'react', 'kubernetes', 'obsługa klienta', 'księgowość', 'pielęgniarstwo', 'sprzedaż'] },
  marketplace: { en: ['pickup only', 'can ship', 'original receipt', 'smoke-free home', 'barely used'], de: ['nur abholung', 'versand möglich', 'mit rechnung', 'nichtraucherhaushalt', 'kaum benutzt'], fr: ['à récupérer sur place', 'envoi possible', 'avec facture', 'non-fumeur', 'peu servi'], es: ['solo recogida', 'envío posible', 'con factura', 'casa sin humo', 'poco uso'], pl: ['tylko odbiór osobisty', 'możliwa wysyłka', 'z paragonem', 'dom bez dymu', 'mało używany'] },
};

export interface CarModel {
  make: string;
  model: string;
  bodies: string[];
  fuels: string[];
}

export const CAR_MODELS: CarModel[] = [
  { make: 'volkswagen', model: 'golf', bodies: ['hatchback', 'estate'], fuels: ['petrol', 'diesel', 'hybrid', 'electric'] },
  { make: 'volkswagen', model: 'passat', bodies: ['sedan', 'estate'], fuels: ['petrol', 'diesel', 'hybrid'] },
  { make: 'volkswagen', model: 'transporter', bodies: ['van'], fuels: ['diesel', 'petrol'] },
  { make: 'volkswagen', model: 'tiguan', bodies: ['suv'], fuels: ['petrol', 'diesel', 'hybrid'] },
  { make: 'ford', model: 'focus', bodies: ['hatchback', 'estate'], fuels: ['petrol', 'diesel'] },
  { make: 'ford', model: 'transit', bodies: ['van'], fuels: ['diesel', 'electric'] },
  { make: 'ford', model: 'ranger', bodies: ['pickup'], fuels: ['diesel'] },
  { make: 'ford', model: 'mustang', bodies: ['coupe', 'convertible'], fuels: ['petrol', 'electric'] },
  { make: 'mercedes', model: 'c-class', bodies: ['sedan', 'estate', 'coupe', 'convertible'], fuels: ['petrol', 'diesel', 'hybrid'] },
  { make: 'mercedes', model: 'sprinter', bodies: ['van'], fuels: ['diesel', 'electric'] },
  { make: 'mercedes', model: 'vito', bodies: ['van'], fuels: ['diesel'] },
  { make: 'bmw', model: '3 series', bodies: ['sedan', 'estate'], fuels: ['petrol', 'diesel', 'hybrid'] },
  { make: 'bmw', model: 'x3', bodies: ['suv'], fuels: ['petrol', 'diesel', 'hybrid', 'electric'] },
  { make: 'bmw', model: 'z4', bodies: ['convertible'], fuels: ['petrol'] },
  { make: 'opel', model: 'corsa', bodies: ['hatchback'], fuels: ['petrol', 'electric'] },
  { make: 'opel', model: 'vivaro', bodies: ['van'], fuels: ['diesel', 'electric'] },
  { make: 'renault', model: 'clio', bodies: ['hatchback'], fuels: ['petrol', 'hybrid'] },
  { make: 'renault', model: 'trafic', bodies: ['van'], fuels: ['diesel'] },
  { make: 'toyota', model: 'yaris', bodies: ['hatchback'], fuels: ['petrol', 'hybrid'] },
  { make: 'toyota', model: 'rav4', bodies: ['suv'], fuels: ['hybrid', 'petrol'] },
  { make: 'toyota', model: 'hilux', bodies: ['pickup'], fuels: ['diesel'] },
  { make: 'skoda', model: 'octavia', bodies: ['sedan', 'estate'], fuels: ['petrol', 'diesel'] },
  { make: 'fiat', model: 'ducato', bodies: ['van'], fuels: ['diesel'] },
  { make: 'peugeot', model: '208', bodies: ['hatchback'], fuels: ['petrol', 'electric'] },
];

export const MAKE_ALIASES: Record<string, string[]> = {
  volkswagen: ['volkswagen', 'vw'],
  ford: ['ford'],
  mercedes: ['mercedes', 'mercedes-benz', 'benz'],
  bmw: ['bmw'],
  opel: ['opel', 'vauxhall'],
  renault: ['renault'],
  toyota: ['toyota'],
  skoda: ['skoda', 'škoda'],
  fiat: ['fiat'],
  peugeot: ['peugeot'],
};

export const JOB_ROLES: Record<string, Words> = {
  'software engineer': { en: ['software engineer'], de: ['softwareentwickler'], fr: ['développeur logiciel'], es: ['ingeniero de software'], pl: ['programista'] },
  'data engineer': { en: ['data engineer'], de: ['data engineer'], fr: ['ingénieur données'], es: ['ingeniero de datos'], pl: ['inżynier danych'] },
  accountant: { en: ['accountant'], de: ['buchhalter'], fr: ['comptable'], es: ['contable'], pl: ['księgowy'] },
  nurse: { en: ['nurse'], de: ['pflegefachkraft'], fr: ['infirmier'], es: ['enfermero'], pl: ['pielęgniarz'] },
  'sales manager': { en: ['sales manager'], de: ['vertriebsleiter'], fr: ['responsable commercial'], es: ['jefe de ventas'], pl: ['kierownik sprzedaży'] },
  'support agent': { en: ['support agent'], de: ['kundenberater'], fr: ['conseiller client'], es: ['agente de soporte'], pl: ['konsultant'] },
};

export const MARKET_BRANDS: Record<string, string[]> = {
  electronics: ['apple', 'samsung', 'lenovo', 'sony'],
  furniture: ['ikea', 'hay', 'muuto'],
  bikes: ['cube', 'canyon', 'trek', 'giant'],
  fashion: ['nike', 'adidas', 'zara', 'patagonia'],
  sports: ['wilson', 'head', 'callaway'],
  kids: ['cybex', 'bugaboo', 'britax'],
};
