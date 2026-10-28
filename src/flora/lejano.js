// BOSQUE LEJANO: árboles en tarjetas que miran a la cámara (impostores) desde donde termina la flora real (~560 m) hasta ~2,6 km.
// Sin esto, más allá de la flora cargada el paisaje se ve pelado (vistas desde los montes, el menú, el mapa en vuelo).
//   · Colocación por losetas de 256 m: bioma de la rejilla macro + el mismo ruido de claros que la flora cercana; determinista.
//   · Cuatro siluetas pintadas por código (frondoso, conífera, palmera, araucaria), una InstancedMesh por silueta: 4 draw calls en total.
//   · Cada tarjeta gira solo alrededor de su eje vertical, se ilumina con una normal «de esfera» (copas redondeadas) y nace creciendo en la
//     franja donde la flora real desaparece (no hay saltos al acercarse ni al alejarse).
import * as THREE from 'three';
import { mulberry32, hash2 } from '../core/rng.js';
import { fbm } from '../core/noise.js';

const TILE = 256, PASO = 15;
const R_CERCA = [520, 620], R_LEJOS = [2300, 2650]; // franjas de aparición (m): crece entre 520–620, se desvanece entre 2300–2650
const R_CARGA = R_LEJOS[1] + TILE;

// probabilidad de árbol por muestra (cada 15 m) y mezcla de siluetas por bioma
const COB = { selva: 0.62, bosque: 0.5, taiga: 0.5, pantano: 0.24, pradera: 0.07, montana: 0.32, playa: 0.06, volcan: 0.01 };
const SIL = {
  selva: [[0, 0.9], [2, 1]], bosque: [[1, 0.5], [0, 0.82], [3, 1]], taiga: [[1, 1]], pantano: [[0, 1]], pradera: [[0, 0.8], [3, 1]],
  montana: [[1, 1]], playa: [[2, 1]], volcan: [[0, 1]],
};
// [ancho, alto] base (m) de cada silueta; tinte por bioma
const TAM = [[15, 26], [7.5, 19], [7, 12.5], [13, 27]];
const TINTE = { selva: [0.82, 0.95, 0.78], bosque: [0.95, 0.98, 0.85], taiga: [0.72, 0.86, 0.9], pantano: [0.66, 0.74, 0.58], pradera: [1, 1, 0.82], montana: [0.82, 0.92, 0.92], playa: [1, 1, 1], volcan: [0.45, 0.42, 0.4] };

// ---------------------------------------------------------------------------------------------- siluetas (canvas 256×512)
function pintar(kind) {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = mulberry32(700 + kind * 31);
  const verde = (luz) => { const l = Math.max(0, Math.min(1, luz)); return `rgb(${Math.round(30 + 60 * l)},${Math.round(62 + 92 * l)},${Math.round(26 + 44 * l)})`; };
  const tronco = (x0, y0, x1, y1, w0, w1, col = '#4a3826') => { g.fillStyle = col; g.beginPath(); g.moveTo(x0 - w0, y0); g.lineTo(x1 - w1, y1); g.lineTo(x1 + w1, y1); g.lineTo(x0 + w0, y0); g.closePath(); g.fill(); };
  const mata = (cx, cy, rx, ry, n, rmin, rmax) => { // racimos de hojas: claros arriba-izquierda, oscuros abajo
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()), x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, r = rmin + rnd() * (rmax - rmin);
      const luz = 0.55 - ((y - cy) / ry) * 0.35 - ((x - cx) / rx) * 0.12 + (rnd() - 0.5) * 0.35;
      g.fillStyle = verde(luz); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  };
  if (kind === 0) { // frondoso (selva, pantano, pradera)
    tronco(W / 2, H, W / 2 + 6, H * 0.42, 9, 5);
    for (let k = 0; k < 4; k++) tronco(W / 2 + 4, H * 0.5, W / 2 + (rnd() - 0.5) * 140, H * 0.3, 3, 1.5, '#3d2f20');
    mata(W / 2, H * 0.3, W * 0.46, H * 0.25, 520, 7, 19);
  } else if (kind === 1) { // conífera
    tronco(W / 2, H, W / 2, H * 0.08, 7, 2);
    for (let k = 0; k < 9; k++) {
      const y = H * (0.06 + k * 0.095), w = W * (0.1 + k * 0.046), h = H * 0.15;
      for (let i = 0; i < 70; i++) { const t = rnd(), x = W / 2 + (rnd() - 0.5) * w * 2 * t, yy = y + h * t + (rnd() - 0.5) * 8; g.fillStyle = verde(0.32 + (0.5 - t) * 0.3 - (x > W / 2 ? 0.1 : 0) + (rnd() - 0.5) * 0.2); g.beginPath(); g.arc(x, yy, 4 + rnd() * 6, 0, Math.PI * 2); g.fill(); }
    }
  } else if (kind === 2) { // palmera
    const tx = W / 2 + 22;
    g.strokeStyle = '#6b5a44'; g.lineWidth = 9; g.beginPath(); g.moveTo(W / 2 - 6, H); g.quadraticCurveTo(W / 2 - 14, H * 0.55, tx, H * 0.24); g.stroke();
    for (let i = 0; i < 13; i++) {
      const a = -Math.PI / 2 + (i / 12 - 0.5) * Math.PI * 1.9, L = 95 + rnd() * 25;
      let x = tx, y = H * 0.24; g.strokeStyle = verde(0.45 + (rnd() - 0.5) * 0.25); g.lineWidth = 3;
      for (let s = 0; s < 10; s++) {
        const t = s / 10, ang = a + t * t * 1.2 * Math.sign(Math.cos(a) || 1), nx = x + Math.cos(ang) * L / 10, ny = y + Math.sin(ang) * L / 10 + t * 6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + Math.cos(ang + sd * 1.2) * 13 * (1 - t * 0.6), ny + Math.sin(ang + sd * 1.2) * 13 * (1 - t * 0.6) + 5); g.stroke(); }
        x = nx; y = ny;
      }
    }
  } else { // araucaria: fuste desnudo y copa en paraguas
    tronco(W / 2, H, W / 2, H * 0.14, 8, 3);
    mata(W / 2, H * 0.14, W * 0.47, H * 0.07, 260, 6, 14);
    for (let k = 0; k < 3; k++) mata(W / 2 + (rnd() - 0.5) * 60, H * (0.22 + k * 0.06), W * (0.22 - k * 0.04), H * 0.03, 60, 5, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function materialSilueta(ctx, map, kind) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, emissive: 0x0d1a08, emissiveMap: map, emissiveIntensity: 0.35, vertexColors: false });
  const uLej = { value: new THREE.Vector4(R_CERCA[0], R_CERCA[1], R_LEJOS[0], R_LEJOS[1]) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLej = uLej;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uLej;')
      .replace('#include <normal_vertex>', `
        vec3 bbPos = instanceMatrix[3].xyz;
        float bbW = length(instanceMatrix[0].xyz), bbH = length(instanceMatrix[1].xyz);
        vec3 bbTo = cameraPosition - bbPos; float bbD = length(bbTo.xz);
        vec3 bbF = normalize(vec3(bbTo.x, 0.0, bbTo.z) + vec3(1e-4, 0.0, 0.0)), bbR = vec3(bbF.z, 0.0, -bbF.x);
        float bbK = smoothstep(uLej.x, uLej.y, bbD) * (1.0 - smoothstep(uLej.z, uLej.w, bbD));
        vec3 nBB = normalize(bbR * (uv.x * 2.0 - 1.0) * 0.8 + vec3(0.0, 1.0, 0.0) * (uv.y * 1.6 - 0.5) + bbF * 0.7);
        vNormal = normalize((viewMatrix * vec4(nBB, 0.0)).xyz);`)
      .replace('#include <project_vertex>', `
        vec3 bbWP = bbPos + bbR * position.x * bbW * bbK + vec3(0.0, position.y * bbH * bbK - 2.5, 0.0);
        vec4 mvPosition = viewMatrix * vec4(bbWP, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    // cobertura del recorte alfa con la distancia (igual que el follaje cercano)
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 tszB = vec2(textureSize(map, 0)), dxB = dFdx(vMapUv * tszB), dyB = dFdy(vMapUv * tszB);
      diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(dxB, dxB), dot(dyB, dyB)))) * 0.3;`);
  };
  m.customProgramCacheKey = () => `bosque-lejano-v1-${kind}`;
  return m;
}

/** Crea la capa de bosque lejano. `noiseF` = ruido de claros de la flora cercana (mismas arboledas). */
export function crearBosqueLejano(ctx, root, noiseF) {
  const world = ctx.world;
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  const mallas = [0, 1, 2, 3].map((k) => {
    const mat = materialSilueta(ctx, pintar(k), k);
    ctx.lighting?.setupMaterial?.(mat);
    const m = new THREE.InstancedMesh(geo, mat, 1024);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1024 * 3), 3);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.count = 0; m.name = `flora:lejano:${k}`;
    root.add(m);
    return m;
  });
  const losetas = new Map(); // "i,j" -> [{k, x, y, z, w, h, c}]
  let pendientes = [], ultI = 1e9, ultJ = 1e9, sucio = false;

  function generar(ti, tj) {
    const rnd = mulberry32((hash2(ti, tj, 501) * 4294967296) >>> 0), out = [];
    const n = TILE / PASO;
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const x = ti * TILE + (a + rnd()) * PASO, z = tj * TILE + (b + rnd()) * PASO, r = rnd(), r2 = rnd(), r3 = rnd();
      const bio = world.getBiome(x, z), cob = COB[bio];
      if (!cob) continue;
      const dens = fbm(noiseF, x * 0.012, z * 0.012, 3);
      let p = cob * (bio === 'pradera' || bio === 'playa' ? Math.max(0, dens) * 2.2 + 0.25 : 0.35 + 0.9 * Math.max(0, dens + 0.45));
      const h = world.getHeight(x, z);
      if (h < (bio === 'playa' ? 1.2 : 0.4)) continue;
      if (bio === 'montana') p *= 1 - Math.min(1, Math.max(0, (h - 110) / 140)); // límite del bosque
      if (r > p || world.getSlope(x, z) > 0.5) continue;
      let k = 0; for (const [kk, acc] of SIL[bio]) if (r2 <= acc) { k = kk; break; }
      const s = 0.8 + r3 * 0.45, t = TINTE[bio];
      out.push({ k, x, y: h, z, w: TAM[k][0] * s, h: TAM[k][1] * s, c: [t[0] * (0.92 + r3 * 0.16), t[1] * (0.92 + r2 * 0.12), t[2]] });
    }
    return out;
  }

  function planificar() {
    const cam = ctx.camera.position, ci = Math.floor(cam.x / TILE), cj = Math.floor(cam.z / TILE);
    if (ci === ultI && cj === ultJ) return;
    ultI = ci; ultJ = cj;
    const rad = Math.ceil(R_CARGA / TILE), quiero = new Set();
    pendientes = [];
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const ti = ci + di, tj = cj + dj, cx = (ti + 0.5) * TILE, cz = (tj + 0.5) * TILE, d = Math.hypot(cx - cam.x, cz - cam.z);
      if (d > R_CARGA || d < R_CERCA[0] - TILE * 0.75) continue; // dentro del radio de la flora real no hace falta
      if (Math.abs(cx) > world.half + TILE || Math.abs(cz) > world.half + TILE) continue;
      const key = `${ti},${tj}`; quiero.add(key);
      if (!losetas.has(key)) pendientes.push({ ti, tj, key, d });
    }
    for (const key of [...losetas.keys()]) if (!quiero.has(key)) { losetas.delete(key); sucio = true; }
    pendientes.sort((a, b) => a.d - b.d);
  }

  function reconstruir() {
    sucio = false;
    const cuenta = [0, 0, 0, 0];
    for (const l of losetas.values()) for (const t of l) cuenta[t.k]++;
    const _m = new THREE.Matrix4();
    mallas.forEach((m, k) => {
      if (m.instanceMatrix.count < cuenta[k]) { // crecer el búfer
        const cap = Math.ceil((cuenta[k] * 1.3) / 1024) * 1024;
        m.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      }
      m.count = 0;
    });
    for (const l of losetas.values()) for (const t of l) {
      const m = mallas[t.k], i = m.count++;
      _m.makeScale(t.w, t.h, 1); _m.setPosition(t.x, t.y, t.z);
      _m.toArray(m.instanceMatrix.array, i * 16);
      m.instanceColor.array.set(t.c, i * 3);
    }
    for (const m of mallas) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }

  function bombear(presupuestoMs) {
    const t0 = performance.now();
    while (pendientes.length) {
      const q = pendientes.shift();
      losetas.set(q.key, generar(q.ti, q.tj)); sucio = true;
      if (performance.now() - t0 > presupuestoMs) break;
    }
    if (sucio && (!pendientes.length || performance.now() - t0 > presupuestoMs)) reconstruir();
  }

  return {
    mallas,
    update(presupuestoMs = 2) { planificar(); bombear(presupuestoMs); },
    /** Carga todo lo pendiente de golpe (arranque, teletransporte). */
    llenar() { ultI = ultJ = 1e9; planificar(); bombear(1e9); },
    stats() { let n = 0; for (const m of mallas) n += m.count; return { losetas: losetas.size, arboles: n, pendientes: pendientes.length }; },
  };
}
