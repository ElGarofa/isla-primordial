// Galería de especies: dibuja la malla de reposo de cada especie (vista lateral, frontal o 3/4) en una hoja de contacto. Solo para revisión visual y pruebas.
//   ?ids=a,b,c · ?fam=bipedos (todas de una familia) · ?cols=4 · ?cell=360 · ?escala=comun|celda · ?vista=lado|frente|tres|arriba
import * as THREE from 'three';
import { SPECIES } from '../../src/fauna/species.js';
import { FAMILIAS_INFO } from '../../src/fauna/familias/index.js';
import { makeSkin } from '../../src/fauna/skin.js';
import { makeSkeleton } from '../../src/fauna/builder.js';
import { cargarEstaticos } from '../../src/fauna/estatico.js';

const q = new URLSearchParams(location.search);
let ids = (q.get('ids') ?? '').split(',').filter(Boolean);
if (q.get('fam')) ids = ids.concat(FAMILIAS_INFO[q.get('fam')] ?? []);
if (q.get('desde')) { const all = Object.keys(SPECIES), a = all.indexOf(q.get('desde')); ids = all.slice(a, a + Number(q.get('n') ?? 12)); }
if (!ids.length) ids = Object.keys(SPECIES).slice(0, 12);
const cols = Number(q.get('cols') ?? Math.min(4, ids.length)), cell = Number(q.get('cell') ?? 360), cellH = Number(q.get('cellh') ?? cell), rows = Math.ceil(ids.length / cols);
const comun = (q.get('escala') ?? 'celda') === 'comun', vista = q.get('vista') ?? 'lado';
const W = cols * cell, H = rows * cellH;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const lab = document.getElementById('lab'); lab.style.width = `${W}px`; lab.style.height = `${H}px`;

const errores = [], stats = {}, items = [];
// modelos estáticos (si la especie los declara y `?proc=1` no pide la malla procedural)
if (q.get('proc') !== '1') { const e = {}; await cargarEstaticos(ids.map((i) => SPECIES[i]).filter(Boolean), e); for (const [k, v] of Object.entries(e)) errores.push(`${k}: ${v}`); }
for (const id of ids) {
  try {
    const sp = SPECIES[id]; if (!sp) throw new Error('especie desconocida');
    const data = sp.build();
    const sk = makeSkeleton(data.specs);
    const skin = makeSkin(sp.skin, 256);
    const map = skin.albedo.clone(), normalMap = skin.normal.clone();
    for (const t of [map, normalMap]) { t.repeat.set(sp.uvK ?? 1, sp.uvK ?? 1); t.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: sp.roughness ?? 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.SkinnedMesh(data.geo, mat);
    mesh.add(sk.bones[0]); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(sk.bones));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcdd6dc);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7a6a58, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6); sun.position.set(-4, 8, -3); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd6ff, 0.8); fill.position.set(5, 2, 4); scene.add(fill);
    scene.add(mesh);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0xaeb8a8 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.visible = !sp.nada && !sp.ai.vuelo; scene.add(ground);
    data.geo.computeBoundingBox(); const bb = data.geo.boundingBox;
    const pos = data.geo.attributes.position.array; let bad = 0; for (const v of pos) if (!Number.isFinite(v)) bad++;
    stats[id] = { tris: data.geo.index ? data.geo.index.count / 3 : data.geo.attributes.position.count / 3, verts: pos.length / 3, bones: sk.bones.length, bad, bbox: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(2)), legs: data.legs.length };
    items.push({ id, sp, scene, bb, sk });
  } catch (e) { errores.push(`${id}: ${e.message}`); console.error(id, e); }
}
let gmax = 0;
for (const it of items) { const { bb } = it; gmax = Math.max(gmax, bb.max.z - bb.min.z, bb.max.y - bb.min.y, bb.max.x - bb.min.x); }
items.forEach((it, i) => {
  const cx = i % cols, cy = Math.floor(i / cols), { bb } = it;
  const ex = bb.max.x - bb.min.x, ey = bb.max.y - bb.min.y, ez = bb.max.z - bb.min.z;
  const ext = vista === 'frente' ? Math.max(ex, ey) : vista === 'arriba' ? Math.max(ex, ez) : Math.max(ez, ey);
  const aspect = cell / cellH, half = (comun ? gmax : ext) * 0.58;
  const mid = vista === 'cabeza' ? new THREE.Vector3(0, hd.y, hd.z + headHalf * 0.15) : new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
  const cam = new THREE.OrthographicCamera(-half, half, half / aspect, -half / aspect, 0.01, 500);
  const d = 80;
  if (vista === 'lado' || vista === 'cabeza') { cam.position.set(-d, mid.y, mid.z); cam.up.set(0, 1, 0); cam.lookAt(0, mid.y, mid.z); }
  else if (vista === 'frente') { cam.position.set(0, mid.y, d); cam.lookAt(0, mid.y, 0); }
  else if (vista === 'arriba') { cam.position.set(0, d, mid.z); cam.up.set(0, 0, 1); cam.lookAt(0, 0, mid.z); }
  else { cam.position.set(-d * 0.7, mid.y + d * 0.35, mid.z + d * 0.6); cam.lookAt(0, mid.y, mid.z); }
  if (comun) { const m = vista === 'lado' ? new THREE.Vector3(0, half * 0.9 - 0 + mid.y - half * 0.9, 0) : null; void m; }
  const x = cx * cell, y = (rows - 1 - cy) * cellH;
  renderer.setViewport(x, y, cell, cellH); renderer.setScissor(x, y, cell, cellH);
  renderer.render(it.scene, cam);
  const l = document.createElement('div'); l.className = 'l'; l.style.left = `${x + 8}px`; l.style.top = `${cy * cellH + 6}px`;
  l.innerHTML = `<b>${it.sp.nombre}</b><br>${(it.sp.cat?.tamano ?? 0)} m · ${it.sp.cat?.masa ?? 0} kg · ${it.sp.cat?.confianza ?? ''}`;
  lab.appendChild(l);
});
window.__galeria = { ready: true, errores, stats, ids, W, H };
