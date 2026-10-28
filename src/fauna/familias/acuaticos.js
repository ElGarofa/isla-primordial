// TABLA DE ANIMALES ACUÁTICOS — una fila por especie del catálogo (longitud y masa salen de catalogo.js).
//   [id, arquetipo, rol, estilo de color, {o: proporciones}, {e: ecología}, {pal: rasgos de color}]
// HONESTIDAD: de los reptiles marinos se conocen bien los esqueletos; el contorno del cuerpo y de la cola solo está documentado en unos pocos ejemplares excepcionales
// (Platecarpus para los mosasaurios, Stenopterygius de Holzmaden para los ictiosaurios) y la coloración, en alguno (Lindgren et al. 2010, 2014, 2018: reptiles marinos
// oscuros por arriba). Las proporciones del resto, las aletas de tejido blando, la postura del cuello de los plesiosaurios y los colores son reconstrucciones o
// hipótesis: cada fila lo dice en su nota. Nadan, suben a respirar y cazan o huyen en el agua; no salen a tierra (mamar, desovar y migrar no están implementados).
import { medirAcuatico, construirAcuatico } from './acuatico.js';
import { paleta } from './nucleo.js';
import { uvKde } from './nucleo.js';

// [id, arq, rol, estilo, o, e, pal]
export const TABLA_ACUATICOS = [
  ['mosasaurus', 'mosasaurido', 'marino_gran_pred', 'mar',
    {},
    {
      voz: 'bufido', conf: 'media',
      nota: 'El mosasáurido más grande conocido (≈12 m según las estimaciones más citadas; la longitud se infiere de cráneos y vértebras, no de esqueletos completos). Cola larga y aleta caudal con el lóbulo inferior mayor, como en Platecarpus (tejidos blandos conservados); aletas cortas en forma de remo. Coloración oscura por arriba y clara por abajo: hipótesis apoyada en pigmentos fósiles de otros mosasaurios.',
    }, { dorso: [0.14, 0.17, 0.19], vientre: [0.68, 0.7, 0.66], ojo: [0.1, 0.08, 0.05] }],
  ['tylosaurus', 'mosasaurido', 'marino_gran_pred', 'mar',
    { cab: 0.14, cab_: 'tilosaurio', h: 0.04, dientes: { n: 12, L: 0.06, desde: 0.3, forma: 'conico' }, aletaD: { largo: 0.072 }, aletaT: { largo: 0.062 }, fluke: { alto: 0.095 } },
    {
      voz: 'bufido', conf: 'media',
      nota: 'Mosasáurido esbelto del Mar Interior Occidental, con un hocico largo y estrecho que se prolonga en un «espolón» por delante de los dientes. Se conocen cráneos y esqueletos casi completos; hay un ejemplar con pigmento fósil que indica un animal oscuro. Su fisiología (sangre caliente o no) y su caza son hipótesis.',
    }, { dorso: [0.16, 0.17, 0.16], vientre: [0.64, 0.64, 0.58], ojo: [0.1, 0.08, 0.05] }],
  ['prognathodon', 'mosasaurido', 'marino_gran_pred', 'mar',
    { cab: 0.17, cab_: 'prognatodonte', h: 0.052, tronco: 0.38, cola: 0.4, dientes: { n: 10, L: 0.07, desde: 0.3, forma: 'conico' }, aletaD: { largo: 0.082 }, fluke: { alto: 0.11 }, nado: { amp: 0.1 } },
    {
      voz: 'bufido', conf: 'baja',
      nota: 'Mosasáurido de cráneo corto, ancho y muy robusto, adaptado a presas de cuerpo duro (tortugas, amonites, otros reptiles). La talla (≈8 m) varía mucho entre especies del género; aquí se modela P. overtoni. Es el mosasaurio con la mejor evidencia de coloración (melanosomas con contrasombreado), pero el contorno del cuerpo es una reconstrucción.',
    }, { dorso: [0.13, 0.12, 0.11], vientre: [0.7, 0.68, 0.6], ojo: [0.12, 0.09, 0.05] }],
  ['plesiosaurus', 'plesiosaurio', 'marino_medio', 'mar',
    {},
    {
      voz: 'bufido', conf: 'media',
      nota: 'Plesiosaurio jurásico de cuello largo (≈⅓ de la longitud) y cuatro aletas largas de tamaño parecido. Se conocen esqueletos muy completos (Lyme Regis), pero no la piel ni el color. Se mueve con las aletas («vuelo subacuático») y mantiene el cuello extendido: estudios de sus vértebras indican que apenas podía curvarlo hacia arriba, de modo que no se modela como un cuello de cisne.',
    }, { dorso: [0.2, 0.25, 0.23], vientre: [0.62, 0.66, 0.6], ojo: [0.1, 0.08, 0.05] }],
  ['elasmosaurus', 'elasmosaurido', 'marino_medio', 'mar',
    {},
    {
      voz: 'bufido', conf: 'media',
      nota: 'Elasmosáurido del Mar Interior Occidental con el cuello más largo conocido (≈½ de la longitud, 71 vértebras) y una cabeza diminuta. La anatomía se conoce por esqueletos casi completos; el cuello se modela recto con ligeras ondulaciones horizontales, porque la rigidez de las vértebras limitaba su flexión. Color y piel: hipótesis.',
    }, { dorso: [0.21, 0.26, 0.26], vientre: [0.66, 0.7, 0.64], ojo: [0.1, 0.08, 0.05] }],
  ['kronosaurus', 'pliosaurido', 'marino_gran_pred', 'mar',
    {},
    {
      voz: 'bufido', conf: 'baja',
      nota: 'Pliosáurido del Cretácico de Australia con una cabeza de cerca de ¼ de la longitud y dientes de más de 20 cm. Se conocen cráneos y esqueletos parciales; el cuerpo se reconstruyó en el pasado con un tronco exagerado (el montaje del museo de Harvard) y las proporciones del cuerpo actuales son una estimación. Coloración: hipótesis.',
    }, { dorso: [0.12, 0.14, 0.15], vientre: [0.58, 0.6, 0.55], ojo: [0.12, 0.09, 0.05] }],
  ['ichthyosaurus', 'ictiosaurio', 'marino_medio', 'mar',
    {},
    {
      voz: 'bufido', conf: 'media',
      nota: 'Ictiosaurio jurásico de cuerpo de delfín, hocico largo y cola con aleta lunada. La forma completa del cuerpo (aleta dorsal y lóbulo caudal inferior) se conoce por ejemplares de Holzmaden (de un género emparentado, Stenopterygius) con contorno conservado; aquí se extrapola a Ichthyosaurus. El pigmento fósil del pariente indica un animal oscuro con vientre más claro.',
    }, { dorso: [0.13, 0.14, 0.15], vientre: [0.62, 0.62, 0.56], ojo: [0.1, 0.08, 0.05] }],
  ['ophthalmosaurus', 'ictiosaurio', 'marino_medio', 'oscuro',
    { cab: 0.19, cab_: 'oftalmosaurio', tronco: 0.4, cola: 0.38, h: 0.085, ancho: 0.78, ojo: 3.4, dientes: null, aletaD: { largo: 0.17, ancho: 0.065 }, aletaT: { largo: 0.1, ancho: 0.05 }, dorsal: { alto: 0.075 }, fluke: { alto: 0.22 } },
    {
      voz: 'bufido', conf: 'media',
      nota: 'Ictiosaurio de ojos enormes (con un anillo esclerótico de ≈10 cm) y pico sin dientes funcionales en el adulto; se supone un cazador de calamares a poca luz. Cuerpo fusiforme muy hidrodinámico; las aletas delanteras largas y las traseras casi tan largas son rasgos del género. Aleta dorsal y caudal: extrapolación de ictiosaurios con contorno conservado.',
    }, { dorso: [0.09, 0.1, 0.12], vientre: [0.5, 0.52, 0.5], ojo: [0.08, 0.06, 0.04] }],
  ['xiphactinus', 'pez_depredador', 'pez_emboscador', 'mar',
    {},
    {
      voz: 'ninguna', conf: 'media',
      nota: 'Pez óseo depredador del Mar Interior Occidental, de cabeza alta, mandíbula inferior prominente y colmillos largos; se han hallado ejemplares con presas casi enteras en el estómago. Cuerpo comprimido, aleta dorsal retrasada y caudal ahorquillada: reconstrucción a partir de esqueletos y de peces emparentados. Color plateado: hipótesis.',
    }, { dorso: [0.26, 0.32, 0.36], vientre: [0.86, 0.88, 0.86], ojo: [0.9, 0.8, 0.35] }],
  ['leedsichthys', 'pez_filtrador', 'filtrador_gigante', 'mar',
    {},
    {
      voz: 'ninguna', conf: 'baja',
      nota: 'El pez óseo más grande conocido: de él solo se conservan fragmentos del esqueleto cartilaginoso y de las branquias, así que su longitud (de ≈14 m a más de 16 m según el estudio) y el aspecto del cuerpo son estimaciones. Filtraba plancton con branquiespinas enormes, sin dientes funcionales. Aletas pectorales largas y caudal ahorquillada: reconstrucción.',
    }, { dorso: [0.24, 0.29, 0.33], vientre: [0.8, 0.82, 0.8], ojo: [0.8, 0.75, 0.45] }],
];

const SKIN = { mosasaurido: 'pez', plesiosaurio: 'liso', elasmosaurido: 'liso', pliosaurido: 'liso', ictiosaurio: 'liso', pez_depredador: 'pez', pez_filtrador: 'pez' };

/** Paleta marina: base del hábitat 'mar' + tono de aletas del dorso (hipótesis) salvo lo indicado en la tabla. */
function paletaAcuatico(id, est, extra) {
  const p = paleta(id, est, extra);
  p.membrana ??= p.dorso.map((v) => v * 0.9);
  p.membrana1 ??= p.vientre.map((v) => v * 0.8);
  return p;
}

export function prepararAcuatico(fila, cat) {
  const [id, arq, rol, est, o, e, pal] = fila;
  const c = cat[id];
  const P = medirAcuatico({ id, arq, L: c.tamano, masa: c.masa, o });
  const palx = paletaAcuatico(id, est, pal);
  const skin = SKIN[arq];
  const g = {
    familia: 'acuatico', P, build: (pal2) => construirAcuatico(P, pal2), pal: palx, hit: P.hit, vel: P.vel, cycle: P.cycle, stance: P.stance, step: P.step, hips: P.hips, radius: P.radius,
    anim: 'nado', skin, ancla: null, doble: true, nada: { ...P.nada, aleta: P.aletas.FL ? P.aletas.FL.Lf : 0.4 * P.L },
    uvK: skin === 'pez' ? uvKde(skin, c.tamano) * 2 : undefined,
  };
  return { id, g, e: { ...e, rol } };
}
