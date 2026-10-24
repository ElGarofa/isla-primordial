// Modelos procedurales de las especies añadidas en la Etapa 1: Tyrannosaurus, Parasaurolophus, Stegosaurus, Ankylosaurus y Gallimimus.
// Mismo contrato que los constructores de species.js: devuelven { geo, sk, legs, specs }. Unidades en metros, +z = adelante, +y = arriba.
import { SkinBuilder, makeSkeleton, PART, V } from './builder.js';
import { colorizer } from './color.js';

const ex = (name, parent, pos) => ({ name, parent, pos });

/** Propietarios de piel de un tubo que recorre huesos de cola a cabeza: cada segmento es del hueso padre de los dos extremos. */
function owners(specs, names) {
  const parent = Object.fromEntries(specs.map((s) => [s.name, s.parent]));
  const own = [names[0]];
  for (let i = 0; i < names.length - 1; i++) own.push(parent[names[i]] === names[i + 1] ? names[i + 1] : names[i]);
  return own;
}
/** Puntos del tubo principal: punta de cola + posición de reposo de cada hueso indicado. */
function chainPts(specs, names, tip) {
  const pos = Object.fromEntries(specs.map((s) => [s.name, s.pos]));
  return [V(...tip), ...names.map((n) => V(...pos[n]))];
}
/** Interpolación lineal y(z) y ry(z) de la línea dorsal (para colocar placas y escudos sobre el lomo). */
function perfil(pts, rx, ry) {
  return (z) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (z >= a.z && z <= b.z) { const t = (z - a.z) / Math.max(1e-6, b.z - a.z); return { y: a.y + (b.y - a.y) * t, rx: rx[i] + (rx[i + 1] - rx[i]) * t, ry: ry[i] + (ry[i + 1] - ry[i]) * t }; }
    }
    const e = z < pts[0].z ? 0 : pts.length - 1; return { y: pts[e].y, rx: rx[e], ry: ry[e] };
  };
}
const toeTube = (B, x, bone, dx, y0, z0, z1, r, rc) => {
  B.tube({ pts: [V(x + dx * 0.2, y0, z0), V(x + dx * 0.7, y0 * 0.55, (z0 + z1) / 2), V(x + dx, 0.04, z1)], rx: [r * 1.0, r * 0.85, r * 0.65], ry: [r * 0.9, r * 0.7, r * 0.55], owners: bone, sides: 6, sub: 1, uscale: 1, vscale: 1, cap0: false });
  B.spike(V(x + dx, 0.05, z1), V(x + dx * 1.05, 0.0, z1 + rc * 3.2), rc, bone, PART.garra, { sides: 5 });
};

// ---------------------------------------------------------------------------------------------- TYRANNOSAURUS
export function buildRex(o) {
  const specs = [
    ex('hips', null, [0, 3.15, 0]), ex('spine1', 'hips', [0, 3.3, 0.9]), ex('spine2', 'spine1', [0, 3.5, 1.7]), ex('neck1', 'spine2', [0, 3.85, 2.4]), ex('neck2', 'neck1', [0, 4.2, 2.9]), ex('head', 'neck2', [0, 4.25, 3.3]), ex('jaw', 'head', [0, 3.95, 3.55]),
    ex('tail1', 'hips', [0, 3.15, -0.9]), ex('tail2', 'tail1', [0, 3.05, -2.0]), ex('tail3', 'tail2', [0, 2.9, -3.2]), ex('tail4', 'tail3', [0, 2.7, -4.4]), ex('tail5', 'tail4', [0, 2.5, -5.4]),
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push(ex(`thigh${side}`, 'hips', [0.55 * sx, 3.0, 0.1]), ex(`shin${side}`, `thigh${side}`, [0.58 * sx, 1.7, 1.05]), ex(`foot${side}`, `shin${side}`, [0.55 * sx, 0.5, 0.25]));
    specs.push(ex(`arm${side}`, 'spine2', [0.42 * sx, 2.85, 1.7]), ex(`forearm${side}`, `arm${side}`, [0.46 * sx, 2.55, 1.9]));
  }
  const sk = makeSkeleton(specs), B = new SkinBuilder(sk.index);
  const names = ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'head'];
  B.tube({
    pts: chainPts(specs, names, [0, 2.35, -6.3]),
    rx: [0.02, 0.08, 0.15, 0.27, 0.43, 0.6, 0.72, 0.74, 0.66, 0.5, 0.38, 0.36], ry: [0.02, 0.1, 0.2, 0.36, 0.58, 0.8, 0.92, 0.95, 0.88, 0.64, 0.46, 0.42],
    owners: owners(specs, names), sides: 14, sub: 2, uscale: 3, vscale: 0.42,
  });
  // cráneo ancho y mandíbula
  B.tube({ pts: [V(0, 4.2, 3.25), V(0, 4.25, 3.7), V(0, 4.15, 4.2), V(0, 4.0, 4.7), V(0, 3.9, 4.95)], rx: [0.36, 0.5, 0.4, 0.3, 0.24], ry: [0.4, 0.46, 0.36, 0.26, 0.21], owners: 'head', sides: 12, sub: 2, uscale: 3, vscale: 0.5 });
  B.tube({ pts: [V(0, 3.9, 3.5), V(0, 3.72, 3.95), V(0, 3.68, 4.45), V(0, 3.7, 4.85)], rx: [0.3, 0.3, 0.22, 0.13], ry: [0.15, 0.13, 0.11, 0.08], owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 0.5 });
  for (const sx of [1, -1]) {
    B.blob(V(0.47 * sx, 4.38, 3.95), 0.07, 0.08, 0.08, 'head', PART.ojo, 8);
    B.blob(V(0.42 * sx, 4.62, 3.95), 0.1, 0.06, 0.2, 'head', PART.cuerpo, 8); // cresta superciliar
    for (let i = 0; i < 8; i++) {
      const z = 4.12 + i * 0.1, x = (0.27 - i * 0.012) * sx;
      B.spike(V(x, 3.8, z), V(x * 0.98, 3.58, z + 0.01), 0.028, 'head', PART.diente, { sides: 5 });
      if (i > 0 && i < 7) B.spike(V(x * 0.85, 3.76, z - 0.04), V(x * 0.85, 3.97, z - 0.04), 0.024, 'jaw', PART.diente, { sides: 5 });
    }
  }
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const x = 0.55 * sx;
    B.tube({ pts: [V(x, 3.02, 0.1), V(x * 1.05, 1.7, 1.05), V(x, 0.5, 0.25), V(x, 0.14, 0.8)], rx: [0.52, 0.36, 0.24, 0.24], ry: [0.6, 0.42, 0.26, 0.24], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 12, sub: 3, uscale: 3, vscale: 0.42 });
    B.blob(V(x * 1.05, 2.75, 0.2), 0.3, 0.5, 0.58, `thigh${side}`, PART.cuerpo, 8);
    for (const dx of [-0.17, 0, 0.17]) toeTube(B, x, `foot${side}`, dx, 0.14, 0.8, 1.3, 0.1, 0.045);
    // brazos vestigiales
    B.tube({ pts: [V(0.42 * sx, 2.85, 1.7), V(0.46 * sx, 2.55, 1.9), V(0.46 * sx, 2.3, 2.1)], rx: [0.09, 0.07, 0.055], ry: [0.09, 0.07, 0.055], owners: [`arm${side}`, `forearm${side}`], sides: 6, sub: 2, uscale: 1, vscale: 0.8 });
    for (const dz of [-0.03, 0.03]) B.spike(V(0.46 * sx + dz * sx, 2.3, 2.1), V(0.46 * sx + dz * sx, 2.14, 2.28), 0.025, `forearm${side}`, PART.garra, { sides: 4 });
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = ['L', 'R'].map((side, i) => ({ name: side, thigh: `thigh${side}`, shin: `shin${side}`, foot: `foot${side}`, phase: i * 0.5, bendFwd: true, toe: V(0.55 * (side === 'L' ? 1 : -1), 0.03, 0.95) }));
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- PARASAUROLOPHUS
export function buildParasaur(o) {
  const specs = [
    ex('hips', null, [0, 2.15, -0.7]), ex('spine1', 'hips', [0, 2.2, 0.35]), ex('spine2', 'spine1', [0, 2.15, 1.4]), ex('neck1', 'spine2', [0, 2.35, 2.1]), ex('neck2', 'neck1', [0, 2.8, 2.6]), ex('head', 'neck2', [0, 3.0, 3.0]), ex('jaw', 'head', [0, 2.8, 3.3]),
    ex('tail1', 'hips', [0, 2.15, -1.7]), ex('tail2', 'tail1', [0, 2.05, -2.9]), ex('tail3', 'tail2', [0, 1.9, -4.1]), ex('tail4', 'tail3', [0, 1.7, -5.2]),
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push(ex(`thigh${side}`, 'hips', [0.55 * sx, 1.95, -0.8]), ex(`shin${side}`, `thigh${side}`, [0.6 * sx, 1.05, -0.35]), ex(`foot${side}`, `shin${side}`, [0.55 * sx, 0.38, -0.8]));
    specs.push(ex(`fup${side}`, 'spine2', [0.5 * sx, 1.85, 1.3]), ex(`flow${side}`, `fup${side}`, [0.55 * sx, 1.05, 1.05]), ex(`ffoot${side}`, `flow${side}`, [0.52 * sx, 0.42, 1.35]));
  }
  const sk = makeSkeleton(specs), B = new SkinBuilder(sk.index);
  const names = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'head'];
  B.tube({
    pts: chainPts(specs, names, [0, 1.6, -6.2]),
    rx: [0.02, 0.08, 0.2, 0.36, 0.52, 0.8, 0.85, 0.78, 0.42, 0.27, 0.24], ry: [0.02, 0.09, 0.22, 0.4, 0.6, 0.85, 0.9, 0.82, 0.5, 0.32, 0.28],
    owners: owners(specs, names), sides: 14, sub: 2, uscale: 3.5, vscale: 0.4,
  });
  // cráneo de pico ancho (pato), mandíbula y cresta tubular
  B.tube({ pts: [V(0, 2.98, 2.95), V(0, 3.05, 3.25), V(0, 3.0, 3.6), V(0, 2.9, 3.9), V(0, 2.85, 4.1)], rx: [0.2, 0.24, 0.2, 0.27, 0.3], ry: [0.26, 0.25, 0.18, 0.12, 0.09], owners: 'head', sides: 10, sub: 2, uscale: 2.5, vscale: 0.6 });
  B.tube({ pts: [V(0, 2.8, 3.25), V(0, 2.72, 3.6), V(0, 2.68, 3.95), V(0, 2.7, 4.1)], rx: [0.17, 0.18, 0.24, 0.26], ry: [0.1, 0.08, 0.06, 0.05], owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 0.6 });
  B.tube({ pts: [V(0, 3.08, 3.88), V(0, 3.3, 3.68), V(0, 3.5, 3.2), V(0, 3.52, 2.65), V(0, 3.3, 2.15)], rx: [0.11, 0.17, 0.19, 0.17, 0.12], ry: [0.11, 0.18, 0.2, 0.17, 0.12], owners: 'head', sides: 10, sub: 3, part: PART.cresta, uscale: 2, vscale: 0.8 });
  for (const sx of [1, -1]) B.blob(V(0.22 * sx, 3.1, 3.35), 0.05, 0.055, 0.055, 'head', PART.ojo, 8);
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    B.tube({ pts: [V(0.55 * sx, 1.95, -0.8), V(0.6 * sx, 1.05, -0.35), V(0.55 * sx, 0.38, -0.8), V(0.55 * sx, 0.12, -0.55)], rx: [0.34, 0.24, 0.17, 0.18], ry: [0.4, 0.28, 0.18, 0.18], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5 });
    B.blob(V(0.62 * sx, 1.75, -0.7), 0.3, 0.45, 0.5, `thigh${side}`, PART.cuerpo, 8);
    B.tube({ pts: [V(0.5 * sx, 1.85, 1.3), V(0.55 * sx, 1.05, 1.05), V(0.52 * sx, 0.42, 1.35), V(0.52 * sx, 0.12, 1.5)], rx: [0.26, 0.2, 0.15, 0.17], ry: [0.3, 0.22, 0.16, 0.17], owners: [`fup${side}`, `flow${side}`, `ffoot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5 });
    B.blob(V(0.55 * sx, 0.07, -0.38), 0.15, 0.07, 0.17, `foot${side}`, PART.garra, 7);
    B.blob(V(0.52 * sx, 0.07, 1.62), 0.14, 0.07, 0.15, `ffoot${side}`, PART.garra, 7);
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = [
    { name: 'FL', thigh: 'fupL', shin: 'flowL', foot: 'ffootL', phase: 0, bendFwd: false, toe: V(0.52, 0.04, 1.55), quad: 'front' },
    { name: 'BR', thigh: 'thighR', shin: 'shinR', foot: 'footR', phase: 0, bendFwd: true, toe: V(-0.55, 0.04, -0.4) },
    { name: 'FR', thigh: 'fupR', shin: 'flowR', foot: 'ffootR', phase: 0.5, bendFwd: false, toe: V(-0.52, 0.04, 1.55), quad: 'front' },
    { name: 'BL', thigh: 'thighL', shin: 'shinL', foot: 'footL', phase: 0.5, bendFwd: true, toe: V(0.55, 0.04, -0.4) },
  ];
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- STEGOSAURUS
export function buildStego(o) {
  const specs = [
    ex('hips', null, [0, 2.1, -0.5]), ex('spine1', 'hips', [0, 2.0, 0.6]), ex('spine2', 'spine1', [0, 1.75, 1.6]), ex('neck1', 'spine2', [0, 1.45, 2.35]), ex('neck2', 'neck1', [0, 1.2, 2.9]), ex('head', 'neck2', [0, 1.0, 3.35]), ex('jaw', 'head', [0, 0.88, 3.6]),
    ex('tail1', 'hips', [0, 1.95, -1.5]), ex('tail2', 'tail1', [0, 1.75, -2.6]), ex('tail3', 'tail2', [0, 1.45, -3.6]), ex('tail4', 'tail3', [0, 1.2, -4.5]),
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push(ex(`thigh${side}`, 'hips', [0.6 * sx, 1.95, -0.6]), ex(`shin${side}`, `thigh${side}`, [0.65 * sx, 1.1, -0.2]), ex(`foot${side}`, `shin${side}`, [0.6 * sx, 0.4, -0.6]));
    specs.push(ex(`fup${side}`, 'spine2', [0.52 * sx, 1.5, 1.5]), ex(`flow${side}`, `fup${side}`, [0.58 * sx, 0.9, 1.3]), ex(`ffoot${side}`, `flow${side}`, [0.54 * sx, 0.38, 1.5]));
  }
  const sk = makeSkeleton(specs), B = new SkinBuilder(sk.index);
  const names = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'head'];
  const pts = chainPts(specs, names, [0, 1.05, -5.1]);
  const rx = [0.02, 0.07, 0.16, 0.3, 0.5, 0.8, 0.85, 0.7, 0.38, 0.25, 0.17], ry = [0.02, 0.09, 0.2, 0.38, 0.6, 0.85, 0.85, 0.72, 0.42, 0.27, 0.2];
  B.tube({ pts, rx, ry, owners: owners(specs, names), sides: 14, sub: 2, uscale: 3.5, vscale: 0.4 });
  // cabeza pequeña y baja con pico córneo
  B.tube({ pts: [V(0, 1.02, 3.3), V(0, 0.97, 3.55), V(0, 0.88, 3.8), V(0, 0.82, 3.95)], rx: [0.15, 0.15, 0.11, 0.07], ry: [0.18, 0.16, 0.12, 0.08], owners: 'head', sides: 8, sub: 2, uscale: 2, vscale: 0.6 });
  B.tube({ pts: [V(0, 0.88, 3.55), V(0, 0.78, 3.78), V(0, 0.76, 3.92)], rx: [0.1, 0.08, 0.05], ry: [0.05, 0.04, 0.03], owners: 'jaw', sides: 6, sub: 2, uscale: 1, vscale: 1 });
  B.blob(V(0, 0.8, 3.97), 0.07, 0.06, 0.1, 'head', PART.cuerno, 7);
  for (const sx of [1, -1]) B.blob(V(0.145 * sx, 1.05, 3.55), 0.04, 0.045, 0.045, 'head', PART.ojo, 7);
  // placas dorsales alternadas (kite): más altas sobre las caderas
  const f = perfil(pts, rx, ry);
  const dueno = (z) => (z > 1.6 ? 'spine2' : z > 0.6 ? 'spine1' : z > -1.5 ? 'hips' : z > -2.6 ? 'tail1' : z > -3.6 ? 'tail2' : 'tail3');
  for (let i = 0; i < 16; i++) {
    const z = 2.0 - i * 0.36, side = i % 2 ? -1 : 1, pr = f(z), h = 0.28 + 0.82 * Math.exp(-(((z - 0.1) / 1.7) ** 2)), W = 0.2 * h + 0.1;
    const bx = 0.09 * side, by = pr.y + pr.ry * 0.93, lat = 0.07 + 0.1 * (h / 1.1);
    B.tube({
      pts: [V(bx, by - 0.06, z), V(bx + lat * 0.35 * side, by + h * 0.38, z - 0.02), V(bx + lat * 0.75 * side, by + h * 0.78, z - 0.04), V(bx + lat * side, by + h, z - 0.06)],
      rx: [0.05, 0.05, 0.04, 0.012], ry: [W * 0.45, W, W * 0.85, W * 0.15], owners: dueno(z), sides: 6, sub: 2, part: PART.placa, uscale: 1, vscale: 1,
    });
  }
  // thagomizer: dos pares de púas en la punta de la cola
  for (const sx of [1, -1]) {
    B.spike(V(0.07 * sx, 1.28, -4.15), V(0.62 * sx, 1.62, -4.9), 0.065, 'tail4', PART.cuerno, { sides: 6 });
    B.spike(V(0.06 * sx, 1.2, -4.6), V(0.5 * sx, 1.4, -5.4), 0.06, 'tail4', PART.cuerno, { sides: 6 });
  }
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    B.tube({ pts: [V(0.6 * sx, 1.95, -0.6), V(0.65 * sx, 1.1, -0.2), V(0.6 * sx, 0.4, -0.6), V(0.6 * sx, 0.12, -0.38)], rx: [0.34, 0.24, 0.18, 0.19], ry: [0.4, 0.28, 0.19, 0.19], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5 });
    B.tube({ pts: [V(0.52 * sx, 1.5, 1.5), V(0.58 * sx, 0.9, 1.3), V(0.54 * sx, 0.38, 1.5), V(0.54 * sx, 0.12, 1.62)], rx: [0.24, 0.18, 0.15, 0.16], ry: [0.26, 0.2, 0.16, 0.16], owners: [`fup${side}`, `flow${side}`, `ffoot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5 });
    B.blob(V(0.6 * sx, 0.07, -0.2), 0.16, 0.07, 0.18, `foot${side}`, PART.garra, 7);
    B.blob(V(0.54 * sx, 0.07, 1.72), 0.14, 0.07, 0.15, `ffoot${side}`, PART.garra, 7);
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = [
    { name: 'FL', thigh: 'fupL', shin: 'flowL', foot: 'ffootL', phase: 0, bendFwd: false, toe: V(0.54, 0.04, 1.62), quad: 'front' },
    { name: 'BR', thigh: 'thighR', shin: 'shinR', foot: 'footR', phase: 0, bendFwd: true, toe: V(-0.6, 0.04, -0.25) },
    { name: 'FR', thigh: 'fupR', shin: 'flowR', foot: 'ffootR', phase: 0.5, bendFwd: false, toe: V(-0.54, 0.04, 1.62), quad: 'front' },
    { name: 'BL', thigh: 'thighL', shin: 'shinL', foot: 'footL', phase: 0.5, bendFwd: true, toe: V(0.6, 0.04, -0.25) },
  ];
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- ANKYLOSAURUS
export function buildAnkylo(o) {
  const specs = [
    ex('hips', null, [0, 1.2, -0.6]), ex('spine1', 'hips', [0, 1.25, 0.3]), ex('spine2', 'spine1', [0, 1.2, 1.2]), ex('neck1', 'spine2', [0, 1.1, 1.9]), ex('head', 'neck1', [0, 0.95, 2.35]), ex('jaw', 'head', [0, 0.78, 2.6]),
    ex('tail1', 'hips', [0, 1.1, -1.6]), ex('tail2', 'tail1', [0, 1.0, -2.7]), ex('tail3', 'tail2', [0, 0.9, -3.7]), ex('tail4', 'tail3', [0, 0.82, -4.5]),
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push(ex(`thigh${side}`, 'hips', [0.7 * sx, 1.0, -0.65]), ex(`shin${side}`, `thigh${side}`, [0.74 * sx, 0.55, -0.4]), ex(`foot${side}`, `shin${side}`, [0.7 * sx, 0.27, -0.65]));
    specs.push(ex(`fup${side}`, 'spine2', [0.72 * sx, 1.0, 1.1]), ex(`flow${side}`, `fup${side}`, [0.78 * sx, 0.55, 0.95]), ex(`ffoot${side}`, `flow${side}`, [0.74 * sx, 0.27, 1.12]));
  }
  const sk = makeSkeleton(specs), B = new SkinBuilder(sk.index);
  const names = ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', 'neck1', 'head'];
  const pts = chainPts(specs, names, [0, 0.8, -4.9]);
  const rx = [0.12, 0.16, 0.22, 0.38, 0.6, 0.95, 1.05, 0.95, 0.55, 0.4], ry = [0.1, 0.13, 0.2, 0.3, 0.45, 0.6, 0.62, 0.58, 0.4, 0.3];
  B.tube({ pts, rx, ry, owners: owners(specs, names), sides: 16, sub: 2, uscale: 4, vscale: 0.5 });
  // maza caudal
  B.blob(V(0, 0.82, -4.95), 0.5, 0.3, 0.42, 'tail4', PART.cuerno, 10);
  for (const sx of [1, -1]) B.blob(V(0.5 * sx, 0.8, -4.95), 0.2, 0.19, 0.24, 'tail4', PART.cuerno, 8);
  // cabeza ancha con cuernos escamosales y yugales
  B.tube({ pts: [V(0, 0.98, 2.3), V(0, 0.95, 2.6), V(0, 0.85, 2.95), V(0, 0.78, 3.15)], rx: [0.4, 0.42, 0.3, 0.17], ry: [0.28, 0.27, 0.2, 0.14], owners: 'head', sides: 10, sub: 2, uscale: 3, vscale: 0.7 });
  B.tube({ pts: [V(0, 0.78, 2.55), V(0, 0.7, 2.85), V(0, 0.68, 3.05)], rx: [0.28, 0.2, 0.12], ry: [0.1, 0.08, 0.06], owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 0.7 });
  B.blob(V(0, 0.76, 3.15), 0.12, 0.08, 0.1, 'head', PART.cuerno, 7);
  for (const sx of [1, -1]) {
    B.blob(V(0.36 * sx, 1.03, 2.55), 0.05, 0.055, 0.055, 'head', PART.ojo, 7);
    B.spike(V(0.36 * sx, 1.15, 2.25), V(0.8 * sx, 1.3, 1.9), 0.09, 'head', PART.cuerno, { sides: 6 });
    B.spike(V(0.4 * sx, 0.88, 2.4), V(0.72 * sx, 0.8, 2.08), 0.07, 'head', PART.cuerno, { sides: 6 });
  }
  // escudo de osteodermos sobre el lomo y púas laterales
  const f = perfil(pts, rx, ry);
  const dueno = (z) => (z > 1.2 ? 'spine2' : z > 0.3 ? 'spine1' : z > -1.6 ? 'hips' : z > -2.7 ? 'tail1' : 'tail2');
  const rows = [1.65, 1.2, 0.75, 0.3, -0.15, -0.6, -1.05, -1.5, -1.95];
  for (const z of rows) {
    const pr = f(z), cols = z > -1.4 ? [-0.62, -0.31, 0, 0.31, 0.62] : [-0.3, 0, 0.3];
    for (const k of cols) {
      const x = k * pr.rx, y = pr.y + pr.ry * Math.sqrt(Math.max(0.02, 1 - (x / pr.rx) ** 2)) * 0.97;
      const s = z > -1.4 ? 1 : 0.7;
      B.blob(V(x, y, z), 0.16 * s, 0.085 * s, 0.17 * s, dueno(z), PART.cuerno, 7);
      B.spike(V(x, y + 0.03, z), V(x * 1.04, y + 0.2 * s, z - 0.03), 0.05 * s, dueno(z), PART.cuerno, { sides: 5 });
    }
  }
  for (const sx of [1, -1]) for (let i = 0; i < 7; i++) {
    const z = 1.55 - i * 0.45, pr = f(z), y = pr.y + pr.ry * 0.15;
    B.spike(V(pr.rx * 0.95 * sx, y, z), V((pr.rx + 0.5) * sx, y - 0.04, z - 0.15), 0.08, dueno(z), PART.cuerno, { sides: 6 });
  }
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    B.tube({ pts: [V(0.7 * sx, 1.0, -0.65), V(0.74 * sx, 0.55, -0.4), V(0.7 * sx, 0.27, -0.65), V(0.7 * sx, 0.1, -0.4)], rx: [0.3, 0.22, 0.18, 0.2], ry: [0.34, 0.24, 0.19, 0.2], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5 });
    B.tube({ pts: [V(0.72 * sx, 1.0, 1.1), V(0.78 * sx, 0.55, 0.95), V(0.74 * sx, 0.27, 1.12), V(0.74 * sx, 0.1, 1.25)], rx: [0.26, 0.2, 0.17, 0.19], ry: [0.3, 0.22, 0.17, 0.19], owners: [`fup${side}`, `flow${side}`, `ffoot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5 });
    B.blob(V(0.7 * sx, 0.06, -0.28), 0.16, 0.06, 0.17, `foot${side}`, PART.garra, 7);
    B.blob(V(0.74 * sx, 0.06, 1.34), 0.15, 0.06, 0.16, `ffoot${side}`, PART.garra, 7);
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = [
    { name: 'FL', thigh: 'fupL', shin: 'flowL', foot: 'ffootL', phase: 0, bendFwd: false, toe: V(0.74, 0.04, 1.25), quad: 'front' },
    { name: 'BR', thigh: 'thighR', shin: 'shinR', foot: 'footR', phase: 0, bendFwd: true, toe: V(-0.7, 0.04, -0.3) },
    { name: 'FR', thigh: 'fupR', shin: 'flowR', foot: 'ffootR', phase: 0.5, bendFwd: false, toe: V(-0.74, 0.04, 1.25), quad: 'front' },
    { name: 'BL', thigh: 'thighL', shin: 'shinL', foot: 'footL', phase: 0.5, bendFwd: true, toe: V(0.7, 0.04, -0.3) },
  ];
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- GALLIMIMUS
export function buildGallimimus(o) {
  const specs = [
    ex('hips', null, [0, 1.75, 0]), ex('spine1', 'hips', [0, 1.8, 0.5]), ex('spine2', 'spine1', [0, 1.9, 1.0]), ex('neck1', 'spine2', [0, 2.15, 1.35]), ex('neck2', 'neck1', [0, 2.65, 1.65]), ex('head', 'neck2', [0, 3.1, 1.95]), ex('jaw', 'head', [0, 3.0, 2.05]),
    ex('tail1', 'hips', [0, 1.75, -0.6]), ex('tail2', 'tail1', [0, 1.7, -1.3]), ex('tail3', 'tail2', [0, 1.65, -2.0]), ex('tail4', 'tail3', [0, 1.6, -2.7]), ex('tail5', 'tail4', [0, 1.55, -3.3]),
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push(ex(`thigh${side}`, 'hips', [0.2 * sx, 1.6, 0.05]), ex(`shin${side}`, `thigh${side}`, [0.22 * sx, 0.95, 0.55]), ex(`foot${side}`, `shin${side}`, [0.2 * sx, 0.4, 0.05]));
    specs.push(ex(`arm${side}`, 'spine2', [0.15 * sx, 1.95, 0.95]), ex(`forearm${side}`, `arm${side}`, [0.18 * sx, 1.65, 1.1]));
  }
  const sk = makeSkeleton(specs), B = new SkinBuilder(sk.index);
  const names = ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'head'];
  B.tube({
    pts: chainPts(specs, names, [0, 1.5, -3.8]),
    rx: [0.01, 0.03, 0.05, 0.08, 0.11, 0.16, 0.3, 0.31, 0.26, 0.13, 0.09, 0.07], ry: [0.01, 0.035, 0.06, 0.1, 0.15, 0.22, 0.36, 0.38, 0.32, 0.16, 0.11, 0.09],
    owners: owners(specs, names), sides: 10, sub: 2, uscale: 2.5, vscale: 0.8,
  });
  B.tube({ pts: [V(0, 3.08, 1.9), V(0, 3.1, 2.05), V(0, 3.07, 2.25), V(0, 3.02, 2.45)], rx: [0.07, 0.075, 0.055, 0.03], ry: [0.08, 0.08, 0.06, 0.035], owners: 'head', sides: 8, sub: 2, uscale: 2, vscale: 1 });
  B.tube({ pts: [V(0, 3.0, 2.05), V(0, 2.97, 2.25), V(0, 2.97, 2.4)], rx: [0.04, 0.035, 0.02], ry: [0.025, 0.02, 0.015], owners: 'jaw', sides: 6, sub: 2, uscale: 1, vscale: 1 });
  B.blob(V(0, 3.02, 2.45), 0.03, 0.03, 0.05, 'head', PART.cuerno, 6);
  for (const sx of [1, -1]) B.blob(V(0.078 * sx, 3.13, 2.05), 0.035, 0.04, 0.04, 'head', PART.ojo, 7);
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const x = 0.2 * sx;
    B.tube({ pts: [V(x, 1.62, 0.05), V(0.22 * sx, 0.95, 0.55), V(x, 0.4, 0.05), V(x, 0.1, 0.4)], rx: [0.12, 0.075, 0.04, 0.035], ry: [0.15, 0.09, 0.05, 0.04], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 8, sub: 3, uscale: 2, vscale: 0.8 });
    B.blob(V(x * 1.1, 1.5, 0.1), 0.13, 0.17, 0.2, `thigh${side}`, PART.cuerpo, 7);
    for (const dx of [-0.05, 0, 0.05]) toeTube(B, x, `foot${side}`, dx, 0.1, 0.4, 0.62, 0.025, 0.012);
    B.tube({ pts: [V(0.15 * sx, 1.95, 0.95), V(0.18 * sx, 1.65, 1.1), V(0.2 * sx, 1.45, 1.35)], rx: [0.035, 0.028, 0.02], ry: [0.035, 0.028, 0.02], owners: [`arm${side}`, `forearm${side}`], sides: 5, sub: 2, uscale: 1, vscale: 1 });
    for (const dx of [-0.02, 0, 0.02]) B.spike(V(0.2 * sx + dx, 1.45, 1.35), V(0.2 * sx + dx * 1.5, 1.3, 1.5), 0.01, `forearm${side}`, PART.garra, { sides: 4 });
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = ['L', 'R'].map((side, i) => ({ name: side, thigh: `thigh${side}`, shin: `shin${side}`, foot: `foot${side}`, phase: i * 0.5, bendFwd: true, toe: V(0.2 * (side === 'L' ? 1 : -1), 0.03, 0.45) }));
  return { geo, sk, legs, specs };
}
