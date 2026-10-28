// Representación visual de una criatura a partir de un modelo GLB con esqueleto y animaciones (ver docs/MODELOS_3D.md).
//
// La IA, el movimiento, las colisiones, las habilidades y la doma NO conocen este archivo: siguen hablando con `Creature` y con los datos de
// la especie. Cuando una especie declara `glb`, `Creature` delega aquí SOLO lo visual:
//   · carga única por especie (geometría soldada/suavizada/coloreada + clips + calibración de zancada), compartida por todos los ejemplares;
//   · por ejemplar: un clon de los huesos, una SkinnedMesh que reutiliza geometría y material compartidos y un AnimationMixer;
//   · el estado de la IA elige el clip (reposo / caminar / correr / morder / morir) y las "capas" (cabeza baja al pastar, cuello alto al llamar,
//     mirada, retroceso al recibir daño) se mezclan como animaciones ADITIVAS sobre el clip, nunca tocando huesos a mano.
// Si el GLB no carga (sin red, archivo ausente), `cargarVisuales` lo anota y la especie vuelve a su malla procedural: el juego no se rompe.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { unir, subdividir, geometria, elipsoide } from './malla.js';
import { colorizer } from './color.js';
import { PART } from './builder.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);

const CLIPS = { idle: /idle/i, walk: /walk/i, run: /run/i, attack: /attack/i, death: /death/i };

// ---------------------------------------------------------------------------------------------- carga y preparación (una vez por especie)
function colorDeZona(pal, tipo) {
  const col = colorizer(pal), tmp = [0, 0, 0];
  const part = { cuerpo: PART.cuerpo, garra: PART.garra, cresta: PART.cresta, cuerno: PART.cuerno, placa: PART.placa, diente: PART.diente, ojo: PART.ojo, gola: PART.gola }[tipo];
  return (x, y, z, nx, ny, nz, out) => {
    if (tipo === 'vientre') col(x, y, z, nx, -0.25, nz, PART.cuerpo, out); // zonas claras (garganta/panza): siempre el tono de vientre
    else { col(x, y, z, nx, ny, nz, part ?? PART.cuerpo, tmp); out[0] = tmp[0]; out[1] = tmp[1]; out[2] = tmp[2]; }
  };
}

function medirZancada(data, tmpl, clip, pies, escala) {
  // Velocidad (unidades del modelo / s) a la que se mueve hacia atrás un pie apoyado: es la velocidad del cuerpo con la que el pie no resbala.
  const root = tmpl.clone(true); root.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(clip); act.play();
  const bones = pies.map((n) => root.getObjectByName(n)).filter(Boolean), v = new THREE.Vector3();
  const N = 32, dur = clip.duration, ys = bones.map(() => []), zs = bones.map(() => []);
  for (let i = 0; i < N; i++) {
    mixer.setTime((i / N) * dur); root.updateMatrixWorld(true);
    bones.forEach((b, k) => { b.getWorldPosition(v); ys[k].push(v.y); zs[k].push(v.z); });
  }
  const sueloGlobal = Math.min(...ys.map((a) => Math.min(...a)));
  const vels = [];
  bones.forEach((b, k) => {
    const mn = Math.min(...ys[k]), mx = Math.max(...ys[k]);
    if (mn > sueloGlobal + 0.35 * (data.altura ?? 1)) return; // pie que nunca toca el suelo (brazos)
    const umbral = mn + 0.18 * (mx - mn) + 0.02, enApoyo = [];
    for (let i = 0; i < N; i++) {
      if (ys[k][i] > umbral) continue;
      const a = zs[k][(i + N - 1) % N], c = zs[k][(i + 1) % N];
      enApoyo.push(-(c - a) / (2 * dur / N));
    }
    // velocidad de BARRIDO: se ignoran los fotogramas en que el pie, aunque toca el suelo, apenas se mueve (despegue/aterrizaje)
    const mxv = Math.max(...enApoyo, 0), barrido = enApoyo.filter((v) => v > 0.5 * mxv);
    if (barrido.length >= 2) vels.push(barrido.reduce((a, b) => a + b, 0) / barrido.length);
  });
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  vels.sort((a, b) => a - b);
  void escala;
  return vels.length ? Math.max(0.2, vels[Math.floor(vels.length / 2)]) : null;
}

/**
 * Perfil de zancada de un clip de locomoción ("stride warping"). El clip original barre el pie de apoyo hacia atrás a velocidad variable
 * (arranca en 0, sube y vuelve a 0): reproducido a ritmo constante, el pie resbala sobre el suelo. Aquí se mide, en 64 instantes del clip,
 * la velocidad hacia atrás del pie apoyado y se construye una tabla que reparte el reloj del clip según la DISTANCIA recorrida:
 * el reloj corre despacio cuando el pie barre rápido y deprisa cuando apenas se mueve (despegue/aterrizaje), de modo que el pie apoyado
 * avanza hacia atrás a la velocidad del cuerpo. Fases sin pie apoyado (vuelo de la carrera) usan la velocidad media de apoyo.
 * Devuelve { cum: acumulado normalizado 0..1 en N+1 puntos, S: longitud de zancada (unidades del modelo por ciclo), dur }.
 */
function perfilZancada(data, tmpl, clip, pies) {
  const root = tmpl.clone(true); root.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play();
  const bones = pies.map((n) => root.getObjectByName(n)).filter(Boolean), v = new THREE.Vector3();
  const N = 64, dur = clip.duration, ys = bones.map(() => []), zs = bones.map(() => []);
  for (let i = 0; i < N; i++) {
    mixer.setTime((i / N) * dur); root.updateMatrixWorld(true);
    bones.forEach((b, k) => { b.getWorldPosition(v); ys[k].push(v.y); zs[k].push(v.z); });
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const sueloGlobal = Math.min(...ys.map((a) => Math.min(...a))), dt = dur / N;
  const apoyo = new Array(N).fill(0);
  bones.forEach((b, k) => {
    const mn = Math.min(...ys[k]), mx = Math.max(...ys[k]);
    if (mn > sueloGlobal + 0.35 * (data.altura ?? 1)) return; // brazos: nunca tocan el suelo
    const lim = mn + 0.25 * (mx - mn) + 0.02;
    for (let i = 0; i < N; i++) {
      if (ys[k][i] > lim) continue;
      const vel = -(zs[k][(i + 1) % N] - zs[k][(i + N - 1) % N]) / (2 * dt);
      if (vel > apoyo[i]) apoyo[i] = vel;
    }
  });
  const pos = apoyo.filter((x) => x > 0);
  if (pos.length < 4) return null;
  const media = pos.reduce((a, b) => a + b, 0) / pos.length, minimo = 0.35 * media; // tope: el reloj nunca corre a más de ~3× el ritmo medio
  const vel = apoyo.map((x) => (x > 0 ? Math.max(x, minimo) : media));
  const cum = new Float32Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + 0.5 * (vel[i] + vel[(i + 1) % N]) * dt;
  const S = cum[N]; for (let i = 0; i <= N; i++) cum[i] /= S;
  return { cum, S, dur, N };
}

/**
 * Esferas de impacto ajustadas al modelo: por cada grupo de huesos, los vértices que más dependen de ellos se reparten en `n` tramos a lo
 * largo de z y cada tramo recibe una esfera (centro = media, radio = percentil 92 + holgura). Así la caja de impactos coincide con el cuerpo
 * real y no con la del modelo procedural anterior. Formato igual que `sp.hit`: [x, y, z, r] en metros, con +z = adelante. La PRIMERA esfera es el centro del cuerpo.
 */
function ajustarHit(grupos, geo, poses, boneNames, escala, suelo) {
  const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, n = SI.count;
  const idx = (nombre) => boneNames.findIndex((b) => norm(b) === norm(nombre));
  const nP = poses.length, out = [];
  const media = (v, c) => { let a = 0; for (let k = 0; k < nP; k++) a += poses[k][v * 3 + c]; return a / nP; };
  for (const gr of grupos) {
    const set = new Set(gr.huesos.map(idx).filter((i) => i >= 0)), vs = [];
    for (let v = 0; v < n; v++) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k++) if (SW.getComponent(v, k) > bw) { bw = SW.getComponent(v, k); best = SI.getComponent(v, k); }
      if (set.has(best)) vs.push([v, media(v, 2)]);
    }
    if (vs.length < 6) continue;
    vs.sort((a, b) => a[1] - b[1]);
    const tramos = gr.n ?? 1, esf = [];
    for (let t = 0; t < tramos; t++) {
      const sub = vs.slice(Math.floor((t * vs.length) / tramos), Math.floor(((t + 1) * vs.length) / tramos));
      if (!sub.length) continue;
      // centro = media de todas las poses (el cuerpo se mueve alrededor de él); radio = percentil 92 de las distancias de todas las poses
      const c = [0, 0, 0]; let cnt = 0;
      for (const [v] of sub) for (let k = 0; k < nP; k++) { c[0] += poses[k][v * 3] * escala; c[1] += (poses[k][v * 3 + 1] + suelo) * escala; c[2] += poses[k][v * 3 + 2] * escala; cnt++; }
      c[0] = gr.simetrico === false ? c[0] / cnt : 0; c[1] /= cnt; c[2] /= cnt;
      const d = [];
      for (const [v] of sub) for (let k = 0; k < nP; k++) d.push(Math.hypot(poses[k][v * 3] * escala - c[0], (poses[k][v * 3 + 1] + suelo) * escala - c[1], poses[k][v * 3 + 2] * escala - c[2]));
      d.sort((a, b) => a - b);
      esf.push([+c[0].toFixed(2), +c[1].toFixed(2), +c[2].toFixed(2), +(d[Math.floor(d.length * 0.92)] * (gr.k ?? 1) + 0.1).toFixed(2)]);
    }
    // el grupo principal ordena sus tramos de más a menos central para que la primera esfera sea el cuerpo principal (la mayor)
    if (out.length === 0) esf.sort((a, b) => b[3] - a[3]);
    out.push(...esf);
  }
  return out;
}

/** Carga y prepara el GLB de una especie. Devuelve los datos compartidos por todos sus ejemplares. */
export async function prepararEspecie(sp, loader = null) {
  const g = sp.glb;
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(base() + g.url);
  const meshes = []; gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) throw new Error(`${g.url}: no contiene una malla con esqueleto`);
  const skel = meshes[0].skeleton;
  const boneNames = skel.bones.map((b) => b.name);
  const boneInverses = skel.boneInverses.map((m) => m.clone());
  const bindMatrix = meshes[0].bindMatrix.clone();

  // malla: unir, soldar, suavizar y colorear por zonas con la paleta de la especie
  let M = unir(meshes);
  for (let i = 0; i < (g.subdividir ?? 0); i++) M = subdividir(M, g.suavidad ?? 0.6);
  for (const o of g.ojos ?? []) { const idx = boneNames.findIndex((b) => norm(b) === norm(o.hueso)); if (idx >= 0) elipsoide(M, { ...o, hueso: idx, zona: 'Ojo' }); } // el modelo original no trae ojos
  const porZona = M.zonas.map((n) => colorDeZona(sp.pal, n === 'Ojo' ? 'ojo' : (g.zonas?.[n] ?? 'cuerpo')));
  const geo = geometria(M, { escala: g.escala, angulo: g.angulo ?? 55, uvM: g.uvM ?? 0.5, colorZona: (z, x, y, zz, nx, ny, nz, out) => porZona[z](x, y, zz, nx, ny, nz, out) });
  geo.boundingSphere.radius *= 1.4; // holgura para el culling con la malla animada

  // plantilla de huesos (sin las mallas) y clips
  for (const m of meshes) m.removeFromParent();
  const tmpl = gltf.scene; tmpl.updateMatrixWorld(true);
  const clips = {};
  for (const [k, re] of Object.entries(CLIPS)) { const c = gltf.animations.find((a) => re.test(a.name)); if (c) clips[k] = c; }
  if (!clips.idle || !clips.walk) throw new Error(`${g.url}: faltan los clips Idle/Walk (hay: ${gltf.animations.map((a) => a.name).join(', ')})`);

  // altura de reposo (suelo) con la malla ya sesgada por el primer fotograma de Idle
  const probe = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  const root0 = tmpl.clone(true); const bones0 = boneNames.map((n) => root0.getObjectByName(n));
  root0.add(probe); probe.bind(new THREE.Skeleton(bones0, boneInverses), bindMatrix);
  const mx0 = new THREE.AnimationMixer(root0); mx0.clipAction(clips.idle).play(); mx0.setTime(0); root0.updateMatrixWorld(true);
  let yMin = 1e9, yMax = -1e9; const vv = new THREE.Vector3(), P = geo.attributes.position;
  const pose = new Float32Array(P.count * 3); // vértices en pose de reposo (unidades del modelo), para medir suelo y ajustar las esferas de impacto
  for (let i = 0; i < P.count; i++) { probe.getVertexPosition(i, vv); vv.applyMatrix4(probe.matrixWorld); pose[i * 3] = vv.x; pose[i * 3 + 1] = vv.y; pose[i * 3 + 2] = vv.z; yMin = Math.min(yMin, vv.y); yMax = Math.max(yMax, vv.y); }
  // poses de muestra (reposo, marcha y carrera en varios instantes): las esferas de impacto deben cubrir el cuerpo en movimiento, no solo el primer fotograma
  const poses = [pose];
  if (g.hit) {
    for (const k of ['idle', 'walk', 'run']) {
      const clip = clips[k]; if (!clip) continue;
      mx0.stopAllAction(); const ac = mx0.clipAction(clip); ac.play();
      const nM = k === 'idle' ? 6 : 8;
      for (let j = 0; j < nM; j++) {
        mx0.setTime((clip.duration * j) / nM); root0.updateMatrixWorld(true);
        const arr = new Float32Array(P.count * 3);
        for (let i = 0; i < P.count; i++) { probe.getVertexPosition(i, vv); vv.applyMatrix4(probe.matrixWorld); arr[i * 3] = vv.x; arr[i * 3 + 1] = vv.y; arr[i * 3 + 2] = vv.z; }
        poses.push(arr);
      }
    }
  }
  mx0.stopAllAction(); mx0.uncacheRoot(root0); probe.removeFromParent();

  // ejes de las capas aditivas, derivados de la pose de reposo (el eje X/Y del mundo expresado en el marco de cada hueso)
  const rootRef = tmpl.clone(true), mxRef = new THREE.AnimationMixer(rootRef); mxRef.clipAction(clips.idle).play(); mxRef.setTime(0); rootRef.updateMatrixWorld(true);
  const buscar = (n) => { const t = norm(n); return rootRef.getObjectByName(boneNames.find((b) => norm(b) === t) ?? n); };
  const q = new THREE.Quaternion();
  const eje = (hueso, mundo) => { const b = buscar(hueso); if (!b) return null; b.getWorldQuaternion(q); return mundo.clone().applyQuaternion(q.invert()); };
  const nombreReal = (n) => boneNames.find((b) => norm(b) === norm(n)) ?? null;
  const h = g.huesos ?? {};
  const cuello = (h.cuello ?? []).map(nombreReal).filter(Boolean), cabeza = h.cabeza ? nombreReal(h.cabeza) : null;
  const torso = (h.torso ?? []).map(nombreReal).filter(Boolean);
  const cadena = [...cuello.map((n) => ({ n, f: (g.capas?.cuello ?? 0.55) / Math.max(1, cuello.length) })), ...(cabeza ? [{ n: cabeza, f: g.capas?.cabeza ?? 0.35 }] : [])];
  const ejes = { pitch: Object.fromEntries(cadena.map((c) => [c.n, eje(c.n, AX)])), yaw: Object.fromEntries(cadena.map((c) => [c.n, eje(c.n, AY)])), torso: Object.fromEntries(torso.map((n) => [n, eje(n, AX)])) };
  mxRef.stopAllAction(); mxRef.uncacheRoot(rootRef);

  const dur = 1, track = (n, a, ang) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, dur], [...(q.setFromAxisAngle(a, ang).toArray()), ...q.toArray()]);
  const capa = (nombre, pares) => new THREE.AnimationClip(nombre, dur, pares.map(([n, a, ang]) => track(n, a, ang)));
  const aditivos = {
    baja: capa('baja', cadena.filter((c) => ejes.pitch[c.n]).map((c) => [c.n, ejes.pitch[c.n], c.f * (g.capas?.baja ?? 1.6)])),
    sube: capa('sube', cadena.filter((c) => ejes.pitch[c.n]).map((c) => [c.n, ejes.pitch[c.n], -c.f * (g.capas?.sube ?? 1.1)])),
    izq: capa('izq', cadena.filter((c) => ejes.yaw[c.n]).map((c) => [c.n, ejes.yaw[c.n], c.f * (g.capas?.giro ?? 1.0)])),
    der: capa('der', cadena.filter((c) => ejes.yaw[c.n]).map((c) => [c.n, ejes.yaw[c.n], -c.f * (g.capas?.giro ?? 1.0)])),
    golpe: capa('golpe', [...torso.filter((n) => ejes.torso[n]).map((n) => [n, ejes.torso[n], -0.1 / torso.length]), ...cadena.filter((c) => ejes.pitch[c.n]).map((c) => [c.n, ejes.pitch[c.n], -c.f * 0.35])]),
  };

  const hit = g.hit ? ajustarHit(g.hit, geo, poses, boneNames, g.escala, -yMin) : null;
  const altura = yMax - yMin;
  const data = { sp, geo, boneNames, boneInverses, bindMatrix, tmpl, clips, aditivos, escala: g.escala, suelo: -yMin, altura, nombreReal, hit };
  const pies = (h.pies ?? []).map(nombreReal).filter(Boolean);
  data.pies = pies;
  data.vref = {};
  for (const k of ['walk', 'run']) if (clips[k]) data.vref[k] = medirZancada(data, tmpl, clips[k], pies, g.escala) ?? (k === 'walk' ? 3 : 8);
  data.reloj = { walk: clips.walk.duration, run: clips.run?.duration ?? 1 };
  data.zanc = {};
  for (const k of ['walk', 'run']) if (clips[k]) { const z = g.zancada === false ? null : perfilZancada(data, tmpl, clips[k], pies); if (z) data.zanc[k] = z; }
  if (hit?.length) { sp.hitProcedural = sp.hit; sp.hit = hit; } // la caja de impactos pasa a ser la del modelo (se restituye solo si el GLB no carga)
  data.stats = { triangulos: geo.attributes.position.count / 3, vertices: M.pos.length / 3, zonas: M.zonas, huesos: boneNames.length, clips: gltf.animations.map((a) => a.name), vref: data.vref, zancada: Object.fromEntries(Object.entries(data.zanc).map(([k, z]) => [k, +(z.S * g.escala).toFixed(2)])), suelo: data.suelo };
  return data;
}

/** Carga los GLB de todas las especies que los declaran. Las que fallan se anotan en `errores` y siguen usando su malla procedural. */
export async function cargarVisuales(especies, errores = {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = new Map();
  await Promise.all(especies.filter((s) => s.glb).map(async (sp) => {
    try { out.set(sp.id, await prepararEspecie(sp, loader)); } catch (e) { errores[sp.id] = String(e?.message ?? e); console.warn(`[fauna] ${sp.id}: modelo GLB no disponible, se usa la malla procedural —`, e?.message ?? e); }
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------- ejemplar
/** Tiempo del clip (s) para una fracción de zancada u (cualquier real): inversa de la tabla acumulada de perfilZancada. */
function tiempoClip(z, u) {
  const f = u - Math.floor(u), { cum, N, dur } = z;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= f) lo = m; else hi = m; }
  const d = cum[hi] - cum[lo];
  return ((lo + (d > 1e-9 ? (f - cum[lo]) / d : 0)) / N) * dur;
}

export class VisualGLB {
  constructor(data, material) {
    this.data = data; const sp = data.sp;
    this.root = new THREE.Group();
    const arm = data.tmpl.clone(true);
    this.huesos = data.boneNames.map((n) => arm.getObjectByName(n));
    this.mesh = new THREE.SkinnedMesh(data.geo, material);
    this.root.add(arm); this.root.add(this.mesh);
    this.mesh.boundingSphere = data.geo.boundingSphere.clone(); // el culling no depende de la pose del primer fotograma
    this.mesh.bind(new THREE.Skeleton(this.huesos, data.boneInverses), data.bindMatrix);
    this.root.scale.setScalar(data.escala); this.root.position.y = data.suelo * data.escala;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mixer = new THREE.AnimationMixer(arm);
    this.act = {}; this.peso = {};
    for (const k of Object.keys(data.clips)) { const a = this.mixer.clipAction(data.clips[k]); a.play(); a.setEffectiveWeight(0); this.act[k] = a; this.peso[k] = 0; }
    this.act.death?.setLoop(THREE.LoopOnce, 1); if (this.act.death) this.act.death.clampWhenFinished = true;
    for (const k of Object.keys(this.act)) if (k !== 'death') this.act[k].time = Math.random() * data.clips[k].duration;
    this.add = {}; this.pesoAdd = {};
    for (const [k, clip] of Object.entries(data.aditivos)) { const a = this.mixer.clipAction(clip); a.blendMode = THREE.AdditiveAnimationBlendMode; a.play(); a.setEffectiveWeight(0); this.add[k] = a; this.pesoAdd[k] = 0; }
    this.peso.idle = 1; this.act.idle.setEffectiveWeight(1);
    this.muerto = false; this.estado = 'idle'; this.umbral = 0; this.dist = Math.random() * 50; // metros recorridos (reloj de zancada); inicio aleatorio para que un rebaño no marche al unísono
    this.pies = data.pies.map((n) => ({ nombre: n, bone: arm.getObjectByName(n), wx: null, wz: null, ik: { lift: 0, dz: 0 } }));
    void sp;
    this._v = new THREE.Vector3();
  }

  /** Elige y mezcla el clip de locomoción según la velocidad real de la criatura y aplica las capas aditivas. */
  actualizar(c, dt) {
    const d = this.data, sp = d.sp, esc = d.escala;
    if (c.muerta) { this.morir(dt); return; }
    // --- locomoción
    const v = c.speed, mitad = (sp.vel.walk + sp.vel.run) * 0.5;
    const umbral = this.estado === 'run' ? mitad - 0.5 : mitad + 0.5;
    const giro = Math.abs(c.giroVis ?? 0);
    let obj = v < 0.12 ? 'idle' : (v < umbral || !d.clips.run) ? 'walk' : 'run';
    let ts = 1, giraSola = false;
    if (obj === 'idle' && giro > 0.35 && !c.override?.hold) { obj = 'walk'; ts = clamp(giro * 0.55, 0.4, 1.1); giraSola = true; } // gira sobre sí mismo "pisando" con el clip de caminar
    else if (obj === 'walk') ts = clamp(v / (d.vref.walk * esc), 0.3, 2.2);
    else if (obj === 'run') ts = clamp(v / (d.vref.run * esc), 0.5, 2.0);
    this.estado = obj;
    // reloj por DISTANCIA (zancada deformada): los clips de caminar/correr se evalúan según los metros recorridos, no según el tiempo
    const zz = d.zanc[obj];
    if (zz && (obj === 'walk' || obj === 'run')) {
      const vNom = (zz.S * esc) / zz.dur;                        // m/s a los que el clip original (ritmo 1) recorre una zancada
      const lim = obj === 'walk' ? [0.3, 2.2] : [0.5, 2.0];
      const r = giraSola ? ts : clamp(v / vNom, lim[0], lim[1]);  // limitado: a velocidades muy bajas/altas el ritmo se acota (ahí el pie sí resbala)
      this.dist += r * vNom * dt;
    }
    // --- mordisco: el clip de ataque sigue el avance real del mordisco de la IA (biteT 0→1)
    const atacando = c.biteT >= 0 && !!d.clips.attack;
    const k = Math.min(1, dt * 7);
    for (const n of ['idle', 'walk', 'run']) {
      if (!this.act[n]) continue;
      const meta = atacando ? 0 : n === obj ? 1 : 0;
      this.peso[n] = lerp(this.peso[n], meta, k); this.act[n].setEffectiveWeight(this.peso[n]);
      const z = d.zanc[n];
      if (z && n !== 'idle') { this.act[n].timeScale = 0; this.act[n].time = tiempoClip(z, this.dist / (z.S * esc)); }
      else this.act[n].timeScale = n === obj ? ts : this.act[n].timeScale;
    }
    if (this.act.attack) {
      this.peso.attack = lerp(this.peso.attack, atacando ? 1 : 0, Math.min(1, dt * 10));
      this.act.attack.setEffectiveWeight(this.peso.attack); this.act.attack.timeScale = 0;
      if (atacando) this.act.attack.time = clamp(c.biteT, 0, 1) * d.clips.attack.duration * 0.999;
    }
    // --- capas aditivas: estado de ánimo de la IA → cabeza y cuello
    const up = Math.max((c.alertK ?? 0) * 0.5, c.callK ?? 0);
    const pastar = (c.grazeK ?? 0) * (0.9 + 0.1 * Math.sin(c.t * 3.1 + c.id));
    const P = pastar * 0.9 + (c.feedK ?? 0) * 0.5 + (c.crouchK ?? 0) * 0.25 + (c.lookPitch ?? 0) * 0.6 - up * 0.6;
    const Y = clamp(c.lookYaw ?? 0, -1, 1);
    const set = (n, w) => { this.pesoAdd[n] = lerp(this.pesoAdd[n], clamp(w, 0, 1), Math.min(1, dt * 10)); this.add[n].setEffectiveWeight(this.pesoAdd[n]); };
    set('baja', P / 0.9); set('sube', -P / 0.6); set('izq', Y); set('der', -Y); set('golpe', c.hit > 0 ? Math.sqrt(c.hit / 0.25) : 0);
    this.mixer.update(dt);
    // --- pies (para habilidades que dependen de ellos, p. ej. el pisoteo): posición mundial y altura sobre el terreno
    if (this.pies.length) {
      const w = c.ctx.world;
      for (const p of this.pies) { if (!p.bone) continue; p.bone.getWorldPosition(this._v); p.wx = this._v.x; p.wz = this._v.z; p.ik.lift = Math.max(0, this._v.y - w.getHeight(p.wx, p.wz) - 0.15); }
    }
  }

  morir(dt) {
    if (!this.muerto) {
      this.muerto = true;
      for (const k of Object.keys(this.act)) if (k !== 'death') this.act[k].setEffectiveWeight(0);
      for (const k of Object.keys(this.add)) this.add[k].setEffectiveWeight(0);
      const a = this.act.death;
      if (a) { a.reset(); a.setEffectiveWeight(1); a.timeScale = 1; a.play(); } else this.root.rotation.z = 1.45; // sin clip de muerte: se vuelca (nunca ocurre con el pack actual)
    }
    this.mixer.update(dt);
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot()); this.mesh.skeleton?.dispose?.(); }
}
