// Visor de un GLB estático (solo revisión visual): ?url=/models/fauna/generados/x.glb&vistas=lado,frente,tres,arriba&w=480
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const q = new URLSearchParams(location.search);
const url = q.get('url'), vistas = (q.get('vistas') ?? 'lado,frente,tres,arriba').split(','), w = Number(q.get('w') ?? 480), h = Number(q.get('h') ?? w);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(w * vistas.length, h); renderer.setScissorTest(true); renderer.outputColorSpace = THREE.SRGBColorSpace;
window.__visor = { ready: false, error: null };
try {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcdd6dc);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a6a58, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6); sun.position.set(-4, 8, -3); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfd6ff, 0.8); fill.position.set(5, 2, 4); scene.add(fill);
  gltf.scene.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ vertexColors: !!o.geometry.attributes.color, color: 0xffffff, roughness: 0.85, flatShading: q.get('flat') === '1' }); });
  scene.add(gltf.scene);
  // superposición opcional del esqueleto (?rig=/ruta/modelo.rig.json): esferas en las articulaciones y líneas entre huesos
  if (q.get('rig')) {
    const R = await (await fetch(q.get('rig'))).json(), V = (a) => new THREE.Vector3(...a), cadenas = [], pts = [];
    const m = R.mediana, orden = ['tailTip', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'head', 'hocico'];
    cadenas.push(orden.map((k) => V(m[k])));
    if (R.mandibula) cadenas.push([V(R.mandibula.pivote), V(R.mandibula.punta)]);
    for (const sx of [1, -1]) {
      const p = R.pata, a = R.brazo;
      cadenas.push([[p.cadera, p.rodilla, p.tobillo, p.punta].map((yz) => new THREE.Vector3(p.x * sx, yz[0], yz[1]))].flat());
      if (a) cadenas.push([a.hombro, a.codo, a.mano].map((yz) => new THREE.Vector3(a.x * sx, yz[0], yz[1])));
    }
    const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, depthTest: false }), mj = new THREE.MeshBasicMaterial({ color: 0xffee00, depthTest: false });
    for (const c of cadenas) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), mat); l.renderOrder = 10; scene.add(l); for (const pt of c) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), mj); sp.position.copy(pt); sp.renderOrder = 11; scene.add(sp); } }
    void pts;
  }
  const bb = new THREE.Box3().setFromObject(gltf.scene), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
  let half = Math.max(s.x, s.y, s.z) * 0.62;
  // foco opcional: ?foco=z,y,mitad (acerca la vista, p. ej. a la cabeza)
  const foco = (q.get('foco') ?? '').split(',').map(Number);
  if (foco.length === 3 && foco.every(Number.isFinite)) { c.z = foco[0]; c.y = foco[1]; c.x = 0; half = foco[2]; }
  vistas.forEach((v, i) => {
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, 100), d = 5;
    if (v === 'lado') { cam.position.set(-d, c.y, c.z); cam.lookAt(0, c.y, c.z); }
    else if (v === 'frente') { cam.position.set(c.x, c.y, d); cam.lookAt(c.x, c.y, 0); }
    else if (v === 'arriba') { cam.position.set(c.x, d, c.z); cam.up.set(0, 0, 1); cam.lookAt(c.x, 0, c.z); }
    else { cam.position.set(-d * 0.7, c.y + d * 0.35, c.z + d * 0.7); cam.lookAt(c); }
    renderer.setViewport(i * w, 0, w, h); renderer.setScissor(i * w, 0, w, h); renderer.render(scene, cam);
  });
  window.__visor.ready = true;
} catch (e) { window.__visor.error = String(e?.message ?? e); window.__visor.ready = true; }
