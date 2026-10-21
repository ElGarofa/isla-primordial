// Texturas procedurales de la flora, dibujadas con canvas 2D al cargar: corteza, hojas, frondas, hierba, agujas.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { tileableHeight } from '../world/textures.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;

/** Hoja suelta: elipse apuntada con nervadura, degradado y borde ligeramente más oscuro. */
function leaf(ctx, x, y, len, wid, ang, rnd, hue = 100) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  const l0 = 18 + rnd() * 8, l1 = 30 + rnd() * 14;
  g.addColorStop(0, hsl(hue + rnd() * 14, 55, l0)); g.addColorStop(1, hsl(hue + 8 + rnd() * 14, 58, l1));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.8, len, 0);
  ctx.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.25, wid, 0, 0);
  ctx.fill();
  ctx.strokeStyle = hsl(hue + 18, 50, l0 + 18); ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, wid * 0.07);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.96, 0); ctx.stroke();
  ctx.lineWidth = 0.8; ctx.globalAlpha = 0.28;
  for (let i = 1; i < 6; i++) { const px = (len * i) / 6.5; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px + wid * 0.5, -wid * 0.55); ctx.moveTo(px, 0); ctx.lineTo(px + wid * 0.5, wid * 0.55); ctx.stroke(); }
  ctx.restore(); ctx.globalAlpha = 1;
}

/** Racimo de hojas (follaje de selva / arbustos), con alfa. */
export function makeFoliage(seed = 3, hue = 98) {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, S, S);
  // capa trasera más oscura, luego capas más claras por delante
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = (0.05 + rnd() * 0.3) * S;
      const x = S / 2 + Math.cos(a) * r * 0.9, y = S / 2 + Math.sin(a) * r * 0.9;
      ctx.globalAlpha = 1;
      leaf(ctx, x, y, S * (0.16 + rnd() * 0.12), S * (0.05 + rnd() * 0.03), a + (rnd() - 0.5) * 0.7, rnd, hue + layer * 4);
    }
    // oscurece la capa inferior
    if (layer === 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(0,12,0,0.38)'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over'; }
  }
  return toTexture(c);
}

/** Fronda de palmera: raquis central con folíolos pinnados que caen hacia abajo. */
export function makeFrond(seed = 5) {
  const W = 256, H = 512, c = canvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const N = 34;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = H * (0.97 - t * 0.93);
    const len = W * 0.5 * Math.sin(Math.PI * (0.12 + t * 0.88)) * (0.85 + rnd() * 0.15) * (1 - t * 0.35);
    for (const side of [-1, 1]) {
      const droop = 0.55 + t * 0.35;
      const g = ctx.createLinearGradient(cx, y, cx + side * len, y + len * droop * 0.45);
      g.addColorStop(0, hsl(105, 50, 22 + rnd() * 6)); g.addColorStop(1, hsl(88 + rnd() * 10, 55, 33 + rnd() * 10));
      ctx.strokeStyle = g; ctx.lineCap = 'round';
      ctx.lineWidth = 5.2 - t * 2.4;
      ctx.beginPath(); ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + side * len * 0.55, y - len * 0.12, cx + side * len, y + len * droop * 0.5);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = hsl(70, 40, 38); ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, H * 0.99); ctx.lineTo(cx, H * 0.02); ctx.stroke();
  return toTexture(c);
}

/** Mechón de hierba: varias hojas largas curvadas con degradado base→punta. */
export function makeGrass(seed = 9) {
  const W = 256, H = 256, c = canvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 20; i++) {
    const bx = W * (0.12 + rnd() * 0.76), h = H * (0.5 + rnd() * 0.48), lean = (rnd() - 0.5) * W * 0.45, w = 5 + rnd() * 6;
    const g = ctx.createLinearGradient(0, H, 0, H - h);
    g.addColorStop(0, hsl(95, 50, 15 + rnd() * 5)); g.addColorStop(0.5, hsl(92 + rnd() * 8, 56, 28 + rnd() * 8)); g.addColorStop(1, hsl(70 + rnd() * 15, 58, 44 + rnd() * 10));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(bx - w, H);
    ctx.quadraticCurveTo(bx - w * 0.4 + lean * 0.4, H - h * 0.55, bx + lean, H - h);
    ctx.quadraticCurveTo(bx + w * 0.4 + lean * 0.4, H - h * 0.55, bx + w, H);
    ctx.closePath(); ctx.fill();
  }
  return toTexture(c);
}

/** Racimo de agujas de conífera. */
export function makeNeedles(seed = 11) {
  const S = 256, c = canvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2, r0 = rnd() * S * 0.1, len = S * (0.12 + rnd() * 0.22);
    const x = S / 2 + Math.cos(a) * r0, y = S / 2 + Math.sin(a) * r0;
    ctx.strokeStyle = hsl(140 + rnd() * 20, 40 + rnd() * 15, 14 + rnd() * 16); ctx.lineWidth = 1.4 + rnd();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  return toTexture(c);
}

/** Corteza: fisuras verticales, tileable. Devuelve { albedo, normal } (texturas de datos). */
export function makeBark(kind = 'selva', size = 256) {
  const base = tileableHeight(size, 5, kind === 'palma' ? 61 : 43, 4, 0.6);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stretchY = kind === 'palma' ? 1 : 6; // palmera: anillos horizontales (se estira en x en su lugar)
      const u = kind === 'palma' ? (x >> 3) : x, v = kind === 'palma' ? y : (y >> 2) % size;
      const a = base[((v * 1) % size) * size + (u % size)];
      const ridge = 1 - Math.abs(a * 2 - 1);
      h[y * size + x] = kind === 'palma' ? (0.5 + 0.5 * Math.sin(y * (Math.PI * 2 / 22) + a * 3)) * 0.7 + a * 0.3 : ridge * 0.75 + base[y * size + x] * 0.25;
      void stretchY;
    }
  }
  const alb = new Uint8Array(size * size * 4), nor = new Uint8Array(size * size * 4);
  const dark = kind === 'palma' ? [118, 96, 70] : kind === 'conifera' ? [84, 60, 44] : [88, 74, 62];
  const light = kind === 'palma' ? [170, 150, 118] : kind === 'conifera' ? [128, 94, 66] : [136, 118, 98];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, v = h[i];
      const k = Math.pow(v, 1.3);
      const moss = kind === 'selva' ? Math.max(0, base[(i + 77) % base.length] - 0.62) * 1.4 : 0;
      alb[i * 4] = dark[0] + (light[0] - dark[0]) * k - moss * 50;
      alb[i * 4 + 1] = dark[1] + (light[1] - dark[1]) * k + moss * 25;
      alb[i * 4 + 2] = dark[2] + (light[2] - dark[2]) * k - moss * 45;
      alb[i * 4 + 3] = 255;
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], d = h[((y - 1 + size) % size) * size + x], u2 = h[((y + 1) % size) * size + x];
      let nx = (l - r) * 4.5, ny = (d - u2) * 4.5, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      nor[i * 4] = (nx * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nor[i * 4 + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  return { albedo: mk(alb, true), normal: mk(nor, false) };
}
