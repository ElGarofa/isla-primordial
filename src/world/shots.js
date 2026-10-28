// Presets del módulo world (prefijo mundo_): vistas del continente desde el aire y de cada bioma a pie de suelo.
import { BIOMAS, BIOMA_NOMBRE, PROVINCIAS, RASGOS } from './provincias.js';

/** Punto más «interior» de un bioma (el que tiene el mayor cuadrado de celdas del mismo bioma a su alrededor), en suelo llano, y dirección hacia el resto del bioma. */
function puntoDeBioma(ctx, bioma, cx = 0, cz = 0) {
  const M = ctx.world.macro, n = M.n;
  const mismo = (i, j, r) => { // ¿todo el cuadrado de radio r es del bioma?
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n || M.B[b * n + a] !== bioma) return false; }
    return true;
  };
  let best = null, br = -1, bd = 1e18;
  for (let j = 3; j < n - 3; j += 2) for (let i = 3; i < n - 3; i += 2) {
    if (M.B[j * n + i] !== bioma) continue;
    let r = 1; while (r < 14 && mismo(i, j, r + 1)) r++;
    const x = -M.half + (i + 0.5) * M.cell, z = -M.half + (j + 0.5) * M.cell, d = (x - cx) ** 2 + (z - cz) ** 2;
    if (ctx.world.getSlope(x, z) > 0.18) continue;
    if (r > br || (r === br && d < bd)) { br = r; bd = d; best = [i, j]; }
  }
  if (!best) return null;
  const [i, j] = best;
  // dirección: hacia el centroide de las celdas del bioma en 20 celdas a la redonda
  let sx = 0, sz = 0, c = 0;
  for (let dj = -20; dj <= 20; dj++) for (let di = -20; di <= 20; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < n && b < n && M.B[b * n + a] === bioma) { sx += di; sz += dj; c++; } }
  let dx = c ? sx / c : 1, dz = c ? sz / c : 0; const l = Math.hypot(dx, dz); if (l < 0.5) { dx = 1; dz = 0.3; } else { dx /= l; dz /= l; }
  return { x: -M.half + (i + 0.5) * M.cell, z: -M.half + (j + 0.5) * M.cell, dx, dz, r: br };
}

const lejos = (ctx, far = 26000) => { ctx.debug.hideViewmodel = true; ctx.camera.far = far; ctx.camera.updateProjectionMatrix(); };

/** Dirección de mirada libre de acantilados: si la preferida choca con terreno más alto que la cámara en < 60 m, prueba 8 rumbos y elige el más despejado. */
function despejada(ctx, x, z, dx, dz, alto = 6, minLibre = 60) {
  const y0 = ctx.world.getHeight(x, z) + alto;
  const libre = (ax, az) => { for (let d = 8; d <= 400; d += 8) if (ctx.world.getHeight(x + ax * d, z + az * d) > y0 + d * 0.12) return d; return 400; };
  if (libre(dx, dz) >= minLibre) return [dx, dz];
  let best = [dx, dz], bd = libre(dx, dz);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, ax = Math.cos(a), az = Math.sin(a), d = libre(ax, az); if (d > bd) { bd = d; best = [ax, az]; } }
  return best;
}

/** Laguna más cercana (celda macro por debajo del nivel del mar y dentro del pantano) alrededor de un punto; null si no hay. */
function lagunaCerca(ctx, x, z, radio = 14) {
  const M = ctx.world.macro, n = M.n, i0 = Math.round((x + M.half) / M.cell - 0.5), j0 = Math.round((z + M.half) / M.cell - 0.5);
  let best = null, bd = 1e18;
  for (let dj = -radio; dj <= radio; dj++) for (let di = -radio; di <= radio; di++) {
    const i = i0 + di, j = j0 + dj; if (i < 1 || j < 1 || i >= n - 1 || j >= n - 1) continue;
    const k = j * n + i; if (M.B[k] !== BIOMAS.pantano || M.H[k] > -1.2) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = [-M.half + (i + 0.5) * M.cell, -M.half + (j + 0.5) * M.cell]; }
  }
  return best;
}

export const shots = {
  mundo_playa_spawn: (ctx) => {
    const p = ctx.world.spawn;
    return { hour: 10, setup: () => lejos(ctx, 9000), camera: { agl: true, pos: [p.x, 2, p.z + 6], look: [p.x, 8, p.z - 400] } };
  },
  mundo_costa_aerea: (ctx) => {
    const p = ctx.world.spawn;
    return { hour: 10, setup: () => lejos(ctx, 14000), camera: { pos: [p.x, 320, p.z + 900], look: [p.x, 0, p.z - 1400] } };
  },
  // el continente entero desde arriba (norte arriba): comprueba forma, biomas y LOD a gran distancia
  mundo_satelite: (ctx) => ({ hour: 12, weather: { rain: 0, storm: 0 }, setup: () => lejos(ctx, 40000), camera: { pos: [0, 15500, 2200], look: [0, 0, 0], fov: 55 } }),
  mundo_satelite_sur: (ctx) => ({ hour: 12, weather: { rain: 0, storm: 0 }, setup: () => lejos(ctx, 40000), camera: { pos: [0, 5200, 7600], look: [0, 0, 2200], fov: 60 } }),
  mundo_satelite_norte: (ctx) => ({ hour: 12, weather: { rain: 0, storm: 0 }, setup: () => lejos(ctx, 40000), camera: { pos: [0, 5200, -1200], look: [0, 0, -3600], fov: 60 } }),
  ...Object.fromEntries(Object.entries(BIOMAS).filter(([nombre]) => nombre !== 'mar').map(([nombre, id]) => [`mundo_bioma_${nombre}`, (ctx) => {
    const pt = puntoDeBioma(ctx, id, 0, 0) ?? { x: 0, z: 0, dx: 1, dz: 0 };
    let { x, z, dx, dz } = pt, alto = 2.2, mira = 14;
    if (nombre === 'pantano') { // hacia la laguna más cercana, desde unos 70 m antes de ella
      const lg = lagunaCerca(ctx, x, z);
      if (lg) { const l = Math.hypot(lg[0] - x, lg[1] - z) || 1; dx = (lg[0] - x) / l; dz = (lg[1] - z) / l; x = lg[0] - dx * 70; z = lg[1] - dz * 70; mira = 0; alto = 9; }
    }
    if (nombre === 'selva') alto = 4.5; // el sotobosque de la selva es alto: así la cámara no queda dentro de una hoja
    if (nombre !== 'pantano') [dx, dz] = despejada(ctx, x, z, dx, dz);
    return { hour: 11, weather: { rain: 0, storm: 0 }, setup: () => lejos(ctx, 9000), camera: { agl: true, pos: [x, alto, z], look: [x + dx * 300, mira, z + dz * 300] } };
  }])),
  mundo_volcan: (ctx) => {
    const v = RASGOS[0];
    return { hour: 15, weather: { rain: 0, storm: 0 }, setup: () => lejos(ctx, 12000), camera: { pos: [v.centro[0] - 1500, 260, v.centro[1] + 1900], look: [v.centro[0], v.altura * 0.7, v.centro[1]] } };
  },
  ...Object.fromEntries(PROVINCIAS.map((pv) => [`mundo_prov_${pv.id}`, (ctx) => {
    const [dx, dz] = despejada(ctx, pv.centro[0], pv.centro[1], 0.707, 0.707, 90, 380); // mira hacia donde no haya una ladera pegada a la cámara
    return {
      hour: 11, weather: { rain: 0, storm: 0 }, setup: () => lejos(ctx, 12000),
      camera: { agl: true, pos: [pv.centro[0], 90, pv.centro[1]], look: [pv.centro[0] + dx * 1200, 40, pv.centro[1] + dz * 1200] },
    };
  }])),
};

export { BIOMA_NOMBRE };
