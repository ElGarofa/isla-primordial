// TABLA DE PTEROSAURIOS — una fila por especie del catálogo (envergadura y masa salen de catalogo.js; el Pteranodon sigue siendo la especie hecha a mano).
//   [id, arquetipo, rol, estilo de color, {o: proporciones}, {e: ecología}, {pal: rasgos de color}]
// HONESTIDAD: de los pterosaurios se conocen bien los huesos y, en yacimientos excepcionales (Solnhofen, Crato), partes de las membranas; el color es casi siempre
// hipótesis (solo hay melanosomas en unos pocos ejemplares). La forma de las crestas de tejido blando, el grosor de las alas y su postura en tierra se
// reconstruyen con incertidumbre: cada fila lo dice en su nota. Aquí solo vuelan: no caminan, no aterrizan ni pescan (pendiente, ver docs/ESPECIES_FAMILIAS.md).
import { medirPterosaurio, construirPterosaurio } from './pterosaurio.js';
import { paleta } from './nucleo.js';

// [id, arq, rol, estilo, o, e, pal]
export const TABLA_PTEROSAURIOS = [
  ['quetzalcoatlus', 'azdarquido', 'volador_grande', 'llanura',
    { cresta: { forma: 'cuchilla', alto: 0.06, t0: 0.08, t1: -0.1 } },
    {
      voz: 'graznido',
      nota: 'El mayor animal volador conocido (≈10–11 m de envergadura, 70–250 kg según el método). Se conocen huesos de las alas y el cuello, pero casi ningún cráneo completo de Q. northropi: la cabeza se infiere de parientes (Zhejiangopterus, Hatzegopteryx). Los azdárquidos probablemente forrajeaban en tierra, andando a cuatro patas; aquí solo se modela el vuelo.',
      conf: 'baja',
    }, {}],
  ['rhamphorhynchus', 'ramforrincoideo', 'volador_pequeno', 'costa',
    {},
    {
      nota: 'Conocido por decenas de ejemplares de Solnhofen con membranas alares y cola conservadas: la paleta de la cola (en forma de rombo) está bien documentada. Dientes largos y proyectados hacia delante, adaptados a atrapar peces y calamares. Su orientación (vertical u horizontal) se discute.',
      conf: 'media',
    }, { membrana: [0.34, 0.26, 0.2] }],
  ['pterodactylus', 'pterodactiloideo', 'volador_pequeno', 'costa',
    { cresta: { forma: 'cuchilla', alto: 0.07, t0: 0.12, t1: -0.04 } },
    {
      nota: 'El primer pterosaurio descrito (1784). Cabeza larga y estrecha con ≈90 dientes finos; los adultos tenían una cresta baja de tejido blando sobre el cráneo (la altura exacta se infiere de ejemplares con partes blandas). Cola muy corta.',
      conf: 'media',
    }, { membrana: [0.38, 0.28, 0.22] }],
  ['dimorphodon', 'dimorfodontido', 'volador_pequeno', 'costa',
    {},
    {
      nota: 'Cabeza enorme y alta respecto del cuerpo y dos tipos de dientes (de ahí el nombre); cola larga y rígida. Se ha propuesto que andaba a cuatro patas y que volaba poco y en trayectos cortos; su ecología (insectos y vertebrados pequeños) es una hipótesis.',
      conf: 'baja',
    }, { membrana: [0.4, 0.3, 0.2] }],
  ['tapejara', 'tapejarido', 'volador_frugivoro', 'selva',
    {},
    {
      nota: 'Pico corto y sin dientes, con una cresta ósea y de tejido blando en forma de vela que se prolonga hacia atrás. Dieta propuesta: frutos y semillas, tal vez algo de carne o carroña (hipótesis). La forma exacta de la vela de tejido blando se deduce de parientes mejor conservados.',
      conf: 'baja',
    }, { cresta: [0.82, 0.38, 0.14], cresta1: [0.9, 0.7, 0.3], membrana: [0.5, 0.42, 0.28] }],
  ['tupandactylus', 'tupandactilo', 'volador_frugivoro', 'selva',
    {},
    {
      nota: 'Sus crestas (hueso más tejido blando) llegan a ser más altas que el cráneo, sostenidas por una varilla ósea; se interpretan como señal de exhibición. Sin dientes. La extensión y la forma de la vela son una reconstrucción; el color de la cresta, una hipótesis.',
      conf: 'baja',
    }, { cresta: [0.78, 0.2, 0.18], cresta1: [0.95, 0.72, 0.28], membrana: [0.46, 0.38, 0.28] }],
  ['anhanguera', 'ornitoqueirido', 'volador_pescador', 'mar',
    {},
    {
      nota: 'Pico con una expansión de la punta rematada en dientes largos y una cresta baja delante (redondeada en la punta del hocico). Se alimentaba de peces atrapados en vuelo o al ras del agua. Las proporciones salen de esqueletos parciales y de parientes (Coloborhynchus, Ornithocheirus).',
      conf: 'baja',
    }, { membrana: [0.34, 0.34, 0.36] }],
];

/** Paleta de pterosaurio: base de hábitat + membrana del tono del dorso (hipótesis) salvo lo indicado en la tabla. */
function paletaPtero(id, est, extra) {
  const p = paleta(id, est, extra);
  p.membrana ??= p.dorso.map((v) => v * 0.85);
  p.membrana1 ??= p.vientre.map((v) => v * 0.75);
  return p;
}

export function prepararPterosaurio(fila, cat) {
  const [id, arq, rol, est, o, e, pal] = fila;
  const c = cat[id];
  const P = medirPterosaurio({ id, arq, L: c.tamano, masa: c.masa, o });
  const palx = paletaPtero(id, est, pal);
  const g = {
    familia: 'pterosaurio', P, build: (pal2) => construirPterosaurio(P, pal2), pal: palx, hit: P.hit, vel: P.vel, cycle: P.cycle, stance: P.stance, step: P.step, hips: P.hips, radius: P.radius,
    anim: 'ptera', skin: 'ptera', ancla: null,
    // parámetros de vuelo propios (ver Creature.thinkFlight / applyFlight): órbita (m), altura sobre el suelo (m), aleteo (rad/s), fracción de planeo
    vuelo: { orbita: P.d.orbita, alt: P.d.alt, aleteo: P.d.aleteo, plano: P.d.plano, bob: +(0.0065 * P.b).toFixed(3), suelo: +(P.bh * 1.3).toFixed(2) }, doble: true,
  };
  return { id, g, e: { ...e, rol } };
}
