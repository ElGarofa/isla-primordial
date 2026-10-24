#!/usr/bin/env node
// Prueba automática de IA / habilidades de fauna (Etapa 1). Usa window.__game (?debug=1). No renderiza: solo simula.
// Uso: node tools/ai-test.mjs [regex de escenario]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const port = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { } await new Promise(r => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low`);
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });

// ---- utilidades dentro de la página
await page.evaluate(() => {
  const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, S = c.survival;
  const T = window.__T = { log: { alerta: [], skill: [], dano: [], roar: [], shake: 0 } };
  c.events.on('fauna:alerta', (a) => T.log.alerta.push({ ...a, t: c.time.elapsed }));
  c.events.on('creature:skill', (a) => T.log.skill.push({ id: a.id, especie: a.especie, c: a.criatura, t: c.time.elapsed }));
  c.events.on('player:damage', (a) => T.log.dano.push({ n: a.cantidad ?? 0, t: c.time.elapsed }));
  c.events.on('creature:roar', (a) => T.log.roar.push({ especie: a.especie, llamada: !!a.llamada, t: c.time.elapsed }));
  c.events.on('camera:shake', () => T.log.shake++);
  T.reset = () => { T.log.alerta.length = 0; T.log.skill.length = 0; T.log.dano.length = 0; T.log.roar.length = 0; T.log.shake = 0; F.registro.length = 0; };
  c.render = () => {}; // la prueba es de simulación: no renderizar (SwiftShader tarda segundos con lluvia)
  T.g = g; T.c = c; T.p = p; T.F = F; T.S = S;
  c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
  // lugar despejado: terreno firme y casi plano sin colisionadores en r=14, desde cx,cz
  T.site = () => {
    if (T._site) return T._site;
    const w = c.world, ocl = F.sentidos?.ocluir;
    for (let x = -480; x <= 480; x += 16) for (let z = -480; z <= 480; z += 16) {
      if (w.getBiome(x, z) !== 'pradera' || w.colliders.query(x, z, 22, []).length) continue;
      let lo = 1e9, hi = -1e9, ok = true;
      for (let dx = -80; dx <= 80 && ok; dx += 20) for (let dz = -80; dz <= 80; dz += 20) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5) { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (!ok || hi - lo > 9) continue;
      const h0 = w.getHeight(x, z);
      if (ocl && ocl(x, h0 + 2, z, x, h0 + 1.5, z + 75) < 0.8) continue;
      return (T._site = { x, z });
    }
    return null;
  };
  T.pon = (esp, x, z, o = {}) => F.spawnAt(esp, x, z, o);
  T.jug = (x, z, yaw = 0) => { p.teleport(x, z); p.yaw = yaw; p.velocity.set(0, 0, 0); p.crouching = false; p.sprinting = false; S.heal(100); };
  T.mira = (x, z, tx, tz) => { p.yaw = Math.atan2(-(tx - x), -(tz - z)); }; // yaw 0 = norte (-z)
  T.avanza = (seg, dt = 1 / 20) => { const n = Math.max(1, Math.round(seg / dt)); g.advance(n, dt); };
  T.sk = (id, esp) => T.log.skill.filter((s) => s.id === id && (!esp || s.especie === esp)).length;
  T.estado = (lista) => lista.map((o) => o.state);
  T.limpia = () => { F.clear(); T.reset(); };
});

const results = [];
const R = async (label, fn, check, arg) => {
  if (only && !only.test(label)) return;
  const t0 = Date.now();
  let r; try { r = await page.evaluate(fn, arg); } catch (e) { r = { error: String(e).slice(0, 300) }; }
  let ok = true, why = '';
  try { const v = check(r); ok = v === true; why = v === true ? '' : v; } catch (e) { ok = false; why = 'check: ' + e.message; }
  results.push({ label, ok });
  console.log(`${ok ? '✔' : '✘'} ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${ok ? '' : '→ ' + why}\n    ${JSON.stringify(r).slice(0, 700)}`);
};

// ---------------------------------------------------------------------------------- 0. integridad de datos
await R('datos: todas las habilidades completas y cada especie solo usa las suyas', () => {
  const T = window.__T, F = T.F;
  const ids = F.catalogo?.filas ?? null;
  const sp = {};
  for (const e of ['tyrannosaurus', 'raptor', 'compsognatus', 'gallimimus', 'parasaurolophus', 'stegosaurus', 'ankylosaurus', 'triceratops', 'braquiosaurio', 'pteranodon']) {
    const c = T.pon(e, 0, 0); if (!c) { sp[e] = 'sin spawn'; continue; } sp[e] = (c.hab ?? []).map((h) => h.id); F.creatures.splice(F.creatures.indexOf(c), 1); c.ctx.scene.remove(c.group);
  }
  return { sp, catalogo: ids ? { n: ids.length } : null };
}, (r) => {
  if (r.error) return r.error;
  const bad = Object.entries(r.sp).filter(([, v]) => typeof v === 'string');
  if (bad.length) return 'sin spawn: ' + bad.map((b) => b[0]);
  if (r.sp.parasaurolophus.includes('embestida') || r.sp.parasaurolophus.includes('rastreo_olor') || r.sp.parasaurolophus.includes('cola_defensiva')) return 'parasaurolophus con habilidades ajenas';
  if (!r.sp.parasaurolophus.includes('escaneo_vigia') || !r.sp.parasaurolophus.includes('llamada_alerta')) return 'parasaurolophus sin escaneo/llamada';
  if (!r.sp.tyrannosaurus.includes('rastreo_olor') || !r.sp.tyrannosaurus.includes('acecho') || r.sp.tyrannosaurus.includes('llamada_alerta')) return 'T. rex mal configurado';
  if (!r.sp.stegosaurus.includes('cola_defensiva') || !r.sp.ankylosaurus.includes('cola_defensiva')) return 'estegosaurio/anquilosaurio sin cola';
  if (!r.sp.triceratops.includes('embestida')) return 'triceratops sin embestida';
  return true;
});

// ---------------------------------------------------------------------------------- 1. Parasaurolophus: detecta, avisa a la manada
await R('parasaurolophus: vigía detecta al jugador (45 m, a la vista) y la manada reacciona', () => {
  const T = window.__T, F = T.F, c = T.c; T.limpia(); F.setGrace(0);
  const s = T.site(c.world.spawn.x, c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const herd = F.spawnHerd('parasaurolophus', s.x, s.z, 5);
  const px = s.x, pz = s.z + 45; T.jug(px, pz); T.mira(px, pz, s.x, s.z);
  let t = 0, primera = null; const reac = new Set();
  while (t < 45) { T.avanza(0.5); t += 0.5; T.S.heal(100); herd.forEach((o) => { if (o.state === 'alert' || o.state === 'flee') reac.add(o.id); }); if (!primera && T.log.alerta.length) primera = t; if (T.log.alerta.length && t > primera + 8) break; }
  const est = T.estado(herd);
  return { reaccionaron: reac.size, reg: F.registro.filter((x) => x.id === 'llamada_alerta').map((x) => ({ t: +x.t.toFixed(1), conf: x.conf, rec: x.receptores, falso: x.falso })), primera_alerta_s: primera, n_alertas: T.log.alerta.length, tipos: [...new Set(T.log.alerta.map((a) => a.tipo))], escaneos: T.sk('escaneo_vigia'), llamadas: T.sk('llamada_alerta'), estados: est, rumboOK: T.log.alerta[0] ? +T.log.alerta[0].rumbo.toFixed(0) : null, dist: T.log.alerta[0] ? +T.log.alerta[0].dist.toFixed(0) : null, conf: T.log.alerta[0] ? +T.log.alerta[0].conf.toFixed(2) : null };
}, (r) => {
  if (r.error) return r.error;
  if (r.primera_alerta_s == null) return 'nunca avisó';
  if (r.llamadas < 1) return 'sin llamada_alerta';
  const reac = r.reaccionaron ?? 0;
  if (reac < 3) return `solo ${reac}/5 reaccionaron`;
  return true;
});

await R('parasaurolophus: control negativo (150 m, agachado, quieto) → no detecta', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  F.spawnHerd('parasaurolophus', s.x, s.z, 4);
  T.jug(s.x, s.z + 150); T.mira(s.x, s.z + 150, s.x, s.z); T.p.crouching = true;
  T.avanza(30);
  return { alertas: T.log.alerta.filter((a) => a.tipo === 'jugador').length, llamadas: T.sk('llamada_alerta') };
}, (r) => r.error ? r.error : (r.alertas === 0 ? true : 'detectó a 150 m'));

await R('parasaurolophus: oído (corriendo a ~50 m de espaldas a la manada) también alerta', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  F.spawnHerd('parasaurolophus', s.x, s.z, 3);
  T.jug(s.x + 50, s.z + 20, 0); T.p.yaw = Math.PI; // de espaldas a la manada: avanza hacia +z (alejándose en tangente)
  T.c.input.keys.add('KeyW'); T.c.input.keys.add('ShiftLeft');
  let t = 0; while (t < 8) { T.avanza(0.5); t += 0.5; }
  T.c.input.keys.delete('KeyW'); T.c.input.keys.delete('ShiftLeft');
  return { alertas: T.log.alerta.length, tipos: [...new Set(T.log.alerta.map((a) => a.tipo))] };
}, (r) => r.error ? r.error : (r.alertas >= 1 ? true : 'no oyó al jugador corriendo'));

// ---------------------------------------------------------------------------------- 2. defensas: cola de estegosaurio y anquilosaurio
for (const esp of ['stegosaurus', 'ankylosaurus']) {
  await R(`${esp}: se defiende con la cola de un intruso detrás y le hace daño`, (esp) => {
    const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
    const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
    const d = T.pon(esp, s.x, s.z); d.yaw = 0; // yaw 0 → mira al norte (-z); cola hacia +z
    T.jug(s.x, s.z + 4.5, 0); T.mira(s.x, s.z + 4.5, s.x, s.z);
    let t = 0, v0 = 100, minV = 100;
    while (t < 25) { T.avanza(0.25); t += 0.25; minV = Math.min(minV, T.S.stats.vida); if (T.S.stats.vida < 40) T.S.heal(100); }
    return { estado: d.state, colas: T.sk('cola_defensiva', esp), danoTotal: +T.log.dano.reduce((a, b) => a + b.n, 0).toFixed(1), golpes: T.log.dano.length, minVida: +minV.toFixed(0), yaw: +d.yaw.toFixed(2) };
  }, (r) => r.error ? r.error : (r.colas >= 1 ? true : 'nunca usó la cola'), esp);
}

// ---------------------------------------------------------------------------------- 3. ceratopsido
await R('triceratops: manada protege → formación / intimidación / embestida ante un depredador', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const tri = F.spawnHerd('triceratops', s.x, s.z, 3, 7);
  const rex = T.pon('tyrannosaurus', s.x + 6, s.z + 45); rex.hambre = 1;
  T.jug(s.x + 60, s.z - 40, 0);
  let t = 0; while (t < 40) { T.avanza(0.5); t += 0.5; if (T.sk('embestida') + T.sk('formacion_defensiva') > 1 && t > 12) break; }
  return { formaciones: T.sk('formacion_defensiva'), embestidas: T.sk('embestida'), intim: T.sk('postura_intimidacion'), rex: { estado: rex.state, hp: +rex.hp.toFixed(0) }, tri: T.estado(tri), tri_hp: tri.map((o) => +o.hp.toFixed(0)) };
}, (r) => r.error ? r.error : (r.formaciones + r.embestidas + r.intim >= 1 ? true : 'sin ninguna respuesta defensiva'));

// ---------------------------------------------------------------------------------- 4. depredador mayor
await R('T. rex: caza presa (acecho → persecución), no es omnisciente', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const rex = T.pon('tyrannosaurus', s.x, s.z); rex.hambre = 0.95; rex.yaw = Math.atan2(50, 10);
  const g = F.spawnHerd('gallimimus', s.x + 50, s.z + 10, 3, 5);
  T.jug(s.x - 150, s.z - 170, 0); T.p.crouching = true; // jugador lejos pero dentro de la zona activa
  const estados = new Set(); let t = 0, minDist = 1e9;
  while (t < 60) { T.avanza(0.5); t += 0.5; estados.add(rex.state); for (const o of g) minDist = Math.min(minDist, Math.hypot(o.position.x - rex.position.x, o.position.z - rex.position.z)); if (g.some((o) => o.muerta)) break; }
  return { estados: [...estados], acecho: T.sk('acecho'), emboscada: T.sk('emboscada'), esprint: T.sk('esprint_zigzag'), abandono: T.sk('abandonar_caza'), t: t, muertas: g.filter((o) => o.muerta).length, minDist: +minDist.toFixed(0), hambre: +rex.hambre.toFixed(2), energia: +rex.energia.toFixed(2) };
}, (r) => r.error ? r.error : (r.estados.some((e) => e === 'stalk' || e === 'chase') ? true : 'ni acechó ni persiguió: ' + r.estados));

await R('T. rex: persigue al jugador, muerde y el jugador pierde vida', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const rex = T.pon('tyrannosaurus', s.x, s.z); rex.hambre = 0.9;
  T.jug(s.x, s.z + 35, 0); T.mira(s.x, s.z + 35, s.x, s.z);
  const estados = new Set(); let t = 0;
  while (t < 30) { T.avanza(0.25); t += 0.25; estados.add(rex.state); if (T.log.dano.length) break; }
  return { estados: [...estados], t, danos: T.log.dano.map((d) => +d.n.toFixed(0)), sacudidas: T.log.shake, rugidos: T.log.roar.length };
}, (r) => r.error ? r.error : (r.danos.length ? true : 'no llegó a morder en 30 s'));

await R('T. rex: pierde al jugador oculto y rastrea sus huellas (rastreo_olor) o abandona', () => {
  const T = window.__T, F = T.F, p = T.p; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const rex = T.pon('tyrannosaurus', s.x, s.z); rex.hambre = 0.9;
  T.jug(s.x, s.z + 30, 0); T.mira(s.x, s.z + 30, s.x, s.z);
  // 1) el rex empieza a perseguir
  let t = 0; while (t < 20 && rex.state !== 'chase') { T.avanza(0.25); t += 0.25; }
  const inicio = rex.state;
  // 2) el jugador "huye" 150 m dejando huellas cada 4 m y se agacha quieto
  const x0 = p.position.x, z0 = p.position.z; const tl = []; let ult = '';
  const marca = (tag) => { if (rex.state !== ult) { ult = rex.state; tl.push(`${tag}:${rex.state}@${+(T.c.time.elapsed % 1000).toFixed(0)}`); } };
  for (let i = 1; i <= 38; i++) { p.teleport(x0, z0 + i * 4); T.S.heal(100); rex.energia = 1; T.avanza(0.2); marca('huida'); }
  p.velocity.set(0, 0, 0); p.sprinting = false; p.crouching = true;
  const estados = new Set(); let t2 = 0, minD = 1e9; while (t2 < 70) { T.avanza(0.5); t2 += 0.5; estados.add(rex.state); marca('busca'); T.S.heal(100); minD = Math.min(minD, Math.hypot(p.position.x - rex.position.x, p.position.z - rex.position.z)); }
  return { inicio, tl, estados: [...estados], rastreos: T.sk('rastreo_olor'), minDist: +minD.toFixed(0), distFinal: +Math.hypot(p.position.x - rex.position.x, p.position.z - rex.position.z).toFixed(0) };
}, (r) => r.error ? r.error : (r.inicio !== 'chase' ? 'no llegó a perseguir: ' + r.inicio : (r.tl.some((e) => e.includes(':search')) ? true : 'no entró en búsqueda: ' + r.tl)));

await R('T. rex: control negativo — jugador agachado a 140 m no es perseguido (no omnisciente)', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const rex = T.pon('tyrannosaurus', s.x, s.z); rex.hambre = 0.95;
  T.jug(s.x, s.z + 140, 0); T.p.crouching = true;
  const est = new Set(); let t = 0; while (t < 60) { T.avanza(0.5); t += 0.5; est.add(rex.state); T.S.heal(100); }
  return { estados: [...est], danos: T.log.dano.length };
}, (r) => r.error ? r.error : (!r.estados.includes('chase') && r.danos === 0 ? true : 'persiguió a un jugador oculto a 140 m: ' + r.estados));

await R('T. rex: carroñea un cadáver cercano (feed)', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const rex = T.pon('tyrannosaurus', s.x, s.z); rex.hambre = 0.9;
  const t0 = T.pon('triceratops', s.x + 35, s.z); t0.damage(9999, 'prueba');
  T.jug(s.x - 150, s.z - 170); T.p.crouching = true;
  const estados = new Set(); let t = 0; while (t < 60) { T.avanza(0.5); t += 0.5; estados.add(rex.state); if (rex.state === 'feed' && rex.feedT > 3) break; }
  return { estados: [...estados], carcass: !!rex.carcass, hambre: +rex.hambre.toFixed(2), devorado: +t0.devorado.toFixed(1), carr: T.sk('carroneo') };
}, (r) => r.error ? r.error : (r.estados.includes('feed') ? true : 'no fue al cadáver: ' + r.estados));

// ---------------------------------------------------------------------------------- 5. regresión de especies antiguas
await R('raptor: acecha y emboscada al jugador (regresión)', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const r = T.pon('raptor', s.x, s.z); r.hambre = 0.9; r.yaw = 0;
  T.jug(s.x, s.z + 30, 0); T.mira(s.x, s.z + 30, s.x, s.z);
  const est = new Set(); let t = 0; while (t < 25) { T.avanza(0.25); t += 0.25; est.add(r.state); if (T.log.dano.length) break; }
  return { estados: [...est], danos: T.log.dano.length, acecho: T.sk('acecho'), emboscada: T.sk('emboscada') };
}, (r) => r.error ? r.error : (r.estados.some((e) => e === 'stalk' || e === 'chase') ? true : 'el raptor ni acecha ni persigue'));

await R('braquiosaurio: pasivo (no ataca) pero pisotea al jugador que se mete bajo sus patas en marcha', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const b = T.pon('braquiosaurio', s.x, s.z);
  T.jug(s.x + 12, s.z, 0); T.mira(s.x + 12, s.z, s.x, s.z);
  T.avanza(15); const pasivo = { estado: b.state, danoJugador: T.log.dano.length, pisoteos: T.sk('pisoteo') };
  // lo pone en marcha y coloca al jugador bajo sus patas
  b.pickGoal?.(40); b.setState('wander');
  let t = 0; while (t < 25) { const l = b.legs.find((q) => q.wx != null && q.ik.lift <= 0.1) ?? b.legs[0]; if (l?.wx != null) T.p.teleport(l.wx + 0.2, l.wz); T.S.heal(100); T.avanza(0.25); t += 0.25; if (T.sk('pisoteo')) break; }
  return { pasivo, tras: { estado: b.state, pisoteos: T.sk('pisoteo'), golpes: T.log.dano.length } };
}, (r) => r.error ? r.error : (r.pasivo.danoJugador === 0 && r.pasivo.pisoteos === 0 ? (r.tras.pisoteos >= 1 ? true : 'no pisoteó bajo sus patas') : 'atacó sin provocación'));

await R('presas pequeñas: compsognatus huye del jugador', () => {
  const T = window.__T, F = T.F; T.limpia(); F.setGrace(0);
  const s = T.site(T.c.world.spawn.x, T.c.world.spawn.z); if (!s) return { error: 'sin sitio' };
  const c1 = T.pon('compsognatus', s.x, s.z); c1.yaw = 0;
  // 10 m: dentro de su distancia de huida (vista 22 m × 0,6 = 13,2 m). A 14 m el resultado dependía de que el animal paseara hacia el jugador.
  T.jug(s.x, s.z + 10, 0); T.mira(s.x, s.z + 10, s.x, s.z);
  const est = new Set(); let t = 0; while (t < 12) { T.avanza(0.25); t += 0.25; est.add(c1.state); }
  return { estados: [...est] };
}, (r) => r.error ? r.error : (r.estados.includes('flee') ? true : 'no huyó: ' + r.estados));

await R('sin NaN ni objetos perdidos tras todas las pruebas', () => {
  const T = window.__T, F = T.F;
  const mal = F.creatures.filter((o) => !Number.isFinite(o.position.x) || !Number.isFinite(o.position.y) || !Number.isFinite(o.position.z) || !Number.isFinite(o.hp)).length;
  return { criaturas: F.creatures.length, mal };
}, (r) => r.error ? r.error : (r.mal === 0 ? true : `${r.mal} criaturas con NaN`));

console.log('\nRESUMEN:', results.filter((r) => r.ok).length + '/' + results.length, 'OK');
console.log('ERRORES de consola/página:', errs.length ? errs.slice(0, 6) : 'ninguno');
await browser.close(); server.kill();
