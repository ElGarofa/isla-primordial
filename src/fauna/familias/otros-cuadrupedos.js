// TABLAS DE OTROS CUADRÚPEDOS NO DINOSAURIOS — cocodrilomorfos, mamíferos mesozoicos y el anfibio gigante del catálogo, con el generador de cuadrúpedos (cuadrupedo.js)
// y sus propios arquetipos. [id, arquetipo, rol, estilo de color, {o}, {e}, {pal}] como en cuadrupedos.js.
// HONESTIDAD: de los cocodrilomorfos gigantes se conocen cráneos y osteodermos, no el color ni la postura exacta (los gigantes probablemente andaban con las patas semierguidas
// como los cocodrilos actuales). Los mamíferos mesozoicos se conocen por esqueletos y, a veces, contenido estomacal; el pelaje es hipótesis. Beelzebufo solo se conoce por huesos del cráneo y la pelvis.
// Aquí solo andan: no nadan ni saltan todavía (pendiente: sistema acuático y salto de anfibios, ver docs/ESPECIES_FAMILIAS.md).
export const TABLA_COCODRILOS = [
  ['deinosuchus', 'cocodrilo', 'cocodrilo_gigante', 'pantano',
    { cabeza: 0.17, cola: 0.47, dientes: 0, rasgos: [['dientesMandibula', { n: 15, largo: 0.045 }], ['escudos', { filas: 18, cols: 4, tam: 0.011, desde: ['spine2', 0.4], hasta: ['tail3', 0.5], cola: 0.75, arco: 0.7 }]] },
    { nota: 'Aligatoroide gigante del Campaniense: se conocen cráneos (≈1,3 m) y osteodermos de cuello y lomo muy gruesos; cazaba en ríos y estuarios y hay dientes de Deinosuchus en huesos de dinosaurio. El largo (≈10 m) es una estimación y la masa varía mucho según el método.', conf: 'media' }, {}],
  ['sarcosuchus', 'cocodrilo', 'cocodrilo_gigante', 'rocoso',
    { cab: 'crocoLargo', cabeza: 0.17, ancho: 0.82, rasgos: [['dientesMandibula', { n: 18, largo: 0.04 }], ['protuberancia', { t: 0.955, ancho: 0.9, alto: 0.65, largo: 0.1 }], ['escudos', { filas: 18, cols: 4, tam: 0.0095, desde: ['spine2', 0.4], hasta: ['tail3', 0.5], cola: 0.75, arco: 0.7 }]] },
    { nota: 'Hocico largo y estrecho con una protuberancia ósea en la punta (la “bulla”); ≈100 dientes. Se conocen cráneos casi completos y osteodermos: es el mejor documentado de los grandes cocodrilomorfos. Probablemente pescaba y emboscaba a dinosaurios que bebían.', conf: 'media' }, {}],
  ['purussaurus', 'cocodrilo', 'cocodrilo_gigante', 'oscuro',
    { cab: 'crocoMaza', cabeza: 0.15, cola: 0.45, bh: 1.1, ancho: 1.0, rasgos: [['dientesMandibula', { n: 13, largo: 0.05 }], ['escudos', { filas: 16, cols: 4, tam: 0.013, desde: ['spine2', 0.4], hasta: ['tail3', 0.5], cola: 0.75, arco: 0.7 }]] },
    { nota: 'NO es mesozoico: es un caimanino del Mioceno (Cenozoico) de la Amazonía, y solo aparece aquí por la licencia de la isla de ficción. Cráneo de ≈1,4 m, muy robusto; la longitud total y la masa son extrapolaciones de ese cráneo.', conf: 'baja' }, {}],
  ['kaprosuchus', 'cocodriloTerrestre', 'cocodrilo_terrestre', 'arido',
    {},
    { nota: 'Cocodrilomorfo terrestre de cráneo corto y alto, con tres pares de colmillos enormes (“cocodrilo jabalí”). Solo se conoce un cráneo y huesos parciales: las patas largas y erguidas, la carrera y la talla (el catálogo da 6 m; otras estimaciones, 3 m) son inferencias.', conf: 'baja' }, {}],
];
export const TABLA_MAMIFEROS = [
  ['repenomamus', 'mamiferoRobusto', 'mamifero_carnivoro', 'rocoso',
    { uvMul: 3.5 },
    { nota: 'El mamífero mesozoico más grande conocido (≈1 m, ≈12 kg). Un ejemplar conserva en el estómago huesos de un Psittacosaurus joven: comía dinosaurios pequeños. El pelaje y la postura semierguida son inferencias de parientes.', conf: 'media' }, {}],
  ['didelphodon', 'mamiferoOmnivoro', 'mamifero_omnivoro', 'gris',
    { uvMul: 3.5 },
    { nota: 'Metaterio de cráneo muy robusto con premolares trituradores (presas duras: caparazones, huesos, moluscos); solo se conocen cráneos y mandíbulas, así que el cuerpo (tipo zarigüeya) es una reconstrucción.', conf: 'baja' }, {}],
];
export const TABLA_ANFIBIOS = [
  ['beelzebufo', 'ranaGigante', 'anfibio_emboscador', 'pantano',
    { rasgos: [], uvMul: 3 },
    { nota: 'Rana de Madagascar con cráneo ancho y osificado, la más grande conocida (≈40 cm). Por la boca enorme se supone que comía vertebrados pequeños emboscados; el cuerpo se reconstruye por comparación con la rana cornuda actual (Ceratophrys). No salta aún: en el juego solo camina.', conf: 'baja' }, {}],
];
