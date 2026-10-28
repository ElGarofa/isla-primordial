// PROVINCIAS Y BIOMAS — el mapa grande se divide en 12 provincias terrestres (cada una reúne ecosistemas del catálogo de una misma época) y 5 mares.
// La coherencia temporal es una regla de diseño: en una provincia solo viven especies de sus ecosistemas, y los animales salvajes no cruzan la frontera.
// HONESTIDAD: el mundo es una «isla refugio» de ficción. Las provincias de épocas distintas se tocan (separadas por cordilleras con pasos, costas o ríos);
// ni la geografía ni el clima reproducen la paleogeografía real (los continentes estaban en otros lugares y a veces a miles de km). Se reúnen formaciones de una
// misma edad aproximada (rango de unos 10–20 millones de años) y se les da un clima plausible, nada más.
//
// Coordenadas en metros: +x este, +z sur. El mundo es un cuadrado de CONFIG.world.size centrado en (0,0).

export const BIOMAS = {
  mar: 0, playa: 1, pradera: 2, selva: 3, bosque: 4, pantano: 5, desierto: 6, montana: 7, nieve: 8, volcan: 9, taiga: 10,
};
export const BIOMA_ID = Object.keys(BIOMAS); // id → nombre
export const BIOMA_NOMBRE = {
  mar: 'Mar', playa: 'Playa', pradera: 'Pradera', selva: 'Selva', bosque: 'Bosque', pantano: 'Pantano', desierto: 'Desierto',
  montana: 'Montaña', nieve: 'Cumbres nevadas', volcan: 'Tierras volcánicas', taiga: 'Taiga',
};
/** Color del bioma en el mapa (sRGB 0-255). */
export const BIOMA_COLOR = {
  mar: [30, 90, 130], playa: [220, 204, 150], pradera: [150, 160, 70], selva: [32, 96, 44], bosque: [58, 110, 62], pantano: [70, 100, 78],
  desierto: [208, 160, 98], montana: [130, 124, 114], nieve: [238, 242, 246], volcan: [74, 58, 54], taiga: [76, 112, 96],
};

// clima: temp = °C al nivel del mar, hum = humedad 0..1 · relieve: alt0 = altitud media del interior (m), amp = ondulación (m), mont = intensidad de montañas 0..1
// centro/radio en metros · ecosistemas: ids de catalogo.js
export const PROVINCIAS = [
  {
    id: 'hell_creek', nombre: 'Llanuras de Hell Creek', era: 'Cretácico tardío (Maastrichtiense)', centro: [0, 2300], radio: 2150,
    clima: { temp: 24, hum: 0.62 }, relieve: { alt0: 14, amp: 15, mont: 0.12, cordillera: 0.3 },
    ecosistemas: ['hell_creek'], mar: 'maastricht_mar',
    nota: 'Costa subtropical de llanuras, marismas y bosques de ribera. Aquí aparece el jugador.',
  },
  {
    id: 'laramidia', nombre: 'Laramidia', era: 'Cretácico tardío (Campaniense)', centro: [-3700, 700], radio: 2150,
    clima: { temp: 19, hum: 0.55 }, relieve: { alt0: 26, amp: 32, mont: 0.55 },
    ecosistemas: ['dinosaur_park', 'two_medicine', 'judith_river', 'kirtland', 'kaiparowits', 'wahweap'], mar: 'niobrara',
    nota: 'Llanura costera templada junto al Mar Interior, con bosques y colinas hacia el oeste.',
  },
  {
    id: 'gobi', nombre: 'Gobi y Nemegt', era: 'Cretácico tardío (Asia)', centro: [3800, 400], radio: 2200,
    clima: { temp: 21, hum: 0.34 }, relieve: { alt0: 34, amp: 38, mont: 0.45, terraza: 0.3 },
    ecosistemas: ['nemegt', 'djadokhta', 'xiaoyan', 'wangshi', 'udurchukan'], mar: 'oxford_mar',
    nota: 'Dunas y tierras malas del interior; cuencas fluviales más húmedas al norte.',
  },
  {
    id: 'patagonia_k', nombre: 'Patagonia y Gondwana tardío', era: 'Cretácico tardío (Maastrichtiense)', centro: [3300, 3250], radio: 1300,
    clima: { temp: 16, hum: 0.4 }, relieve: { alt0: 42, amp: 34, mont: 0.45 },
    ecosistemas: ['patagonia_maastrichtiense', 'madagascar'], mar: 'maastricht_mar',
    nota: 'Estepas ventosas y bosques de ladera, con una costa seca.',
  },
  {
    id: 'boreal', nombre: 'Polo boreal', era: 'Cretácico tardío (polar)', centro: [0, -4550], radio: 1900,
    clima: { temp: 3, hum: 0.5 }, relieve: { alt0: 70, amp: 60, mont: 0.95 },
    ecosistemas: ['prince_creek', 'antartida'], mar: 'oxford_mar',
    nota: 'Taiga, tundra y cumbres nevadas: bosques polares de noches largas.',
  },
  {
    id: 'gondwana_medio', nombre: 'Gondwana cenomaniense', era: 'Cretácico medio', centro: [-2700, 3500], radio: 1350,
    clima: { temp: 26, hum: 0.55 }, relieve: { alt0: 9, amp: 11, mont: 0.1, cordillera: 0.35 },
    ecosistemas: ['kem_kem', 'patagonia_cenomaniense'], mar: 'maastricht_mar',
    nota: 'Manglares, deltas y llanuras cálidas.',
  },
  {
    id: 'cret_templado', nombre: 'Cretácico temprano templado', era: 'Cretácico temprano', centro: [-3100, -2450], radio: 1600,
    clima: { temp: 14, hum: 0.6 }, relieve: { alt0: 32, amp: 36, mont: 0.5 },
    ecosistemas: ['wealden', 'yixian', 'clearwater', 'tugulu', 'isla_ficcion'], mar: 'eromanga_mar',
    nota: 'Bosques templados de coníferas y helechos, lagos y colinas.',
  },
  {
    id: 'cret_calido', nombre: 'Meseta del Cretácico temprano', era: 'Cretácico temprano', centro: [0, -1250], radio: 1850,
    clima: { temp: 26, hum: 0.32 }, relieve: { alt0: 80, amp: 42, mont: 0.65, terraza: 0.7 },
    ecosistemas: ['cretacico_temprano_na', 'tenere', 'crato', 'la_amarga', 'eromanga'], mar: null,
    nota: 'Meseta cálida de sabana, tierras áridas y cañones; sin costa.',
  },
  {
    id: 'jur_tardio', nombre: 'Jurásico tardío', era: 'Jurásico tardío', centro: [3500, -2700], radio: 2050,
    clima: { temp: 22, hum: 0.47 }, relieve: { alt0: 22, amp: 26, mont: 0.5 },
    ecosistemas: ['morrison', 'tendaguru', 'solnhofen', 'lourinha', 'shishugou', 'tiaojishan', 'ukureyskaya'], mar: 'oxford_mar',
    nota: 'Llanuras de inundación con coníferas, lagunas costeras y colinas boscosas.',
  },
  {
    id: 'jur_temprano', nombre: 'Isla del Jurásico temprano', era: 'Jurásico temprano–medio', centro: [-5250, 3700], radio: 750,
    clima: { temp: 20, hum: 0.42 }, relieve: { alt0: 34, amp: 50, mont: 0.7, terraza: 0.5 },
    ecosistemas: ['kayenta', 'elliot', 'laguna_colorada', 'shaximiao'], mar: 'lias',
    nota: 'Isla de mesetas rojizas y bosques secos.',
  },
  {
    id: 'triasico', nombre: 'Isla del Triásico', era: 'Triásico tardío', centro: [-5000, -4500], radio: 900,
    clima: { temp: 28, hum: 0.2 }, relieve: { alt0: 24, amp: 32, mont: 0.55, terraza: 0.6 },
    ecosistemas: ['chinle', 'trossingen', 'los_colorados', 'ischigualasto', 'santa_maria'], mar: 'eromanga_mar',
    nota: 'Desierto rojo de arenisca, valles secos y bosques de coníferas primitivas.',
  },
  {
    id: 'mioceno', nombre: 'Humedal del Mioceno', era: 'Mioceno (Cenozoico)', centro: [5200, 4600], radio: 650,
    clima: { temp: 29, hum: 0.88 }, relieve: { alt0: 2.5, amp: 3, mont: 0 },
    ecosistemas: ['neogeno_amazonia'], mar: 'maastricht_mar',
    nota: 'Cuenca amazónica de ríos lentos y pantanos; es la única provincia del Cenozoico.',
  },
];

// mares: cada celda de mar pertenece al más cercano (por distancia ponderada); su fauna sale de sus ecosistemas
export const MARES = [
  { id: 'niobrara', nombre: 'Mar Interior Occidental', era: 'Cretácico tardío', centro: [-5600, 400], radio: 2600, ecosistemas: ['niobrara'] },
  { id: 'maastricht_mar', nombre: 'Bahía Maastrichtiense', era: 'Cretácico tardío', centro: [0, 5600], radio: 3600, ecosistemas: ['maastricht_mar'] },
  { id: 'eromanga_mar', nombre: 'Mar de Eromanga', era: 'Cretácico temprano', centro: [-5400, -2300], radio: 2400, ecosistemas: ['eromanga_mar'] },
  { id: 'oxford_mar', nombre: 'Mar Oxfordiense', era: 'Jurásico tardío', centro: [5600, -1500], radio: 3600, ecosistemas: ['oxford_mar'] },
  { id: 'lias', nombre: 'Mar del Lias', era: 'Jurásico temprano', centro: [-5800, 4300], radio: 2200, ecosistemas: ['lias'] },
];

/** Rasgos dibujados a mano (elevaciones/biomas forzados). Todos con centro y radio en metros. */
export const RASGOS = [
  { id: 'monte_brasa', tipo: 'volcan', nombre: 'Monte Brasa', centro: [1950, -3300], radio: 820, altura: 380, crater: 70, provincia: 'jur_tardio' },
];

export const PROV_ID = Object.fromEntries(PROVINCIAS.map((p, i) => [p.id, i]));
export const MAR_ID = Object.fromEntries(MARES.map((m, i) => [m.id, i]));
