// Visor de las manos en primera persona (para ajustarlas): mano de agarre con un mango, puño, vistas fijas. tools/manos-shot.mjs lo captura.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { materialesManos, manoAgarre, puno, antebrazo } from '../../src/player/manos.js';

const q = new URLSearchParams(location.search), W = Number(q.get('w') ?? 360), vistas = (q.get('vistas') ?? 'jugador,frente,lado,arriba').split(',');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W * vistas.length, W); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3a4048);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(0.6, 1, 0.8); scene.add(sol, new THREE.HemisphereLight(0xbfd8ff, 0x5a4a35, 0.6));
const M = materialesManos();
const radio = Number(q.get('radio') ?? 0.019);
const g = new THREE.Group(); scene.add(g);
const mano = manoAgarre(M, radio, false); g.add(mano);
const mango = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 })); mango.position.y = 0.1; g.add(mango);
const fist = puno(M, false); fist.position.set(0.25, 0, 0); scene.add(fist);
const cams = {
  jugador: { pos: [0.16, 0.13, 0.42], look: [0, 0.01, 0] }, // aprox. como la ve el jugador (arriba-detrás-derecha)
  frente: { pos: [0, 0.02, -0.4], look: [0, 0.01, 0] },
  lado: { pos: [0.4, 0.02, 0], look: [0, 0.01, 0] },
  arriba: { pos: [0.02, 0.4, 0.05], look: [0, 0, 0] },
  dorso: { pos: [0, 0.02, 0.4], look: [0, 0.01, 0] },
  puno: { pos: [0.33, 0.12, 0.25], look: [0.25, 0, 0] },
};
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
renderer.setScissorTest(true);
vistas.forEach((v, i) => {
  const c = cams[v] ?? cams.jugador; cam.position.set(...c.pos); cam.lookAt(...c.look);
  renderer.setViewport(i * W, 0, W, W); renderer.setScissor(i * W, 0, W, W); renderer.render(scene, cam);
});
window.__manos = { listo: true };
