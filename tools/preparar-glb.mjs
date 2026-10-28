// Reduce un GLB estático de alta resolución (Tripo/Meshy…) a una malla ligera con COLOR_0 por vértice (sin textura), orientada con la cabeza hacia +Z y los pies en y=0.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
const [,, inp, outp, triT = '14000', flipArg = 'auto'] = process.argv;
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = new Float32Array(prim.getAttribute('POSITION').getArray()), uv = prim.getAttribute('TEXCOORD_0').getArray();
const idx = Uint32Array.from(prim.getIndices().getArray()), N = pos.length / 3;
const tex = prim.getMaterial().getBaseColorTexture();
const img = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: tw, height: th } = img.info, td = img.data;
console.log('texture', tw, th, 'verts', N, 'tris', idx.length / 3);
// color sRGB 0..1 por vértice (bilinear)
const col = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const u = ((uv[2 * i] % 1) + 1) % 1 * (tw - 1), v = ((uv[2 * i + 1] % 1) + 1) % 1 * (th - 1);
  const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(tw - 1, x0 + 1), y1 = Math.min(th - 1, y0 + 1), fx = u - x0, fy = v - y0;
  for (let c = 0; c < 3; c++) {
    const a = td[(y0 * tw + x0) * 3 + c], b = td[(y0 * tw + x1) * 3 + c], d = td[(y1 * tw + x0) * 3 + c], e = td[(y1 * tw + x1) * 3 + c];
    col[3 * i + c] = ((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy) / 255;
  }
}
// orientación: largo horizontal → +Z, cabeza hacia +Z, pies en y=0, centrado en x,z
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[3 * i + k]); mx[k] = Math.max(mx[k], pos[3 * i + k]); }
const swap = (mx[0] - mn[0]) > (mx[2] - mn[2]);
if (swap) for (let i = 0; i < N; i++) { const x = pos[3 * i]; pos[3 * i] = pos[3 * i + 2]; pos[3 * i + 2] = -x; } // gira 90° sobre Y
function bbox() { const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], pos[3 * i + k]); b[k] = Math.max(b[k], pos[3 * i + k]); } return [a, b]; }
let [a, b] = bbox(); const Lz = b[2] - a[2];
// grosor medio (rango y) en los extremos: la cabeza+cuello es más gruesa que la punta de la cola
function grosor(z0, z1) { let lo = 1e9, hi = -1e9, n = 0; for (let i = 0; i < N; i++) { const z = pos[3 * i + 2]; if (z >= z0 && z <= z1) { lo = Math.min(lo, pos[3 * i + 1]); hi = Math.max(hi, pos[3 * i + 1]); n++; } } return n ? hi - lo : 0; }
const gMin = grosor(a[2], a[2] + 0.2 * Lz), gMax = grosor(b[2] - 0.2 * Lz, b[2]);
let flip = flipArg === 'auto' ? gMin > gMax : flipArg === 'si'; // la cabeza es el extremo de mayor altura
console.log('largo', Lz.toFixed(3), 'altura extremo -z', gMin.toFixed(3), 'extremo +z', gMax.toFixed(3), 'giro 180°:', flip);
if (flip) for (let i = 0; i < N; i++) { pos[3 * i] = -pos[3 * i]; pos[3 * i + 2] = -pos[3 * i + 2]; }
[a, b] = bbox();
const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, s = 1 / (b[2] - a[2]); // largo total = 1
for (let i = 0; i < N; i++) { pos[3 * i] = (pos[3 * i] - cx) * s; pos[3 * i + 1] = (pos[3 * i + 1] - a[1]) * s; pos[3 * i + 2] = (pos[3 * i + 2] - cz) * s; }
// simplificación con atributo de color
const remap = MeshoptSimplifier.generatePositionRemap(pos, 3);
const idx2 = idx.map((i) => remap[i]);
const t0 = Date.now();
const [ni] = MeshoptSimplifier.simplifyWithAttributes(idx2, pos, 3, col, 3, [0.25, 0.25, 0.25], null, Number(triT) * 3, 0.1, (process.env.FLAGS||'').split(',').filter(Boolean));
const [rv, nv] = MeshoptSimplifier.compactMesh(ni);
console.log('simplificado', ni.length / 3, 'tris', nv, 'verts', (Date.now() - t0) + ' ms');
const P = new Float32Array(nv * 3);
for (let i = 0; i < N; i++) { const r = rv[i]; if (r !== 0xffffffff && r < nv) { P[3 * r] = pos[3 * i]; P[3 * r + 1] = pos[3 * i + 1]; P[3 * r + 2] = pos[3 * i + 2]; } }
// color filtrado: promedio de los vértices originales cercanos (equivale a muestrear la textura con filtro)
let el = 0, ec = 0; for (let t = 0; t < ni.length; t += 3) for (let k = 0; k < 3; k++) { const p = ni[t + k], q = ni[t + (k + 1) % 3]; el += Math.hypot(P[3 * p] - P[3 * q], P[3 * p + 1] - P[3 * q + 1], P[3 * p + 2] - P[3 * q + 2]); ec++; }
const R = (el / ec) * 0.75, K = 1 / R, grid = new Map();
const key = (x, y, z) => ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);
for (let i = 0; i < N; i++) { const k = key(Math.floor(pos[3 * i] * K), Math.floor(pos[3 * i + 1] * K), Math.floor(pos[3 * i + 2] * K)); let g = grid.get(k); if (!g) grid.set(k, g = []); g.push(i); }
const C = new Uint8Array(nv * 4);
for (let v = 0; v < nv; v++) {
  const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], cx0 = Math.floor(x * K), cy0 = Math.floor(y * K), cz0 = Math.floor(z * K);
  let sr = 0, sg = 0, sb = 0, sw = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const g = grid.get(key(cx0 + dx, cy0 + dy, cz0 + dz)); if (!g) continue;
    for (const i of g) { const d = Math.hypot(pos[3 * i] - x, pos[3 * i + 1] - y, pos[3 * i + 2] - z) / R; if (d > 1.2) continue; const w = 1 - 0.6 * Math.min(1, d / 1.2); sr += col[3 * i] * w; sg += col[3 * i + 1] * w; sb += col[3 * i + 2] * w; sw += w; }
  }
  if (sw === 0) { sr = 0.5; sg = 0.4; sb = 0.3; sw = 1; }
  C[4 * v] = Math.round(255 * sr / sw); C[4 * v + 1] = Math.round(255 * sg / sw); C[4 * v + 2] = Math.round(255 * sb / sw); C[4 * v + 3] = 255; // sRGB 8 bits (el juego lo pasa a lineal)
}
const out = new Document(); out.createBuffer(); const buf = out.getRoot().listBuffers()[0];
const acc = (t, arr, norm = false) => out.createAccessor().setType(t).setArray(arr).setBuffer(buf).setNormalized(norm);
const mat = out.createMaterial('piel').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
const pr = out.createPrimitive().setAttribute('POSITION', acc('VEC3', P)).setAttribute('COLOR_0', acc('VEC4', C, true)).setIndices(acc('SCALAR', nv < 65536 ? Uint16Array.from(ni) : ni)).setMaterial(mat);
const mesh = out.createMesh('malla').addPrimitive(pr), node = out.createNode('dino').setMesh(mesh);
out.createScene('s').addChild(node);
out.getRoot().getAsset().generator = 'isla-primordial/prep.mjs (fuente: GLB de Higgsfield/Tripo, simplificado)';
await out.transform(quantize({ quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(outp, out);
console.log('escrito', outp, fs.statSync(outp).size, 'bytes');
