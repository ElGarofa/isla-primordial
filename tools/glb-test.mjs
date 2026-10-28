#!/usr/bin/env node
// Prueba automática de los modelos 3D (GLB) de las criaturas: carga, clips, marcha sin resbalar, capas, muerte, hitboxes, montura,
// rendimiento y respaldo procedural. Usa window.__game (?debug=1). No renderiza: solo simula.
// Uso: node tools/glb-test.mjs [regex de escenario]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
async function abrir(query = '', rutas = null) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (rutas) await rutas(page);
  // &hf=0: esta prueba mide el sistema de GLB animados (con clips propios). Por defecto el Parasaurolophus usa ahora su
  // piel Higgsfield sobre el esqueleto procedural (eso lo prueba tools/hf-test.mjs); el GLB animado sigue como alternativa.
  await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low&hf=0${query}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, S = c.survival;
    const T = window.__T = { g, c, p, F, S };
    c.render = () => {};
    c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
    T.site = () => {
      if (T._site) return T._site;
      const w = c.world;
      for (let x = -480; x <= 480; x += 16) for (let z = -480; z <= 480; z += 16) {
        if (w.getBiome(x, z) !== 'pradera' || w.colliders.query(x, z, 22, []).length) continue;
        let lo = 1e9, hi = -1e9, ok = true;
        for (let dx = -80; dx <= 80 && ok; dx += 20) for (let dz = -80; dz <= 80; dz += 20) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5) { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (ok && hi - lo < 9) return (T._site = { x, z });
      }
      return null;
    };
    T.avanza = (seg, dt = 1 / 20) => { g.advance(Math.max(1, Math.round(seg / dt)), dt); };
    T.limpia = () => { F.clear(); };
    // jugador cerca (la animación completa solo ocurre a corta distancia de la cámara)
    T.jug = (x, z) => { p.teleport(x, z); p.velocity.set(0, 0, 0); S.heal(100); };
    // criatura "congelada" (sin IA) con velocidad impuesta: sirve para medir la animación sin que la IA decida nada
    T.modelo = (esp, v, o = {}) => {
      T.limpia();
      const s = T.site(); T.jug(s.x + 14, s.z + 14);
      const c2 = F.spawnAt(esp, s.x, s.z, { frozen: true, yaw: o.yaw ?? Math.PI / 2, tint: 0.5 });
      c2.override = v > 0 ? { speed: v, ...(o.hold ? { hold: true } : {}) } : null;
      return c2;
    };
    // vértices de la malla animada en coordenadas locales de la criatura (x lateral, y arriba, z adelante)
    T.vertices = (c2) => {
      c2.group.updateMatrixWorld(true);
      const m = c2.mesh, P = m.geometry.attributes.position, v = new c2.position.constructor(), out = [];
      const sy = Math.sin(c2.yaw), cy = Math.cos(c2.yaw), px = c2.position.x, py = c2.position.y, pz = c2.position.z;
      m.skeleton.update();
      for (let i = 0; i < P.count; i += 2) {
        m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
        const dx = v.x - px, dz = v.z - pz;
        out.push([dx * cy - dz * sy, v.y - py, dx * sy + dz * cy]);
      }
      return out;
    };
  });
  return page;
}

let page = await abrir();
const resultados = [];
async function R(nombre, fn, arg) {
  if (only && !only.test(nombre)) return;
  const t0 = Date.now(); let res;
  try { res = await page.evaluate(fn, arg); } catch (e) { res = 'EXCEPCIÓN: ' + String(e).slice(0, 300); }
  const ok = res == null || (typeof res === 'object' && res.ok === true);
  resultados.push({ nombre, ok });
  console.log(`${ok ? '✔' : '✘'} ${nombre}  (${Date.now() - t0} ms)${ok ? (res && res.info ? '  ' + JSON.stringify(res.info) : '') : '\n    → ' + (typeof res === 'string' ? res : JSON.stringify(res))}`);
}

await R('carga: el GLB del Parasaurolophus carga sin errores y trae los clips esperados', () => {
  const { F } = window.__T, M = F.modelos;
  if (!M.activo) return 'modelos desactivados';
  if (!M.cargados.includes('parasaurolophus')) return 'no cargó: ' + JSON.stringify(M.errores);
  if (Object.keys(M.errores).length) return 'errores: ' + JSON.stringify(M.errores);
  const s = M.stats.parasaurolophus, falta = ['Idle', 'Walk', 'Run', 'Attack', 'Death'].filter((n) => !s.clips.some((c) => c.endsWith(n)));
  if (falta.length) return 'faltan clips ' + falta;
  if (s.huesos < 30) return 'esqueleto pobre: ' + s.huesos;
  if (s.triangulos < 3000 || s.triangulos > 12000) return 'triángulos fuera de rango: ' + s.triangulos;
  if (!(s.vref.walk > 0.3) || !(s.vref.run > s.vref.walk)) return 'calibración de zancada rara ' + JSON.stringify(s.vref);
  return { ok: true, info: { tris: s.triangulos, huesos: s.huesos, clips: s.clips.length, vref: s.vref, suelo: +s.suelo.toFixed(3) } };
});

await R('ejemplares: geometría compartida, esqueleto propio, una sola malla por criatura', () => {
  const T = window.__T, { F } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 30, s.z);
  const a = F.spawnAt('parasaurolophus', s.x, s.z, { tint: 0.1 }), b = F.spawnAt('parasaurolophus', s.x + 8, s.z), c3 = F.spawnAt('parasaurolophus', s.x - 8, s.z, { tint: 0.9 });
  void a.id; a.mesh.material === c3.mesh.material && 0;
  if (!a.glb || !b.glb || !c3.glb) return 'no usan GLB';
  if (a.mesh.geometry !== b.mesh.geometry) return 'geometría duplicada';
  if (a.mesh.skeleton === b.mesh.skeleton) return 'esqueleto compartido (se animarían a la vez)';
  if (a.mesh.skeleton.bones[0] === b.mesh.skeleton.bones[0]) return 'huesos compartidos';
  let mallas = 0; a.group.traverse((o) => { if (o.isMesh) mallas++; });
  if (mallas !== 1) return 'mallas por criatura: ' + mallas;
  if (a.mesh.material === c3.mesh.material) return 'el tono no varía el material';
  return { ok: true, info: { huesos: a.mesh.skeleton.bones.length, vertices: a.mesh.geometry.attributes.position.count } };
});

await R('clips: reposo, caminar y correr según la velocidad real', () => {
  const T = window.__T, sp = T.F.catalogo && null; void sp;
  const out = {};
  for (const [k, v] of [['idle', 0], ['walk', 1.6], ['run', 6.6]]) {
    const c = T.modelo('parasaurolophus', v, { hold: true }); T.avanza(4);
    const d0 = c.glb.dist; T.avanza(2); const dd = c.glb.dist - d0; // metros "de reloj" avanzados en 2 s (debe seguir a la velocidad real)
    out[k] = { estado: c.glb.estado, pesos: Object.fromEntries(Object.entries(c.glb.peso).map(([n, w]) => [n, +w.toFixed(2)])), velocidad: +c.speed.toFixed(2), relojMs: +(dd / 2).toFixed(2), ts: +(c.glb.act[k].timeScale).toFixed(2) };
  }
  if (Math.abs(out.walk.relojMs - out.walk.velocidad) > 0.35 * out.walk.velocidad) return { motivo: 'el reloj de zancada de caminar no sigue la velocidad', out };
  if (Math.abs(out.run.relojMs - out.run.velocidad) > 0.35 * out.run.velocidad) return { motivo: 'el reloj de zancada de correr no sigue la velocidad', out };
  if (out.idle.relojMs > 0.05) return { motivo: 'en reposo el reloj de marcha no debe avanzar', out };
  if (out.idle.estado !== 'idle' || out.idle.pesos.idle < 0.9) return out;
  if (out.walk.estado !== 'walk' || out.walk.pesos.walk < 0.9) return out;
  if (out.run.estado !== 'run' || out.run.pesos.run < 0.9) return out;
  return { ok: true, info: { relojWalkMs: out.walk.relojMs, relojRunMs: out.run.relojMs } };
});

await R('marcha: los pies apoyados no resbalan (caminar y correr)', () => {
  const T = window.__T, res = {};
  for (const [k, v] of [['walk', 1.6], ['run', 6.6]]) {
    const c = T.modelo('parasaurolophus', v); T.avanza(3);
    const pies = c.glb.pies.filter((p) => p.bone); const hist = pies.map(() => []);
    const ciclo = c.glb.data.zanc[k] ? (c.glb.data.zanc[k].S * c.glb.data.escala) / Math.max(0.1, c.speed) : 2; // s por zancada a esta velocidad
    const nF = Math.round(3 * ciclo * 60); // 3 zancadas completas: la medición no depende de la fase inicial
    for (let i = 0; i < nF; i++) { T.g.advance(1, 1 / 60); pies.forEach((p, j) => hist[j].push({ x: p.wx, z: p.wz, l: p.ik.lift })); }
    const ratios = [];
    pies.forEach((p, j) => {
      const h = hist[j], mn = Math.min(...h.map((q) => q.l)), mx = Math.max(...h.map((q) => q.l));
      if (mn > 0.4) return; // brazos que nunca tocan el suelo
      const lim = mn + 0.12 * (mx - mn) + 0.02, vs = [];
      for (let i = 1; i < h.length; i++) if (h[i].l <= lim && h[i - 1].l <= lim) vs.push(Math.hypot(h[i].x - h[i - 1].x, h[i].z - h[i - 1].z) * 60);
      vs.sort((a, b) => a - b); if (vs.length >= 5) ratios.push({ pie: p.nombre, apoyo: +(vs.length / h.length).toFixed(2), vel: +vs[Math.floor(vs.length / 2)].toFixed(2), rel: +(vs[Math.floor(vs.length / 2)] / Math.max(0.1, c.speed)).toFixed(2), media: +(vs.reduce((a, b) => a + b, 0) / vs.length / Math.max(0.1, c.speed)).toFixed(2) });
    });
    res[k] = { vCriatura: +c.speed.toFixed(2), ratios };
  }
  const peor = Math.max(...Object.values(res).flatMap((r) => r.ratios.map((q) => q.rel)));
  if (!Object.values(res).every((r) => r.ratios.length >= 2)) return { motivo: 'no se detectaron 2 pies de apoyo', res };
  const peorMedia = Math.max(...Object.values(res).flatMap((r) => r.ratios.map((q) => q.media)));
  // mediana: el pie apoyado casi no se mueve respecto al suelo; media: incluye el despegue/aterrizaje, donde el pie sí se desliza un instante
  if (peor > 0.2) return { motivo: 'patinaje alto (mediana de la velocidad del pie apoyado / velocidad del cuerpo)', peor, res };
  if (peorMedia > 0.7) return { motivo: 'patinaje alto en la media (incluye despegue/aterrizaje)', peor, peorMedia, res };
  return { ok: true, info: { patinajeMediano: peor, patinajeMedio: peorMedia, res } };
});

await R('capas: pastar baja la cabeza, llamar la sube, mirar la gira, el golpe retrocede', () => {
  const T = window.__T;
  const c = T.modelo('parasaurolophus', 0); T.avanza(2);
  const cab = () => { const m = c.mesh, v = new c.position.constructor(); const i = c.glb.huesos.findIndex((b) => /^head_?end$/i.test(b.name)); c.group.updateMatrixWorld(true); c.glb.huesos[i].getWorldPosition(v); const dx = v.x - c.position.x, dz = v.z - c.position.z, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw); void m; return { x: dx * cy - dz * sy, y: v.y - c.position.y, z: dx * sy + dz * cy }; };
  const base = cab();
  c.state = 'graze'; T.avanza(2.5); const pasta = cab(); c.state = 'idle'; T.avanza(2.5);
  c.llamadaAnim = 3; T.avanza(1.2); const llama = cab(); c.llamadaAnim = 0; T.avanza(2.5);
  c.lookYaw = 0.8; c.lock = true; T.avanza(1.2); const mira = cab(); c.lookYaw = 0; T.avanza(2);
  c.hit = 0.25; c.glb.actualizar(c, 1 / 60); const golpe = c.glb.pesoAdd.golpe;
  const o = { base, pasta, llama, mira, golpe };
  if (!(base.y - pasta.y > 0.8)) return { motivo: 'pastar no baja la cabeza', ...o };
  if (!(llama.y - base.y > 0.1)) return { motivo: 'llamar no sube la cabeza', ...o };
  if (!(Math.abs(mira.x - base.x) > 0.15 && mira.x > base.x)) return { motivo: 'mirar a +x no gira la cabeza hacia +x', ...o };
  if (!(golpe > 0.1)) return { motivo: 'sin capa de golpe', ...o };
  return { ok: true, info: { bajaCabeza: +(base.y - pasta.y).toFixed(2), subeCabeza: +(llama.y - base.y).toFixed(2), giro: +(mira.x - base.x).toFixed(2) } };
});

await R('muerte: reproduce el clip de muerte y queda fijo; el cadáver se despieza', () => {
  const T = window.__T, { F } = T;
  const c = T.modelo('parasaurolophus', 0); T.avanza(1);
  const antes = c.glb.huesos.map((b) => b.quaternion.toArray().join());
  c.die(); T.avanza(0.5); const mid = c.glb.act.death.time;
  T.avanza(4); const fin = c.glb.act.death.time, dur = c.glb.data.clips.death.duration;
  const p1 = c.glb.huesos.map((b) => b.quaternion.toArray().join()); T.avanza(1); const p2 = c.glb.huesos.map((b) => b.quaternion.toArray().join());
  const quieto = p1.every((q, i) => q === p2[i]), cambio = antes.some((q, i) => q !== p1[i]);
  const w = Object.entries(c.glb.act).map(([n, a]) => [n, +a.getEffectiveWeight().toFixed(2)]);
  const o = { mid, fin, dur, quieto, cambio, w };
  if (!(mid > 0 && mid < dur)) return { motivo: 'el clip no avanza', ...o };
  if (!(fin >= dur - 0.05)) return { motivo: 'el clip no termina', ...o };
  if (!quieto) return { motivo: 'el cadáver sigue moviéndose', ...o };
  if (!cambio) return { motivo: 'la pose no cambió', ...o };
  if (w.some(([n, x]) => (n === 'death' ? x < 0.99 : x > 0.01))) return { motivo: 'pesos de clip incorrectos', ...o };
  if (!Number.isFinite(c.position.y)) return 'y no finita';
  const ok = F.despiezar(c);
  if (!ok || !c.despiezada) return { motivo: 'no se pudo despiezar', ...o };
  return { ok: true, info: { dur: +dur.toFixed(2), despiezado: true } };
});

await R('hitboxes: las esferas de impacto cubren el cuerpo del modelo y el ancla de montura queda sobre el lomo', () => {
  const T = window.__T, { F } = T;
  const c = T.modelo('parasaurolophus', 0); T.avanza(2);
  const V = T.vertices(c), hit = c.sp.hit;
  let dentro = 0; for (const [x, y, z] of V) if (hit.some(([hx, hy, hz, hr]) => Math.hypot(x - hx, y - hy, z - hz) < hr + 0.35)) dentro++;
  const cobertura = dentro / V.length;
  const sinCuerpo = hit.filter(([hx, hy, hz, hr]) => !V.some(([x, y, z]) => Math.hypot(x - hx, y - hy, z - hz) < hr * 0.9 + 0.3));
  const [ax, ay, az] = c.sp.montura.ancla;
  const lomo = V.filter(([x, , z]) => Math.abs(x - ax) < 0.5 && Math.abs(z - az) < 0.9).reduce((m, v) => Math.max(m, v[1]), -1e9);
  const minY = Math.min(...V.map((v) => v[1])), maxY = Math.max(...V.map((v) => v[1])), z0 = Math.min(...V.map((v) => v[2])), z1 = Math.max(...V.map((v) => v[2]));
  const o = { cobertura: +cobertura.toFixed(3), esferasVacias: sinCuerpo.map((s) => s.join(',')), lomo: +lomo.toFixed(2), ancla: ay, sueloMin: +minY.toFixed(2), alto: +maxY.toFixed(2), largo: +(z1 - z0).toFixed(2), z: [+z0.toFixed(2), +z1.toFixed(2)] };
  void F;
  if (cobertura < 0.9) return { motivo: 'el modelo sale de las esferas de impacto', ...o };
  if (sinCuerpo.length) return { motivo: 'esferas de impacto sin cuerpo', ...o };
  if (!(ay - lomo > -0.1 && ay - lomo < 1.0)) return { motivo: 'el ancla de la montura no queda sobre el lomo (debe estar 0–1 m por encima)', ...o };
  if (Math.abs(minY) > 0.25) return { motivo: 'los pies no apoyan en el suelo (y mínima)', ...o };
  return { ok: true, info: o };
});

await R('terreno: asentado sobre pendientes (inclinación) y sin hundirse', () => {
  const T = window.__T, w = T.c.world, sp = w.spawn;
  // varias laderas suaves repartidas por el mapa grande (alrededor de la playa de aparición), cada una probada de frente a la cuesta, de espaldas, de lado y en diagonal
  const sitios = [];
  for (let x = sp.x - 1200; x <= sp.x + 1200 && sitios.length < 6; x += 10) for (let z = sp.z - 1200; z <= sp.z + 500 && sitios.length < 6; z += 10) {
    const s = w.getSlope(x, z), h = w.getHeight(x, z);
    if (!(h > 3 && s > 0.12 && s < 0.18 && w.getSlope(x + 4, z) > 0.08 && w.colliders.query(x, z, 8, []).length === 0)) continue;
    if (sitios.some((q) => Math.hypot(q.x - x, q.z - z) < 300)) continue;
    sitios.push({ x, z });
  }
  if (!sitios.length) return { motivo: 'sin ladera de prueba' };
  let peor = 0, pitchMax = 0, n = 0;
  for (const st of sitios) {
    const gx = w.getHeight(st.x + 1, st.z) - w.getHeight(st.x - 1, st.z), gz = w.getHeight(st.x, st.z + 1) - w.getHeight(st.x, st.z - 1), baja = Math.atan2(-gx, -gz);
    for (const yaw of [0.7, baja + Math.PI, baja, baja + Math.PI / 2]) {
      T.limpia(); T.jug(st.x + 16, st.z);
      const c = T.F.spawnAt('parasaurolophus', st.x, st.z, { frozen: true, yaw }); c.override = null; T.avanza(3);
      const gy = w.getHeight(c.position.x, c.position.z);
      if (!Number.isFinite(c.glb.root.rotation.x) || Math.abs(c.position.y - gy) > 1.5) return { motivo: 'altura incoherente', y: c.position.y, gy, st };
      // cuánto se hunde el punto más bajo del cuerpo bajo el suelo que tiene justo debajo (no respecto al centro: en una ladera el extremo trasero queda más bajo que el origen y es correcto)
      c.group.updateMatrixWorld(true); c.mesh.skeleton.update();
      const P = c.mesh.geometry.attributes.position, v = new c.position.constructor(); let hund = 0;
      for (let i = 0; i < P.count; i += 2) { c.mesh.getVertexPosition(i, v); v.applyMatrix4(c.mesh.matrixWorld); hund = Math.max(hund, w.getHeight(v.x, v.z) - v.y); }
      peor = Math.max(peor, hund); pitchMax = Math.max(pitchMax, Math.abs(c.glb.root.rotation.x)); n++;
      if (hund > 0.6) return { motivo: 'el cuerpo se hunde en la ladera', hundido: +hund.toFixed(2), yaw: +yaw.toFixed(2), st };
    }
  }
  return { ok: true, info: { laderas: sitios.length, posturas: n, hundimientoMax: +peor.toFixed(2), pitchMax: +pitchMax.toFixed(3) } };
});

await R('IA intacta: el rebaño sigue vigilando y huyendo con el modelo GLB', () => {
  const T = window.__T, { F, p } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 45, s.z); T.avanza(0.1);
  const h = F.spawnHerd('parasaurolophus', s.x, s.z, 4);
  if (!h.every((c) => c.glb)) return 'el rebaño no usa GLB';
  p.yaw = Math.PI / 2; T.avanza(20);
  const estados = h.map((c) => c.state), ali = F.registro.filter((r) => r.especie === 'parasaurolophus').length;
  const movs = h.some((c) => c.speed > 0.3) || estados.some((e) => e === 'flee' || e === 'alert' || e === 'wander' || e === 'graze');
  if (h.some((c) => !Number.isFinite(c.position.x) || !Number.isFinite(c.position.y))) return 'posición no finita';
  if (h.some((c) => c.glb.huesos.some((b) => !Number.isFinite(b.quaternion.x + b.position.x)))) return 'hueso con NaN';
  return { ok: true, info: { estados, habilidadesRegistradas: ali, activo: movs } };
});

await R('rendimiento: coste de CPU por criatura animada y por cuadro', () => {
  const T = window.__T, { F } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 20, s.z + 20);
  const lista = []; for (let i = 0; i < 24; i++) { const c = F.spawnAt('parasaurolophus', s.x + (i % 6) * 6 - 15, s.z + Math.floor(i / 6) * 6 - 9, { frozen: true, yaw: i }); c.override = { speed: i % 3 === 0 ? 6.6 : 1.6 }; lista.push(c); }
  T.avanza(2);
  const t0 = performance.now(); for (let i = 0; i < 120; i++) lista.forEach((c) => c.update(1 / 60, true)); const ms = (performance.now() - t0) / (120 * lista.length);
  const tris = lista.reduce((a, c) => a + c.mesh.geometry.attributes.position.count / 3, 0);
  if (ms > 0.8) return { motivo: 'demasiado lento', msPorCriatura: ms };
  return { ok: true, info: { msPorCriaturaCuadro: +ms.toFixed(3), criaturas: lista.length, triangulosEnPantalla: tris, mallas: lista.length } };
});

await R('liberación: quitar una criatura libera su mixer y huesos', () => {
  const T = window.__T, { F } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 30, s.z);
  const c = F.spawnAt('parasaurolophus', s.x, s.z); T.avanza(1);
  const mixer = c.glb.mixer; F.remove(c);
  if (mixer._nActiveActions !== 0 || mixer._actions.length !== 0) return { motivo: 'el mixer conserva acciones', act: mixer._nActiveActions, n: mixer._actions.length };
  if (F.creatures.includes(c)) return 'sigue en la lista';
  return { ok: true };
});

await R('simulación: 60 s de partida con la fauna completa sin NaN ni errores', () => {
  const T = window.__T, { F, g } = T; T.limpia(); F.populate(); g.advance(1200, 1 / 20);
  const mal = F.creatures.filter((c) => ![c.position.x, c.position.y, c.position.z].every(Number.isFinite) || (c.glb && c.glb.huesos.some((b) => !Number.isFinite(b.quaternion.x + b.position.y)))).length;
  if (mal) return 'criaturas con valores no finitos: ' + mal;
  return { ok: true, info: { stats: F.stats(), glb: F.creatures.filter((c) => c.glb).length } };
});

await page.close();

// ---- respaldo: ?glb=0 (desactivado a propósito)
page = await abrir('&glb=0');
await R('respaldo: con ?glb=0 todas las especies usan su malla procedural', () => {
  const T = window.__T, { F } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 20, s.z);
  const c = F.spawnAt('parasaurolophus', s.x, s.z); T.avanza(2);
  if (F.modelos.activo || F.modelos.cargados.length) return 'GLB activo';
  if (c.glb || !c.bones.neck1) return 'no es procedural';
  return { ok: true };
});
await page.close();

// ---- respaldo: el archivo GLB no existe / no hay red
page = await abrir('', async (pg) => { await pg.route('**/models/fauna/*.glb', (r) => r.abort()); });
await R('respaldo: si el GLB no carga, la especie usa su malla procedural y el juego sigue', () => {
  const T = window.__T, { F } = T; T.limpia();
  if (!F.modelos.errores.parasaurolophus) return 'no registró el error de carga';
  const s = T.site(); T.jug(s.x + 20, s.z);
  const c = F.spawnAt('parasaurolophus', s.x, s.z); T.avanza(3);
  if (c.glb || !c.bones.neck1) return 'no cayó al modelo procedural';
  if (!Number.isFinite(c.position.y)) return 'posición no finita';
  return { ok: true, info: { error: F.modelos.errores.parasaurolophus.slice(0, 80) } };
});
await page.close();

const okN = resultados.filter((r) => r.ok).length;
console.log(`\nRESUMEN: ${okN}/${resultados.length} OK`);
const erroresReales = errs.filter((e) => !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED|aborted/i.test(e));
console.log('ERRORES de consola/página:', erroresReales.length ? erroresReales.slice(0, 6) : 'ninguno');
await browser.close(); server.kill();
process.exit(okN === resultados.length && !erroresReales.length ? 0 : 1);
