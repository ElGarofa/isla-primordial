// Definición de especies: esqueleto, malla con piel, patas para IK, esferas de impacto, IA y botín.
import * as THREE from 'three';
import { SkinBuilder, makeSkeleton, PART, V } from './builder.js';
import { colorizer } from './color.js';
import { buildRex, buildParasaur, buildStego, buildAnkylo, buildGallimimus } from './modelos.js';
import { DETALLE, POR_ID, marcarImplementadas } from './catalogo.js';

export { colorizer };

// ---------------------------------------------------------------------------------------------- TERÓPODOS (raptor / compsognatus)
function buildTheropod(s, o = {}) {
  const tk = o.tailK ?? 1, th = o.thin ?? 1;
  const P = (x, y, z) => [x * s, y * s, (z < 0 ? z * tk : z) * s];
  const V3 = (x, y, z) => V(...P(x, y, z));
  const specs = [
    { name: 'hips', parent: null, pos: P(0, 1.05, 0) }, { name: 'spine1', parent: 'hips', pos: P(0, 1.10, 0.38) }, { name: 'spine2', parent: 'spine1', pos: P(0, 1.20, 0.72) },
    { name: 'neck1', parent: 'spine2', pos: P(0, 1.33, 0.98) }, { name: 'neck2', parent: 'neck1', pos: P(0, 1.52, 1.12) }, { name: 'head', parent: 'neck2', pos: P(0, 1.66, 1.30) }, { name: 'jaw', parent: 'head', pos: P(0, 1.60, 1.40) },
    { name: 'tail1', parent: 'hips', pos: P(0, 1.05, -0.30) }, { name: 'tail2', parent: 'tail1', pos: P(0, 1.0, -0.85) }, { name: 'tail3', parent: 'tail2', pos: P(0, 0.95, -1.45) },
    { name: 'tail4', parent: 'tail3', pos: P(0, 0.9, -2.0) }, { name: 'tail5', parent: 'tail4', pos: P(0, 0.88, -2.5) },
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push({ name: `thigh${side}`, parent: 'hips', pos: P(0.2 * sx, 1.0, 0.05) }, { name: `shin${side}`, parent: `thigh${side}`, pos: P(0.2 * sx, 0.62, 0.30) }, { name: `foot${side}`, parent: `shin${side}`, pos: P(0.2 * sx, 0.33, 0.12) });
    specs.push({ name: `arm${side}`, parent: 'spine2', pos: P(0.17 * sx, 1.13, 0.7) }, { name: `forearm${side}`, parent: `arm${side}`, pos: P(0.2 * sx, 0.98, 0.8) });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);
  const R = (a) => a.map((v) => v * s * th);
  // tronco + cola + cuello
  B.tube({
    pts: [V3(0, 0.86, -2.85), V3(0, 0.88, -2.5), V3(0, 0.9, -2.0), V3(0, 0.95, -1.45), V3(0, 1.0, -0.85), V3(0, 1.05, -0.3), V3(0, 1.05, 0), V3(0, 1.10, 0.38), V3(0, 1.20, 0.72), V3(0, 1.33, 0.98), V3(0, 1.52, 1.12), V3(0, 1.66, 1.30)],
    rx: R([0.012, 0.03, 0.05, 0.075, 0.115, 0.17, 0.2, 0.215, 0.19, 0.115, 0.085, 0.085]), ry: R([0.012, 0.035, 0.06, 0.09, 0.14, 0.2, 0.26, 0.275, 0.25, 0.14, 0.095, 0.1]),
    owners: ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'hips', 'spine1', 'spine2', 'neck1', 'neck2'], sides: 12, sub: 2, uscale: 3, vscale: 1.1 / s * 0.5,
  });
  // cabeza y mandíbula
  B.tube({ pts: [V3(0, 1.66, 1.24), V3(0, 1.69, 1.38), V3(0, 1.66, 1.54), V3(0, 1.62, 1.72), V3(0, 1.58, 1.88)], rx: R([0.095, 0.105, 0.085, 0.058, 0.04]), ry: R([0.1, 0.115, 0.09, 0.062, 0.045]), owners: 'head', sides: 10, sub: 2, uscale: 2, vscale: 1.1 / s * 0.5 });
  B.tube({ pts: [V3(0, 1.58, 1.4), V3(0, 1.55, 1.6), V3(0, 1.53, 1.78), V3(0, 1.52, 1.86)], rx: R([0.06, 0.052, 0.036, 0.025]), ry: R([0.03, 0.028, 0.02, 0.014]), owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 1.1 / s * 0.5 });
  for (const sx of [1, -1]) {
    B.blob(V3(0.088 * sx, 1.705, 1.46), 0.026 * s, 0.03 * s, 0.03 * s, 'head', PART.ojo, 8);
    for (let i = 0; i < 6; i++) {
      const z = 1.6 + i * 0.045, x = (0.046 - i * 0.004) * sx;
      B.spike(V3(x, 1.572, z), V3(x * 0.95, 1.525, z + 0.006), 0.008 * s, 'head', PART.diente, { sides: 5 });
      if (i > 0) B.spike(V3(x * 0.8, 1.547, z - 0.02), V3(x * 0.8, 1.592, z - 0.02), 0.007 * s, 'jaw', PART.diente, { sides: 5 });
    }
  }
  // patas (un solo tubo con tres huesos: muslo, espinilla, pie)
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const x = 0.2 * sx;
    B.tube({ pts: [V3(x, 1.02, 0.05), V3(x, 0.62, 0.30), V3(x, 0.33, 0.12), V3(x, 0.07, 0.30)], rx: R([0.095, 0.06, 0.04, 0.035]), ry: R([0.12, 0.075, 0.045, 0.04]), owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 8, sub: 3, uscale: 2, vscale: 1.1 / s * 0.5 });
    B.blob(V3(x * 1.08, 0.93, 0.08), 0.1 * s * th, 0.13 * s * th, 0.15 * s * th, `thigh${side}`, PART.cuerpo, 8);
    for (const dx of [-0.05, 0, 0.05]) {
      B.tube({ pts: [V3(x, 0.07, 0.3), V3(x + dx * 0.6, 0.04, 0.42), V3(x + dx, 0.02, 0.52)], rx: R([0.026, 0.02, 0.014]), ry: R([0.02, 0.016, 0.012]), owners: `foot${side}`, sides: 6, sub: 1, uscale: 1, vscale: 1, cap0: false });
      B.spike(V3(x + dx, 0.02, 0.52), V3(x + dx * 1.1, 0.0, 0.6), 0.013 * s, `foot${side}`, PART.garra, { sides: 5 });
    }
    if (!o.noSickle) B.spike(V3(x * 0.88, 0.15, 0.33), V3(x * 0.88, 0.03, 0.55), 0.024 * s, `foot${side}`, PART.garra, { sides: 6, bend: V(0, 0.07 * s, 0.05 * s) });
    // brazos
    B.tube({ pts: [V3(0.17 * sx, 1.13, 0.7), V3(0.2 * sx, 0.98, 0.8), V3(0.2 * sx, 0.9, 0.95), V3(0.2 * sx, 0.84, 1.08)], rx: R([0.042, 0.03, 0.025, 0.02]), ry: R([0.042, 0.03, 0.025, 0.02]), owners: [`arm${side}`, `forearm${side}`, `forearm${side}`], sides: 6, sub: 2, uscale: 2, vscale: 1.1 / s * 0.5 });
    for (const dx of [-0.03, 0, 0.03]) B.spike(V3(x + dx * 0.4 * sx, 0.845, 1.08), V3(x + dx * 0.8 * sx, 0.8, 1.17), 0.011 * s, `forearm${side}`, PART.garra, { sides: 4 });
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = ['L', 'R'].map((side, i) => ({
    name: side, thigh: `thigh${side}`, shin: `shin${side}`, foot: `foot${side}`, phase: i * 0.5, bendFwd: true,
    toe: V(...P(0.2 * (side === 'L' ? 1 : -1), 0.03, 0.3)),
  }));
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- TRICERATOPS
function buildTricera(o) {
  const specs = [
    { name: 'hips', parent: null, pos: [0, 1.75, -0.8] }, { name: 'spine1', parent: 'hips', pos: [0, 1.85, 0] }, { name: 'spine2', parent: 'spine1', pos: [0, 1.95, 0.9] }, { name: 'neck1', parent: 'spine2', pos: [0, 1.9, 1.7] },
    { name: 'head', parent: 'neck1', pos: [0, 1.78, 2.25] }, { name: 'jaw', parent: 'head', pos: [0, 1.55, 2.5] },
    { name: 'tail1', parent: 'hips', pos: [0, 1.7, -1.6] }, { name: 'tail2', parent: 'tail1', pos: [0, 1.55, -2.5] }, { name: 'tail3', parent: 'tail2', pos: [0, 1.4, -3.3] }, { name: 'tail4', parent: 'tail3', pos: [0, 1.25, -4.0] },
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push({ name: `thigh${side}`, parent: 'hips', pos: [0.55 * sx, 1.7, -0.9] }, { name: `shin${side}`, parent: `thigh${side}`, pos: [0.62 * sx, 1.05, -0.55] }, { name: `foot${side}`, parent: `shin${side}`, pos: [0.58 * sx, 0.5, -0.85] });
    specs.push({ name: `fup${side}`, parent: 'spine2', pos: [0.62 * sx, 1.65, 1.0] }, { name: `flow${side}`, parent: `fup${side}`, pos: [0.72 * sx, 1.0, 0.78] }, { name: `ffoot${side}`, parent: `flow${side}`, pos: [0.68 * sx, 0.5, 1.0] });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);
  B.tube({
    pts: [V(0, 1.15, -4.4), V(0, 1.25, -4.0), V(0, 1.4, -3.3), V(0, 1.55, -2.5), V(0, 1.7, -1.6), V(0, 1.75, -0.8), V(0, 1.85, 0), V(0, 1.95, 0.9), V(0, 1.9, 1.7), V(0, 1.78, 2.25)],
    rx: [0.02, 0.06, 0.12, 0.2, 0.34, 0.62, 0.78, 0.75, 0.5, 0.38], ry: [0.02, 0.07, 0.14, 0.24, 0.4, 0.72, 0.88, 0.86, 0.58, 0.44],
    owners: ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'hips', 'spine1', 'spine2', 'neck1'], sides: 16, sub: 2, uscale: 4, vscale: 0.55,
  });
  B.tube({ pts: [V(0, 1.78, 2.2), V(0, 1.8, 2.45), V(0, 1.72, 2.8), V(0, 1.62, 3.15), V(0, 1.5, 3.4)], rx: [0.34, 0.34, 0.26, 0.15, 0.06], ry: [0.4, 0.38, 0.3, 0.2, 0.13], owners: 'head', sides: 12, sub: 2, uscale: 3, vscale: 0.6 });
  B.tube({ pts: [V(0, 1.56, 2.5), V(0, 1.47, 2.9), V(0, 1.4, 3.22)], rx: [0.21, 0.13, 0.05], ry: [0.08, 0.065, 0.04], owners: 'jaw', sides: 8, sub: 3, uscale: 2, vscale: 0.6 });
  B.blob(V(0, 1.5, 3.34), 0.09, 0.12, 0.17, 'head', PART.cuerno, 8); // pico córneo
  // gola (escudo óseo) con borde de nudos
  B.tube({ pts: [V(0, 2.2, 1.86), V(0, 2.2, 1.93), V(0, 2.2, 2.0), V(0, 2.2, 2.08)], rx: [0.06, 0.86, 0.86, 0.06], ry: [0.05, 0.78, 0.78, 0.05], owners: 'head', sides: 20, sub: 1, part: PART.gola, uscale: 2, vscale: 1, cap0: true, cap1: true });
  for (let i = 0; i < 17; i++) {
    const a = -0.25 + (i / 16) * (Math.PI + 0.5), bx = Math.cos(a) * 0.82, by = 2.2 + Math.sin(a) * 0.74;
    B.spike(V(bx, by, 1.97), V(bx * 1.1, 2.2 + (by - 2.2) * 1.13, 1.97), 0.05, 'head', PART.cuerno, { sides: 5 });
  }
  for (const sx of [1, -1]) {
    B.spike(V(0.27 * sx, 1.96, 2.5), V(0.5 * sx, 2.08, 3.55), 0.1, 'head', PART.cuerno, { sides: 8, bend: V(0.02 * sx, 0.15, 0) });
    B.blob(V(0.34 * sx, 1.86, 2.52), 0.042, 0.05, 0.05, 'head', PART.ojo, 8);
  }
  B.spike(V(0, 1.72, 3.0), V(0, 2.02, 3.3), 0.075, 'head', PART.cuerno, { sides: 8, bend: V(0, 0.03, 0.04) });
  // patas
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    B.tube({ pts: [V(0.55 * sx, 1.72, -0.9), V(0.62 * sx, 1.05, -0.55), V(0.58 * sx, 0.5, -0.85), V(0.58 * sx, 0.12, -0.78)], rx: [0.36, 0.24, 0.19, 0.21], ry: [0.38, 0.28, 0.2, 0.23], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.6 });
    B.tube({ pts: [V(0.62 * sx, 1.66, 1.0), V(0.72 * sx, 1.0, 0.78), V(0.68 * sx, 0.5, 1.0), V(0.68 * sx, 0.12, 1.08)], rx: [0.3, 0.2, 0.17, 0.2], ry: [0.32, 0.22, 0.18, 0.22], owners: [`fup${side}`, `flow${side}`, `ffoot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.6 });
    for (const [px, pz, bone] of [[0.58 * sx, -0.7, `foot${side}`], [0.68 * sx, 1.15, `ffoot${side}`]]) for (const dx of [-0.12, 0, 0.12]) B.blob(V(px + dx, 0.06, pz + 0.14), 0.075, 0.06, 0.11, bone, PART.garra, 7);
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = [
    { name: 'FL', thigh: 'fupL', shin: 'flowL', foot: 'ffootL', phase: 0, bendFwd: false, toe: V(0.68, 0.04, 1.1), quad: 'front' },
    { name: 'BR', thigh: 'thighR', shin: 'shinR', foot: 'footR', phase: 0, bendFwd: true, toe: V(-0.58, 0.04, -0.7) },
    { name: 'FR', thigh: 'fupR', shin: 'flowR', foot: 'ffootR', phase: 0.5, bendFwd: false, toe: V(-0.68, 0.04, 1.1), quad: 'front' },
    { name: 'BL', thigh: 'thighL', shin: 'shinL', foot: 'footL', phase: 0.5, bendFwd: true, toe: V(0.58, 0.04, -0.7) },
  ];
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- BRAQUIOSAURIO
function buildBrachio(o) {
  const specs = [
    { name: 'hips', parent: null, pos: [0, 4.6, -1.5] }, { name: 'spine1', parent: 'hips', pos: [0, 4.7, 0] }, { name: 'spine2', parent: 'spine1', pos: [0, 5.0, 1.8] },
    { name: 'neck1', parent: 'spine2', pos: [0, 5.6, 2.9] }, { name: 'neck2', parent: 'neck1', pos: [0, 7.5, 3.6] }, { name: 'neck3', parent: 'neck2', pos: [0, 9.4, 4.1] }, { name: 'neck4', parent: 'neck3', pos: [0, 11.2, 4.5] },
    { name: 'head', parent: 'neck4', pos: [0, 12.2, 4.9] }, { name: 'jaw', parent: 'head', pos: [0, 12.1, 5.25] },
    { name: 'tail1', parent: 'hips', pos: [0, 4.4, -3.2] }, { name: 'tail2', parent: 'tail1', pos: [0, 4.0, -5.2] }, { name: 'tail3', parent: 'tail2', pos: [0, 3.4, -7.4] }, { name: 'tail4', parent: 'tail3', pos: [0, 2.8, -9.5] },
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push({ name: `thigh${side}`, parent: 'hips', pos: [1.05 * sx, 4.6, -1.4] }, { name: `shin${side}`, parent: `thigh${side}`, pos: [1.05 * sx, 2.7, -1.35] }, { name: `foot${side}`, parent: `shin${side}`, pos: [1.05 * sx, 1.1, -1.5] });
    specs.push({ name: `fup${side}`, parent: 'spine2', pos: [0.95 * sx, 4.9, 1.8] }, { name: `flow${side}`, parent: `fup${side}`, pos: [1.0 * sx, 3.0, 1.85] }, { name: `ffoot${side}`, parent: `flow${side}`, pos: [1.0 * sx, 1.15, 1.9] });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);
  B.tube({
    pts: [V(0, 2.5, -10.3), V(0, 2.8, -9.5), V(0, 3.4, -7.4), V(0, 4.0, -5.2), V(0, 4.4, -3.2), V(0, 4.6, -1.5), V(0, 4.7, 0), V(0, 5.0, 1.8), V(0, 5.6, 2.9), V(0, 7.5, 3.6), V(0, 9.4, 4.1), V(0, 11.2, 4.5), V(0, 12.2, 4.9)],
    rx: [0.05, 0.18, 0.4, 0.65, 1.0, 1.55, 1.7, 1.5, 0.9, 0.5, 0.38, 0.3, 0.26], ry: [0.05, 0.2, 0.45, 0.75, 1.1, 1.65, 1.8, 1.65, 1.1, 0.6, 0.45, 0.34, 0.28],
    owners: ['tail4', 'tail3', 'tail2', 'tail1', 'hips', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'neck3', 'neck4'], sides: 16, sub: 2, uscale: 5, vscale: 0.3,
  });
  B.tube({ pts: [V(0, 12.15, 4.8), V(0, 12.35, 5.05), V(0, 12.3, 5.4), V(0, 12.15, 5.72)], rx: [0.2, 0.22, 0.17, 0.12], ry: [0.22, 0.26, 0.2, 0.14], owners: 'head', sides: 10, sub: 2, uscale: 2, vscale: 0.8 });
  B.tube({ pts: [V(0, 12.1, 5.2), V(0, 12.05, 5.5), V(0, 12.02, 5.7)], rx: [0.12, 0.09, 0.06], ry: [0.05, 0.04, 0.03], owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 0.8 });
  B.blob(V(0, 12.62, 5.0), 0.17, 0.2, 0.26, 'head', PART.cuerpo, 8);
  for (const sx of [1, -1]) {
    B.blob(V(0.2 * sx, 12.5, 5.15), 0.05, 0.06, 0.06, 'head', PART.ojo, 8);
    for (let i = 0; i < 6; i++) B.spike(V((0.06 - i * 0.004) * sx, 12.17, 5.5 + i * 0.045), V((0.055 - i * 0.004) * sx, 12.07, 5.5 + i * 0.045), 0.012, 'head', PART.diente, { sides: 4 });
  }
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    B.tube({ pts: [V(1.05 * sx, 4.7, -1.4), V(1.05 * sx, 2.7, -1.35), V(1.05 * sx, 1.1, -1.5), V(1.05 * sx, 0.14, -1.4)], rx: [0.7, 0.5, 0.4, 0.5], ry: [0.75, 0.55, 0.45, 0.55], owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 12, sub: 3, uscale: 4, vscale: 0.3 });
    B.tube({ pts: [V(0.95 * sx, 4.95, 1.8), V(1.0 * sx, 3.0, 1.85), V(1.0 * sx, 1.15, 1.9), V(1.0 * sx, 0.14, 1.95)], rx: [0.62, 0.5, 0.42, 0.5], ry: [0.65, 0.52, 0.45, 0.55], owners: [`fup${side}`, `flow${side}`, `ffoot${side}`], sides: 12, sub: 3, uscale: 4, vscale: 0.3 });
    for (const [px, pz, bone] of [[1.05 * sx, -1.3, `foot${side}`], [1.0 * sx, 2.05, `ffoot${side}`]]) for (const dx of [-0.28, 0, 0.28]) B.blob(V(px + dx, 0.1, pz + 0.3), 0.14, 0.1, 0.2, bone, PART.garra, 7);
  }
  const geo = B.finish(colorizer(o.pal));
  const legs = [
    { name: 'FL', thigh: 'fupL', shin: 'flowL', foot: 'ffootL', phase: 0, bendFwd: false, toe: V(1.0, 0.06, 2.1), quad: 'front' },
    { name: 'BR', thigh: 'thighR', shin: 'shinR', foot: 'footR', phase: 0, bendFwd: true, toe: V(-1.05, 0.06, -1.2) },
    { name: 'FR', thigh: 'fupR', shin: 'flowR', foot: 'ffootR', phase: 0.5, bendFwd: false, toe: V(-1.0, 0.06, 2.1), quad: 'front' },
    { name: 'BL', thigh: 'thighL', shin: 'shinL', foot: 'footL', phase: 0.5, bendFwd: true, toe: V(1.05, 0.06, -1.2) },
  ];
  return { geo, sk, legs, specs };
}

// ---------------------------------------------------------------------------------------------- PTERANODON
function buildPtera(o) {
  const specs = [
    { name: 'hips', parent: null, pos: [0, 0, 0] }, { name: 'spine1', parent: 'hips', pos: [0, 0.05, 0.35] }, { name: 'neck1', parent: 'spine1', pos: [0, 0.18, 0.6] }, { name: 'head', parent: 'neck1', pos: [0, 0.32, 0.85] }, { name: 'jaw', parent: 'head', pos: [0, 0.3, 1.0] },
    { name: 'tail', parent: 'hips', pos: [0, -0.02, -0.35] },
  ];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    specs.push({ name: `sh${side}`, parent: 'spine1', pos: [0.14 * sx, 0.1, 0.3] }, { name: `el${side}`, parent: `sh${side}`, pos: [1.0 * sx, 0.14, 0.18] }, { name: `wr${side}`, parent: `el${side}`, pos: [2.0 * sx, 0.12, 0.0] },
    { name: `legU${side}`, parent: 'hips', pos: [0.1 * sx, -0.08, -0.2] });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);
  B.tube({ pts: [V(0, -0.02, -0.7), V(0, -0.02, -0.35), V(0, 0, 0), V(0, 0.05, 0.35), V(0, 0.18, 0.6), V(0, 0.32, 0.85)], rx: [0.01, 0.04, 0.14, 0.16, 0.07, 0.06], ry: [0.01, 0.04, 0.14, 0.17, 0.08, 0.07], owners: ['tail', 'hips', 'hips', 'spine1', 'neck1'], sides: 10, sub: 2, uscale: 2, vscale: 1.2 });
  B.tube({ pts: [V(0, 0.3, 0.8), V(0, 0.34, 0.95), V(0, 0.33, 1.25), V(0, 0.3, 1.62)], rx: [0.06, 0.06, 0.035, 0.008], ry: [0.065, 0.06, 0.035, 0.01], owners: 'head', sides: 8, sub: 2, uscale: 2, vscale: 1 });
  B.tube({ pts: [V(0, 0.3, 0.95), V(0, 0.28, 1.25), V(0, 0.27, 1.5)], rx: [0.04, 0.025, 0.006], ry: [0.02, 0.015, 0.006], owners: 'jaw', sides: 6, sub: 2, uscale: 2, vscale: 1 });
  B.tube({ pts: [V(0, 0.38, 0.75), V(0, 0.52, 0.5), V(0, 0.66, 0.2)], rx: [0.01, 0.014, 0.004], ry: [0.07, 0.1, 0.02], owners: 'head', sides: 6, sub: 2, uscale: 1, vscale: 1 }); // cresta
  for (const sx of [1, -1]) B.blob(V(0.055 * sx, 0.38, 1.0), 0.02, 0.025, 0.025, 'head', PART.ojo, 8);
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    // membrana del ala (plana, más ancha cerca del cuerpo)
    B.tube({ pts: [V(0.12 * sx, 0.1, -0.1), V(1.0 * sx, 0.14, -0.14), V(2.0 * sx, 0.12, -0.18), V(3.2 * sx, 0.04, -0.34)], rx: [0.42, 0.34, 0.24, 0.08], ry: [0.012, 0.01, 0.008, 0.004], owners: [`sh${side}`, `el${side}`, `wr${side}`], sides: 8, sub: 4, part: PART.membrana, uscale: 1, vscale: 0.3 });
    // brazo / borde de ataque
    B.tube({ pts: [V(0.12 * sx, 0.1, 0.28), V(1.0 * sx, 0.14, 0.2), V(2.0 * sx, 0.12, 0.04), V(3.2 * sx, 0.04, -0.32)], rx: [0.05, 0.035, 0.028, 0.01], ry: [0.05, 0.035, 0.028, 0.01], owners: [`sh${side}`, `el${side}`, `wr${side}`], sides: 6, sub: 4, uscale: 1, vscale: 0.5 });
    B.tube({ pts: [V(0.1 * sx, -0.08, -0.2), V(0.12 * sx, -0.3, -0.34), V(0.12 * sx, -0.5, -0.5)], rx: [0.04, 0.025, 0.012], ry: [0.04, 0.025, 0.012], owners: `legU${side}`, sides: 5, sub: 2, uscale: 1, vscale: 1 });
  }
  const geo = B.finish(colorizer(o.pal));
  return { geo, sk, legs: [], specs };
}

// ---------------------------------------------------------------------------------------------- ESPECIES
export const SPECIES = {
  raptor: {
    id: 'raptor', nombre: 'Raptor', skin: 'raptor', uvK: 2.4, tono: 1.0, scale: 1, tipo: 'depredador', vidaMax: 90,
    pal: { dorso: [0.46, 0.2, 0.08], vientre: [0.86, 0.74, 0.52], raya: { freq: 11, warp: 5, th: 0.55, color: [0.1, 0.05, 0.03], amp: 0.8 }, aoY: 0.6, ojo: [1, 0.72, 0.05] },
    build() { return buildTheropod(1, { pal: this.pal }); },
    roughness: 0.74, hips: 1.05, hit: [[0, 1.15, 0.1, 0.55], [0, 1.2, 0.7, 0.4], [0, 1.65, 1.4, 0.3], [0, 1.0, -1.0, 0.3], [0.2, 0.55, 0.15, 0.3], [-0.2, 0.55, 0.15, 0.3]],
    vel: { walk: 1.7, run: 7.4 }, cycle: { walk: 1.7, run: 3.6 }, stance: 0.62, step: 0.16, radius: 0.55,
    ai: { vista: 42, ataque: 2.0, dano: 9, cd: 1.6, agresivo: true, manada: true, huye: 0.2 },
    drops: [['carne_cruda', 3], ['cuero', 2], ['hueso', 1]], rugido: 0.5,
  },
  compsognatus: {
    id: 'compsognatus', nombre: 'Compsognatus', skin: 'comps', uvK: 1.3, tono: 1.0, scale: 0.3, tipo: 'presa', vidaMax: 14,
    pal: { dorso: [0.28, 0.36, 0.14], vientre: [0.8, 0.78, 0.5], raya: { freq: 30, warp: 12, th: 0.6, color: [0.08, 0.12, 0.05], amp: 0.7 }, aoY: 0.25, ojo: [0.95, 0.8, 0.1] },
    build() { return buildTheropod(0.3, { pal: this.pal, tailK: 1.25, thin: 0.9, noSickle: true }); },
    roughness: 0.72, hips: 0.32, hit: [[0, 0.35, 0.05, 0.2], [0, 0.5, 0.42, 0.14], [0, 0.32, -0.4, 0.14]],
    vel: { walk: 1.2, run: 6.4 }, cycle: { walk: 0.55, run: 1.2 }, stance: 0.6, step: 0.07, radius: 0.22,
    ai: { vista: 18, huye: 1, manada: true, huyeDist: 14 },
    drops: [['carne_cruda', 1]], rugido: 0.4,
  },
  triceratops: {
    id: 'triceratops', nombre: 'Triceratops', anim: 'tricera', skin: 'tri', uvK: 3.2, tono: 0.95, scale: 1, tipo: 'herbivoro', vidaMax: 320,
    pal: { dorso: [0.4, 0.37, 0.27], vientre: [0.66, 0.6, 0.46], manchas: [0.26, 0.24, 0.17], gola0: [0.5, 0.26, 0.14], gola1: [0.32, 0.27, 0.2], golaY: 2.2, golaR: 0.86, aoY: 1.0, ojo: [0.6, 0.35, 0.08], cuerno: [0.84, 0.78, 0.62] },
    build() { return buildTricera({ pal: this.pal }); },
    roughness: 0.86, hips: 1.75, hit: [[0, 1.9, 0, 1.0], [0, 1.9, 1.2, 0.85], [0, 1.8, 2.5, 0.6], [0, 2.2, 1.95, 0.8], [0, 1.5, -2.2, 0.55]],
    vel: { walk: 1.3, run: 6.2 }, cycle: { walk: 3.0, run: 5.6 }, stance: 0.66, step: 0.28, radius: 1.3,
    ai: { vista: 24, ataque: 3.0, dano: 22, cd: 2.4, defiende: true, huye: 0 },
    drops: [['carne_cruda', 6], ['cuero', 4], ['hueso', 3]], rugido: 0.5,
  },
  braquiosaurio: {
    id: 'braquiosaurio', nombre: 'Braquiosaurio', anim: 'braquio', skin: 'brach', uvK: 5.5, tono: 1.05, scale: 1, tipo: 'herbivoro', vidaMax: 900,
    pal: { dorso: [0.46, 0.46, 0.33], vientre: [0.68, 0.64, 0.5], manchas: [0.3, 0.32, 0.22], aoY: 3.2, ojo: [0.7, 0.45, 0.08] },
    build() { return buildBrachio({ pal: this.pal }); },
    roughness: 0.9, hips: 4.6, hit: [[0, 4.9, 0, 2.0], [0, 5.0, 1.9, 1.7], [0, 6.5, 3.2, 0.9], [0, 9.5, 4.1, 0.6], [0, 12.3, 5.1, 0.5], [0, 3.8, -5.0, 0.9], [0, 3.2, -8.0, 0.5]],
    vel: { walk: 1.5, run: 3.2 }, cycle: { walk: 7.0, run: 9.0 }, stance: 0.72, step: 0.5, radius: 2.6,
    ai: { vista: 0, pasivo: true },
    drops: [['carne_cruda', 10], ['cuero', 6], ['hueso', 5]], rugido: 0.6,
  },
  pteranodon: {
    id: 'pteranodon', nombre: 'Pteranodon', anim: 'ptera', skin: 'ptera', uvK: 1.5, tono: 1.0, scale: 1, tipo: 'volador', vidaMax: 30,
    pal: { dorso: [0.42, 0.32, 0.22], vientre: [0.78, 0.7, 0.55], aoY: 0.1, ojo: [0.9, 0.6, 0.1] },
    build() { return buildPtera({ pal: this.pal }); },
    roughness: 0.8, hips: 0, hit: [[0, 0.1, 0.1, 0.4], [0, 0.3, 1.0, 0.25], [1.5, 0.12, 0, 0.6], [-1.5, 0.12, 0, 0.6]],
    vel: { walk: 10, run: 14 }, cycle: { walk: 1, run: 1 }, stance: 0.5, step: 0, radius: 0.6,
    ai: { vuelo: true },
    drops: [['carne_cruda', 2], ['cuero', 2], ['hueso', 1]], rugido: 0.3,
  },
  tyrannosaurus: {
    id: 'tyrannosaurus', nombre: 'Tyrannosaurus', skin: 'rex', uvK: 3.4, tono: 0.95, scale: 1, tipo: 'depredador', vidaMax: 600,
    pal: { dorso: [0.33, 0.27, 0.18], vientre: [0.62, 0.55, 0.4], raya: { freq: 6, warp: 4, th: 0.6, color: [0.14, 0.1, 0.07], amp: 0.55 }, aoY: 1.6, ojo: [0.95, 0.7, 0.1] },
    build() { return buildRex({ pal: this.pal }); },
    roughness: 0.82, hips: 3.15, hit: [[0, 3.3, 0.2, 1.25], [0, 3.5, 1.7, 1.0], [0, 3.9, 2.6, 0.75], [0, 4.1, 4.2, 0.6], [0, 3.1, -1.9, 0.85], [0.58, 1.6, 0.6, 0.55], [-0.58, 1.6, 0.6, 0.55], [0, 2.8, -3.6, 0.55]],
    vel: { walk: 2.0, run: 7.0 }, cycle: { walk: 4.2, run: 7.0 }, stance: 0.6, step: 0.35, radius: 1.7,
    ai: { ataque: 3.8, dano: 38, cd: 2.8, huye: 0.15 }, rugido: 0.5,
  },
  parasaurolophus: {
    id: 'parasaurolophus', nombre: 'Parasaurolophus', skin: 'parasaur', uvK: 4, tono: 1.0, scale: 1, tipo: 'herbivoro', vidaMax: 260, anim: 'hadrosaurio',
    pal: { dorso: [0.4, 0.38, 0.22], vientre: [0.7, 0.64, 0.45], raya: { freq: 5, warp: 3, th: 0.55, color: [0.2, 0.16, 0.1], amp: 0.6 }, cresta: [0.6, 0.3, 0.16], cresta1: [0.38, 0.2, 0.12], aoY: 1.4, ojo: [0.8, 0.55, 0.1] },
    build() { return buildParasaur({ pal: this.pal }); },
    roughness: 0.8, hips: 2.15, hit: [[0, 2.2, -0.4, 1.1], [0, 2.2, 0.9, 1.05], [0, 2.5, 2.0, 0.7], [0, 3.0, 3.2, 0.5], [0, 3.4, 3.1, 0.4], [0, 1.9, -2.5, 0.65], [0, 1.7, -4.5, 0.4]],
    vel: { walk: 1.6, run: 6.6 }, cycle: { walk: 3.0, run: 5.8 }, stance: 0.62, step: 0.24, radius: 1.6,
    ai: { huye: 1, huyeDist: 38, manada: true }, rugido: 0.5,
  },
  stegosaurus: {
    id: 'stegosaurus', nombre: 'Stegosaurus', skin: 'stego', uvK: 4.5, tono: 0.95, scale: 1, tipo: 'herbivoro', vidaMax: 380, anim: 'estegosaurio',
    pal: { dorso: [0.34, 0.36, 0.2], vientre: [0.58, 0.55, 0.4], manchas: [0.2, 0.24, 0.12], placa0: [0.34, 0.24, 0.16], placa1: [0.64, 0.36, 0.16], placaY0: 2.2, placaH: 1.3, cuerno: [0.75, 0.68, 0.5], aoY: 1.2, ojo: [0.7, 0.45, 0.08] },
    build() { return buildStego({ pal: this.pal }); },
    roughness: 0.86, hips: 2.1, hit: [[0, 2.1, -0.3, 1.0], [0, 2.0, 0.9, 0.95], [0, 1.4, 2.4, 0.55], [0, 1.0, 3.5, 0.35], [0, 1.9, -1.9, 0.7], [0, 1.4, -3.8, 0.5], [0, 1.4, -4.8, 0.4]],
    vel: { walk: 1.2, run: 3.8 }, cycle: { walk: 2.6, run: 4.2 }, stance: 0.66, step: 0.2, radius: 1.6,
    ai: { defiende: true, ataque: 4, dano: 0, cd: 3, huye: 0 }, rugido: 0.5,
  },
  ankylosaurus: {
    id: 'ankylosaurus', nombre: 'Ankylosaurus', skin: 'ankylo', uvK: 3.4, tono: 0.92, scale: 1, tipo: 'herbivoro', vidaMax: 420, anim: 'anquilosaurio',
    pal: { dorso: [0.34, 0.28, 0.2], vientre: [0.52, 0.45, 0.34], manchas: [0.22, 0.18, 0.12], cuerno: [0.62, 0.52, 0.36], aoY: 0.9, ojo: [0.7, 0.45, 0.08] },
    build() { return buildAnkylo({ pal: this.pal }); },
    roughness: 0.88, hips: 1.2, hit: [[0, 1.2, -0.3, 1.1], [0, 1.2, 0.9, 1.05], [0, 1.0, 2.2, 0.55], [0, 0.9, 2.9, 0.35], [0, 1.1, -2.0, 0.6], [0, 0.85, -4.9, 0.5]],
    vel: { walk: 1.0, run: 3.4 }, cycle: { walk: 1.6, run: 3.0 }, stance: 0.68, step: 0.12, radius: 1.5,
    ai: { defiende: true, ataque: 4, dano: 0, cd: 4, huye: 0 }, rugido: 0.5,
  },
  gallimimus: {
    id: 'gallimimus', nombre: 'Gallimimus', skin: 'gall', uvK: 1.5, tono: 1.0, scale: 0.85, tipo: 'presa', vidaMax: 70,
    pal: { dorso: [0.5, 0.38, 0.22], vientre: [0.82, 0.74, 0.55], raya: { freq: 9, warp: 3, th: 0.62, color: [0.2, 0.14, 0.08], amp: 0.5 }, aoY: 0.8, ojo: [0.9, 0.65, 0.1] },
    build() { return buildGallimimus({ pal: this.pal }); },
    roughness: 0.75, hips: 1.75, hit: [[0, 1.8, 0.2, 0.5], [0, 1.9, 0.95, 0.38], [0, 2.5, 1.6, 0.22], [0, 3.1, 2.1, 0.2], [0, 1.7, -1.0, 0.28], [0.2, 0.9, 0.3, 0.3], [-0.2, 0.9, 0.3, 0.3]],
    vel: { walk: 2.2, run: 12 }, cycle: { walk: 2.4, run: 4.7 }, stance: 0.55, step: 0.2, radius: 0.6,
    ai: { huye: 1, huyeDist: 34, manada: true }, rugido: 0.4,
  },
};

// Los datos biológicos y de comportamiento salen del catálogo (única fuente de verdad); aquí se convierten en parámetros de IA.
for (const sp of Object.values(SPECIES)) {
  const det = DETALLE[sp.id];
  if (!det) throw new Error(`Falta DETALLE en catalogo.js para ${sp.id}`);
  sp.cat = POR_ID[sp.id] ?? null; sp.detalle = det;
  sp.sentidos = det.sentidos; sp.energia = det.energia; sp.hambre = det.hambre; sp.peligro = det.peligro; sp.masa = sp.cat?.masa ?? 100;
  sp.vigia = !!det.vigia; sp.habilidades = det.habilidades; sp.habParams = det.habParams ?? {};
  sp.ai = { ...sp.ai, caza: det.caza, teme: det.teme, coordinada: !!det.coordinada, vista: det.sentidos.vista };
  sp.drops = det.cosecha;
  sp.doma = det.doma ?? null; sp.montura = det.montura || null;
}
export const SPECIES_IDS = Object.keys(SPECIES);
marcarImplementadas(SPECIES_IDS);
export { THREE };
