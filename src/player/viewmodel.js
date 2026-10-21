// Modelo en primera persona: brazos y herramientas procedurales con animación (balanceo, marcha, golpes, cambio de objeto).
// Se renderiza en una escena aparte (ctx.viewmodel) después del mundo, con luces propias que copian las del sol y el ambiente.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeIn = (t) => { t = clamp(t, 0, 1); return t * t * t; };
const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };

// ---------------------------------------------------------------------------------------------- texturas
function canvasTexture(size, paint, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
function woodTexture() {
  const rnd = mulberry32(21);
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#7a5530'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * s, w = 1 + rnd() * 5, a = 0.05 + rnd() * 0.18;
      g.fillStyle = rnd() < 0.55 ? `rgba(40,22,8,${a})` : `rgba(190,140,80,${a})`;
      g.fillRect(x, 0, w, s);
    }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(30,16,6,0.35)'; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 2 + rnd() * 3, 5 + rnd() * 8, 0, 0, 6.3); g.fill(); }
  });
}
function stoneTexture() {
  const rnd = mulberry32(5);
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#85817a'; g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 38; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30,28,25,${0.1 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd() * 1.2; g.beginPath(); const x = rnd() * s, y = rnd() * s; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40); g.stroke(); }
  });
}
function fibreTexture() {
  const rnd = mulberry32(9);
  return canvasTexture(64, (g, s) => {
    g.fillStyle = '#b79a63'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(80,58,28,0.5)' : 'rgba(230,205,150,0.45)'; g.lineWidth = 1.2; const y = rnd() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (rnd() - 0.5) * 10); g.stroke(); }
  });
}
function skinTexture() {
  const rnd = mulberry32(33);
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#b07a58'; g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 16; d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.7; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(120,70,50,${0.05 + rnd() * 0.1})`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 1 + rnd() * 3, 0, 6.3); g.fill(); }
  });
}

// ---------------------------------------------------------------------------------------------- geometrías
const rndJ = mulberry32(77);
function jitter(geo, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rndJ() - 0.5) * amt, p.getY(i) + (rndJ() - 0.5) * amt, p.getZ(i) + (rndJ() - 0.5) * amt);
  geo.computeVertexNormals();
  return geo;
}
/** Mango ligeramente torcido y cónico, de y0 a y1. */
function shaft(y0, y1, r0, r1, bend = 0.004) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 12, 10, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + (y1 - y0) / 2) / (y1 - y0);
    p.setX(i, p.getX(i) + Math.sin(t * 5.3) * bend);
    p.setZ(i, p.getZ(i) + Math.cos(t * 3.7) * bend * 0.7);
  }
  g.translate(0, (y0 + y1) / 2, 0);
  g.computeVertexNormals();
  return g;
}
/** Polígono 2D en el plano (a, b) extruido a lo largo del tercer eje. */
function extrudePoly(pts, depth, bevel = 0.005) {
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function ring(r, tube, y, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(r, tube, 6, 18, arc);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

export function createViewmodel(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.02, 8);
  scene.add(camera);

  const sunL = new THREE.DirectionalLight(0xffffff, 2);
  const hemiL = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a35, 0.8);
  const torchL = new THREE.PointLight(0xff8a3a, 0, 2.4, 1.5);
  scene.add(sunL, sunL.target, hemiL, torchL);

  const M = {
    skin: new THREE.MeshStandardMaterial({ color: 0xffffff, map: skinTexture(), roughness: 0.68, metalness: 0, emissive: 0x2a0d06, emissiveIntensity: 0.18 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95, map: fibreTexture() }),
    wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture(), roughness: 0.82 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(), roughness: 0.92, flatShading: true }),
    fibre: new THREE.MeshStandardMaterial({ color: 0xffffff, map: fibreTexture(), roughness: 0.95 }),
    ember: new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff6a1a, emissiveIntensity: 2.2, roughness: 0.9 }),
    char: new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 1 }),
  };
  M.wood.map.repeat.set(1, 2);
  for (const m of Object.values(M)) ctx.lighting?.setupMaterial?.(m, { fog: false });

  // ------------------------------------------------------------------------------------------ mano
  /** Mano que empuña un mango vertical (eje Y). La palma queda hacia +Z (hacia la cámara); `radio` = grosor del mango. */
  function makeHand(radio = 0.019, mirror = false) {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.skin);
    palm.scale.set(0.046, 0.054, 0.025); palm.position.set(0.004, 0, radio + 0.02);
    h.add(palm);
    const R = radio + 0.0105;
    const fingers = [[0.034, 0.0102, 1.0], [0.0115, 0.0108, 1.02], [-0.0105, 0.0102, 1.0], [-0.031, 0.0092, 0.94]];
    for (const [y, t, k] of fingers) {
      const g = new THREE.TorusGeometry(R * k, t, 8, 20, Math.PI * 1.5);
      g.rotateZ(Math.PI * 0.75);
      g.rotateX(Math.PI / 2);
      g.translate(0, y, 0);
      const m = new THREE.Mesh(g, M.skin);
      h.add(m);
      // nudillo
      const kn = new THREE.Mesh(new THREE.SphereGeometry(t * 1.12, 8, 6), M.skin);
      kn.position.set(-R * k * 0.78, y, R * k * 0.62);
      h.add(kn);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.04, 4, 8), M.skin);
    thumb.position.set(-0.026, 0.048, radio + 0.015);
    thumb.rotation.set(0.2, 0.5, 1.15);
    h.add(thumb);
    if (mirror) h.scale.x = -1;
    return h;
  }


  /** Puño de guardia (sin herramienta). Marco: -Z hacia delante, +Y arriba; el antebrazo sale hacia +Z. */
  function makeFist(mirror = false) {
    const h = new THREE.Group();
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.skin);
    back.scale.set(0.043, 0.032, 0.056); back.position.set(0, 0, 0.012);
    h.add(back);
    // bloque de dedos plegados: dos filas de falanges (arriba los nudillos, abajo las puntas) y surcos entre dedos
    const row = (y, z, r, len) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 10), M.skin); m.rotation.z = Math.PI / 2; m.position.set(0, y, z); h.add(m); };
    row(0.009, -0.056, 0.0155, 0.058);
    row(-0.011, -0.052, 0.0135, 0.056);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.03, 0.02), M.cloth);
      g.position.set(-0.0215 + i * 0.0215, 0.0, -0.063); h.add(g);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.034, 4, 8), M.skin);
    thumb.position.set(-0.03, 0.026, -0.03); thumb.rotation.set(1.45, 0.1, 0.5);
    h.add(thumb);
    h.userData.wrist = new THREE.Vector3(0.002, -0.004, 0.075);
    h.userData.fist = true;
    if (mirror) h.scale.x = -1;
    return h;
  }

  // brazos (antebrazo cónico + puño de tela)
  function makeArm() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.027, 0.04, 1, 14, 1, false);
    const arm = new THREE.Mesh(geo, M.skin);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.037, 0.07, 14, 1, false), M.cloth);
    g.add(arm, cuff);
    g.userData = { arm, cuff };
    return g;
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  function placeArm(armGroup, elbow, wrist) {
    _d.copy(wrist).sub(elbow);
    const len = _d.length();
    _d.normalize();
    const { arm, cuff } = armGroup.userData;
    arm.position.copy(elbow).addScaledVector(_d, len / 2);
    arm.scale.set(1, len, 1);
    arm.quaternion.setFromUnitVectors(UP, _d);
    cuff.position.copy(wrist).addScaledVector(_d, -0.075);
    cuff.quaternion.copy(arm.quaternion);
  }

  // ------------------------------------------------------------------------------------------ herramientas (marco: origen = agarre, +Y hacia la cabeza, filo hacia -Z)
  const stoneMesh = (geo) => { const m = new THREE.Mesh(geo, M.stone); return m; };
  const lash = (y, r = 0.0225, t = 0.0055) => new THREE.Mesh(ring(r, t, y), M.fibre);

  const BUILD = {
    hacha_piedra() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shaft(-0.17, 0.5, 0.0185, 0.0155), M.wood));
      const head = stoneMesh(jitter(extrudePoly([[0.045, 0.34], [0.045, 0.405], [-0.02, 0.425], [-0.128, 0.46], [-0.138, 0.385], [-0.128, 0.31], [-0.02, 0.335]], 0.05, 0.006), 0.004));
      head.rotation.y = Math.PI / 2; // el polígono usa (z, y): se extruye a lo largo de x
      g.add(head);
      for (const y of [0.3, 0.315, 0.43, 0.445]) g.add(lash(y, 0.0215, 0.0052));
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.wood); pommel.position.y = -0.17; g.add(pommel);
      g.userData.tip = new THREE.Vector3(0, 0.46, -0.1);
      return g;
    },
    pico_piedra() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shaft(-0.17, 0.52, 0.0185, 0.0155), M.wood));
      const head = stoneMesh(jitter(extrudePoly([[-0.23, 0.455], [-0.13, 0.505], [0, 0.525], [0.13, 0.505], [0.23, 0.455], [0.2, 0.44], [0.115, 0.485], [0, 0.5], [-0.115, 0.485], [-0.2, 0.44]], 0.038, 0.005), 0.004));
      head.rotation.y = Math.PI / 2;
      g.add(head);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.07), M.stone); core.position.set(0, 0.49, 0); g.add(core);
      for (const y of [0.4, 0.415, 0.43]) g.add(lash(y, 0.0215, 0.0052));
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.wood); pommel.position.y = -0.17; g.add(pommel);
      g.userData.tip = new THREE.Vector3(0, 0.5, -0.22);
      return g;
    },
    lanza() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shaft(-0.5, 1.28, 0.0165, 0.0125, 0.006), M.wood));
      const tip = stoneMesh(jitter(extrudePoly([[0, 1.22], [0.036, 1.29], [0.012, 1.44], [0, 1.5], [-0.012, 1.44], [-0.036, 1.29]], 0.012, 0.004), 0.002));
      g.add(tip);
      for (const y of [1.19, 1.205, 1.22, 1.235]) g.add(lash(y, 0.0165, 0.005));
      g.add(lash(0.42, 0.018, 0.006), lash(-0.04, 0.019, 0.006));
      g.userData.tip = new THREE.Vector3(0, 1.5, 0);
      return g;
    },
    antorcha() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shaft(-0.14, 0.42, 0.0175, 0.0145), M.wood));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.027, 0.15, 12, 3), M.char);
      head.position.y = 0.46;
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.03, 0.09, 12, 3), M.fibre); wrap.position.y = 0.43;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), M.ember); glow.position.y = 0.545; glow.scale.y = 0.8;
      g.add(head, wrap, glow);
      g.userData.tip = new THREE.Vector3(0, 0.6, 0);
      return g;
    },
  };

  // ------------------------------------------------------------------------------------------ rig
  const root = new THREE.Group();
  scene.add(root);
  const rigR = new THREE.Group(), rigL = new THREE.Group();
  root.add(rigR, rigL);
  const gripR = makeHand(0.019, false), gripL = makeHand(0.019, true), fistR = makeFist(false), fistL = makeFist(true);
  gripR.userData.wrist = new THREE.Vector3(0.012, -0.075, 0.062); gripL.userData.wrist = new THREE.Vector3(-0.012, -0.075, 0.062);
  let handR = gripR, handL = gripL;
  rigR.add(gripR); rigL.add(gripL);
  const armR = makeArm(), armL = makeArm();
  root.add(armR, armL);
  const toolSlot = new THREE.Group();
  rigR.add(toolSlot);
  toolSlot.add(gripR); // la mano va dentro del slot para que el mango la atraviese
  rigR.add(fistR); rigL.add(fistL);

  const tools = {};
  const state = {
    item: null, shown: null, equipK: 1, equipT: 0, pending: undefined,
    attack: null, punchSide: 0, t: 0, phase: 0, bobAmp: 0, sprintK: 0, kickY: 0, kickV: 0,
    swayX: 0, swayY: 0, lastYaw: null, lastPitch: null, fire: null, visible: true,
  };

  // postura base por tipo (rig derecho)
  const BASE = {
    puno: { pos: [0.17, -0.2, -0.46], rot: [0.12, 0.3, -0.06], left: { pos: [-0.17, -0.2, -0.46], rot: [0.12, -0.3, 0.06] } },
    hacha_piedra: { pos: [0.25, -0.24, -0.54], rot: [-0.45, 0.55, 0.12] },
    pico_piedra: { pos: [0.25, -0.24, -0.54], rot: [-0.45, 0.4, 0.12] },
    lanza: { pos: [0.2, -0.3, -0.46], rot: [-1.0, 0.1, 0.12] },
    antorcha: { pos: [0.25, -0.26, -0.5], rot: [-0.3, 0.12, 0.2] },
  };

  function setTool(item) {
    for (const k of Object.keys(tools)) tools[k].visible = false;
    state.shown = item;
    const key = BUILD[item] ? item : null;
    if (key) {
      tools[key] ??= (() => { const t = BUILD[key](); toolSlot.add(t); return t; })();
      tools[key].visible = true;
    }
    // sin herramienta: dos puños; con herramienta: la derecha empuña (y la izquierda ayuda en la lanza)
    for (const hnd of [gripR, gripL, fistR, fistL]) { hnd.visible = false; }
    toolSlot.remove(gripL); rigL.remove(gripL);
    if (!key) { fistR.visible = fistL.visible = true; handR = fistR; handL = fistL; }
    else {
      gripR.visible = true; handR = gripR; handL = gripL;
      if (key === 'lanza') { toolSlot.add(gripL); gripL.position.set(0.0, 0.4, 0); gripL.rotation.set(0, 0, 0); gripL.visible = true; }
      else { rigL.add(gripL); gripL.visible = false; }
    }
    armL.visible = handL.visible;
    if (key === 'antorcha') ensureFire(); else killFire();
  }
  function ensureFire() {
    if (state.fire || !ctx.fx?.createFire) return;
    state.fire = ctx.fx.createFire(new THREE.Vector3(), { escala: 0.2, antorcha: true, luz: true, intensidad: 0.9 });
  }
  function killFire() { state.fire?.dispose?.(); state.fire = null; torchL.intensity = 0; }

  ctx.events.on('equip:changed', ({ item }) => {
    if ((item ?? null) === (state.item ?? null)) return;
    state.item = item ?? null; state.equipT = 0; state.pending = state.item;
  });
  ctx.events.on('player:attack', ({ tool }) => {
    const t = BUILD[tool] ? tool : 'puno';
    const dur = t === 'puno' ? 0.4 : t === 'lanza' ? 0.55 : 0.55;
    state.attack = { t: 0, dur, kind: t, side: state.punchSide };
    if (t === 'puno') state.punchSide ^= 1;
  });
  ctx.events.on('player:jump', () => { state.kickV -= 0.9; });
  ctx.events.on('player:land', ({ speed }) => { state.kickV -= clamp((speed ?? 4) * 0.06, 0.2, 1.2); });
  ctx.events.on('player:damage', () => { state.kickV -= 0.5; });

  state.item = ctx.survival?.equipped ?? null;
  setTool(state.item);

  // ------------------------------------------------------------------------------------------ animación de golpes
  const out = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
  function attackPose(a) {
    const p = clamp(a.t / a.dur, 0, 1);
    out.px = out.py = out.pz = out.rx = out.ry = out.rz = 0;
    const k = a.kind;
    if (k === 'hacha_piedra' || k === 'pico_piedra') {
      const W = 0.24, S = 0.44;
      let u;
      if (p < W) { u = easeOut(p / W); out.rx = 0.95 * u; out.py = 0.1 * u; out.pz = 0.07 * u; out.rz = -0.3 * u; out.px = 0.02 * u; }
      else if (p < S) { u = easeIn((p - W) / (S - W)); out.rx = lerp(0.95, -1.15, u); out.py = lerp(0.1, -0.13, u); out.pz = lerp(0.07, -0.18, u); out.rz = lerp(-0.3, 0.15, u); out.px = lerp(0.02, -0.04, u); }
      else { u = smooth((p - S) / (1 - S)); out.rx = lerp(-1.15, 0, u); out.py = lerp(-0.13, 0, u); out.pz = lerp(-0.18, 0, u); out.rz = lerp(0.15, 0, u); out.px = lerp(-0.04, 0, u); }
    } else if (k === 'lanza') {
      const W = 0.22, S = 0.38;
      let u;
      if (p < W) { u = easeOut(p / W); out.pz = 0.13 * u; out.rx = 0.18 * u; out.py = 0.02 * u; }
      else if (p < S) { u = easeIn((p - W) / (S - W)); out.pz = lerp(0.13, -0.4, u); out.rx = lerp(0.18, -0.12, u); out.py = lerp(0.02, 0.03, u); }
      else { u = smooth((p - S) / (1 - S)); out.pz = lerp(-0.4, 0, u); out.rx = lerp(-0.12, 0, u); out.py = lerp(0.03, 0, u); }
    } else if (k === 'antorcha') {
      const S = 0.35;
      const u = p < S ? easeOut(p / S) : smooth(1 - (p - S) / (1 - S));
      out.rx = -0.9 * u; out.py = -0.06 * u; out.pz = -0.1 * u; out.rz = 0.2 * u;
    } else {
      // puño: el brazo que golpea avanza y gira
      const u = p < 0.32 ? easeOut(p / 0.32) : smooth(1 - (p - 0.32) / 0.68);
      out.pz = -0.3 * u; out.py = 0.06 * u; out.px = (a.side ? 1 : -1) * -0.06 * u; out.rx = -0.25 * u;
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ actualización
  const elbowR = new THREE.Vector3(), elbowL = new THREE.Vector3(), wristR = new THREE.Vector3(), wristL = new THREE.Vector3();
  const qCam = new THREE.Quaternion(), tmp = new THREE.Vector3(), fireW = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const base = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

  function applyRig(rig, b, extra, mix = 1) {
    rig.position.set(b.pos[0] + (extra.px ?? 0) * mix, b.pos[1] + (extra.py ?? 0) * mix, b.pos[2] + (extra.pz ?? 0) * mix);
    rig.rotation.set(b.rot[0] + (extra.rx ?? 0) * mix, b.rot[1] + (extra.ry ?? 0) * mix, b.rot[2] + (extra.rz ?? 0) * mix);
  }

  function update(dt) {
    const player = ctx.player, st = ctx.state;
    const vis = (st === 'playing' || st === 'paused') && !(ctx.survival?.dead) && !player.swimming && !ctx.debug?.hideViewmodel;
    root.visible = vis;
    if (!vis) { if (state.fire) { state.fire.setIntensity?.(0); } torchL.intensity = 0; return; }
    state.fire?.setIntensity?.(0.9);

    const cam = ctx.camera;
    if (Math.abs(camera.aspect - cam.aspect) > 1e-3) { camera.aspect = cam.aspect; }
    const baseFov = ctx.config.render.fov;
    const fov = 58 + (cam.fov - baseFov) * 0.25;
    if (Math.abs(camera.fov - fov) > 0.05 || camera.aspect !== camera.userData.aspect) { camera.fov = fov; camera.userData.aspect = camera.aspect; camera.updateProjectionMatrix(); }

    // luces: dirección del sol relativa a la cámara
    cam.getWorldQuaternion(qCam);
    const L = ctx.lighting;
    if (L) {
      tmp.copy(L.sun.position).normalize().applyQuaternion(qCam.clone().invert());
      sunL.position.copy(tmp).multiplyScalar(4);
      sunL.color.copy(L.sun.color);
      const night = ctx.time.nightFactor ?? 0;
      sunL.intensity = L.sun.intensity * 0.62;
      hemiL.color.copy(L.hemi.color); hemiL.groundColor.copy(L.hemi.groundColor);
      hemiL.intensity = L.hemi.intensity * 1.15 + 0.04 * (1 - night);
    }

    if (dt <= 0) return;
    state.t += dt;

    // cambio de objeto: baja, cambia, sube
    if (state.pending !== undefined) {
      state.equipT += dt;
      state.equipK = clamp(state.equipT / 0.16, 0, 1);
      if (state.equipT >= 0.16) { setTool(state.pending); state.pending = undefined; state.equipT = 0; state.raise = true; }
    } else if (state.raise) {
      state.equipT += dt;
      state.equipK = 1 - clamp(state.equipT / 0.24, 0, 1);
      if (state.equipT >= 0.24) { state.raise = false; state.equipK = 0; }
    } else state.equipK = 0;
    const eq = smooth(state.equipK);

    // marcha, balanceo con la cámara, sprint
    const hs = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.onGround && hs > 0.5;
    state.bobAmp = damp(state.bobAmp, moving ? clamp(hs / 7, 0.25, 1) : 0, 8, dt);
    state.phase += hs * dt * (player.sprinting ? 1.35 : 1.15);
    state.sprintK = damp(state.sprintK, player.sprinting && moving ? 1 : 0, 7, dt);
    if (state.lastYaw === null) { state.lastYaw = player.yaw; state.lastPitch = player.pitch; }
    let dy = player.yaw - state.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = player.pitch - state.lastPitch;
    state.lastYaw = player.yaw; state.lastPitch = player.pitch;
    state.swayX = damp(state.swayX, clamp(-dy * 1.4, -0.07, 0.07) / Math.max(dt * 60, 1) * 1, 9, dt);
    state.swayY = damp(state.swayY, clamp(dp * 1.4, -0.06, 0.06) / Math.max(dt * 60, 1), 9, dt);
    // resorte vertical para saltos y aterrizajes
    state.kickV += (-state.kickY * 90 - state.kickV * 12) * dt;
    state.kickY += state.kickV * dt;

    const breathe = Math.sin(state.t * 1.7) * 0.0035, breathe2 = Math.sin(state.t * 1.1 + 1) * 0.006;
    const A = state.attack;
    if (A) { A.t += dt; if (A.t >= A.dur) state.attack = null; }
    const bobX = Math.cos(state.phase) * 0.011 * state.bobAmp, bobY = Math.abs(Math.sin(state.phase)) * -0.016 * state.bobAmp + Math.sin(state.phase * 2) * 0.004 * state.bobAmp;
    const sk = state.sprintK;

    const key = BASE[state.shown] ? state.shown : 'puno';
    const B = BASE[key];
    const atk = A ? attackPose({ ...A }) : null;
    const mixR = A && (key !== 'puno' || A.side === 0) ? 1 : 0;
    const common = {
      px: state.swayX * 0.5 + bobX + (A ? 0 : 0) + sk * 0.03,
      py: breathe + bobY + state.kickY * 0.12 + state.swayY * 0.4 - eq * 0.5 - sk * 0.06,
      pz: sk * 0.03 + eq * 0.1,
      rx: state.swayY * 0.9 + breathe2 + eq * 0.9 + sk * 0.45,
      ry: state.swayX * 1.1 - sk * 0.25,
      rz: breathe2 * 0.5 + Math.cos(state.phase) * 0.012 * state.bobAmp - sk * 0.25,
    };
    const ex = { px: common.px, py: common.py, pz: common.pz, rx: common.rx, ry: common.ry, rz: common.rz };
    if (atk && mixR) { ex.px += atk.px; ex.py += atk.py; ex.pz += atk.pz; ex.rx += atk.rx; ex.ry += atk.ry; ex.rz += atk.rz; }
    applyRig(rigR, B, ex);

    if (key === 'puno') {
      const exL = { ...common, px: -common.px, rz: -common.rz, ry: -common.ry };
      if (atk && A.side === 1) { exL.px += -atk.px; exL.py += atk.py; exL.pz += atk.pz; exL.rx += atk.rx; exL.rz -= atk.rz; }
      applyRig(rigL, B.left, exL);
    }

    // brazos: del codo (fuera de pantalla) a la muñeca de cada mano
    root.updateMatrixWorld(true);
    const wrist = (hand, out2) => hand.localToWorld(out2.copy(hand.userData.wrist));
    wrist(handR, wristR);
    elbowR.set(0.34 + state.swayX * 0.3, -0.72 + state.kickY * 0.1, 0.26);
    placeArm(armR, elbowR, wristR);
    if (handL.visible) {
      wrist(handL, wristL);
      elbowL.set(-0.34 + state.swayX * 0.3, -0.72, 0.26);
      if (key === 'lanza') elbowL.set(-0.2, -0.7, 0.3);
      placeArm(armL, elbowL, wristL);
    }

    // antorcha: llama en el mundo y luz propia
    if (key === 'antorcha' && state.fire && tools.antorcha) {
      tmp.copy(tools.antorcha.userData.tip);
      tools.antorcha.localToWorld(tmp);
      torchL.position.copy(tmp);
      fireW.copy(tmp);
      cam.localToWorld(fireW);
      state.fire.setPosition(fireW);
      const fl = 0.8 + 0.2 * Math.sin(state.t * 19) * Math.sin(state.t * 7.1) + 0.1 * Math.sin(state.t * 33);
      torchL.intensity = 1.6 * fl * (0.6 + 0.4 * (ctx.time.nightFactor ?? 0));
      M.ember.emissiveIntensity = 1.8 + fl;
    } else torchL.intensity = 0;
  }

  /** Equipa al instante (sin animación): lo usan las capturas de depuración. */
  function equipNow(item) { state.item = item ?? null; state.pending = undefined; state.raise = false; state.equipK = 0; setTool(state.item); }
  return { scene, camera, update, equipNow, get tool() { return state.shown; }, state };
}
