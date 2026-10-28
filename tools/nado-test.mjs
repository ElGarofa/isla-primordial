#!/usr/bin/env node
// Prueba automática del nado (src/fauna/nado.js y las 10 especies acuáticas): contrato de datos, permanencia en el agua, profundidad (fondo y superficie),
// subir a respirar, animación (cola, aletas), persecución/huida sin salir del agua, muerte (flota panza arriba y se hunde), golpes y voces.
// Uso: tools/lock.sh node tools/nado-test.mjs [regex de escenario] [--ids a,b,c]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const idsOpt = opt('ids');
const only = args[0] && !args[0].startsWith('--') ? new RegExp(args[0]) : null;
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low`);
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
const IDS = ['mosasaurus', 'tylosaurus', 'prognathodon', 'plesiosaurus', 'elasmosaurus', 'kronosaurus', 'ichthyosaurus', 'ophthalmosaurus', 'xiphactinus', 'leedsichthys'];
await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, S = c.survival;
  const T = window.__T = { g, c, p, F, S, w: c.world };
  T.sp = (await import('/src/fauna/species.js')).SPECIES;
  T.nado = await import('/src/fauna/nado.js');
  c.render = () => {};
  F.radioActivo = 900; // el mar abierto queda a ~500 m de la playa de aparición (plataforma continental); a 320 m las criaturas se congelan
  c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
  // un punto de mar abierto (≥ 14 m de fondo y ≥ 10 m a 25 m a la redonda) lo más cerca posible de la playa de aparición del jugador
  T.mar = () => {
    if (T._mar) return T._mar;
    const sp = c.world.spawn;
    for (let r = 10; r < 3000; r += 10) for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2, x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      if (Math.abs(x) > T.w.limite - 50 || Math.abs(z) > T.w.limite - 50 || T.w.getHeight(x, z) > -14) continue; // mundo cuadrado de 12 km
      let ok = true;
      for (let q = 0; q < 8 && ok; q++) if (T.w.getHeight(x + Math.cos(q * 0.785) * 25, z + Math.sin(q * 0.785) * 25) > -10) ok = false;
      if (ok) return (T._mar = { x, z, d: r });
    }
    return null;
  };
  T.playa = () => c.world.spawn;
  T.avanza = (seg, dt = 0.1) => { g.advance(Math.max(1, Math.round(seg / dt)), dt); };
  // la animación y la visibilidad de las criaturas dependen de la distancia a la CÁMARA: T.cam la deja junto a la zona de mar de la prueba (el jugador sigue en la playa)
  T.cam = (x, z) => { c.debug.freeCamera = true; c.camera.position.set(x, 12, z); };
  T.jug = (x, z) => { c.debug.freeCamera = false; if (c.state === 'dead') S.respawn(); p.teleport(x, z); p.velocity.set(0, 0, 0); S.heal(100); };
  T.limpia = () => { F.clear(); };
  T.finito = (cr) => [cr.position.x, cr.position.y, cr.position.z, cr.yaw, cr.speed].every(Number.isFinite);
});
const results = [];
const run = async (name, fn, arg) => {
  if (only && !only.test(name)) return;
  try { const r = await page.evaluate(fn, arg); results.push({ name, ...r }); } catch (e) { results.push({ name, ok: false, msg: String(e).slice(0, 300) }); }
};
const ids = idsOpt ? idsOpt.split(',') : IDS;

// 1) contrato de datos: la especie declara su nado, su modelo se construye y los huesos que usa el nado existen
for (const id of ids) {
  await run(`datos ${id}`, (id) => {
    const T = window.__T, sp = T.sp[id];
    if (!sp) return { ok: false, msg: 'no existe' };
    const n = sp.nada, errores = [];
    if (!n) errores.push('sin sp.nada');
    const b = sp.build();
    const nombres = b.specs.map((s) => s.name);
    for (const h of ['hips', 'spine1', 'head', 'jaw', 'tail1', 'tail5']) if (!nombres.includes(h)) errores.push(`falta hueso ${h}`);
    if (n?.tipo === 'plesiosaurio') for (const h of ['flFL1', 'flFL2', 'flFR1', 'flHL1', 'flHR2']) if (!nombres.includes(h)) errores.push(`falta hueso ${h}`);
    const pos = b.geo.attributes.position.array; let bad = 0; for (const v of pos) if (!Number.isFinite(v)) bad++;
    if (bad) errores.push(`${bad} vértices no finitos`);
    if (!(sp.hit.length >= 10)) errores.push('pocas esferas de impacto');
    if (!(n.minAgua > 0 && n.prof[1] > n.prof[0])) errores.push('parámetros de nado incoherentes');
    if (!sp.drops?.length) errores.push('sin despiece');
    return { ok: !errores.length, msg: errores.join('; ') || `${b.specs.length} huesos, ${sp.hit.length} esferas, ${(b.geo.index.count / 3) | 0} triángulos` };
  }, id);
}

// 2) nada 120 s en mar abierto: se queda en el agua, entre el fondo y la superficie, se mueve, anima la cola/aletas y (los reptiles) sube a respirar
for (const id of ids) {
  await run(`nada ${id}`, (id) => {
    const T = window.__T, { F, w } = T, sp = T.sp[id], n = sp.nada, errores = [];
    T.limpia(); const m = T.mar(); const pl = T.playa(); T.jug(pl.x, pl.z); T.cam(m.x + 60, m.z);
    const cr = F.spawnAt(id, m.x, m.z, { tint: 0.5 });
    if (!cr) return { ok: false, msg: 'no apareció' };
    let minProf = 1e9, maxProf = -1e9, dist = 0, ant = [cr.position.x, cr.position.z], fuera = 0, nan = 0, tailMax = 0, tailMin = 0, flipMax = 0, sube = 0;
    for (let t = 0; t < 1200; t++) {
      T.avanza(0.1, 0.1);
      if (!T.finito(cr)) { nan++; break; }
      const sup = T.nado.superficie(cr), prof = sup - (cr.position.y + sp.hips), piso = w.getHeight(cr.position.x, cr.position.z);
      minProf = Math.min(minProf, prof); maxProf = Math.max(maxProf, prof);
      if (w.getHeight(cr.position.x, cr.position.z) > -n.minAgua + 0.01) fuera++;
      if (cr.position.y + sp.hips - n.alto < piso - 0.05) fuera += 1000; // atraviesa el fondo
      if (t % 10 === 9) { dist += Math.hypot(cr.position.x - ant[0], cr.position.z - ant[1]); ant = [cr.position.x, cr.position.z]; }
      const tb = cr.tail[2]?.rotation.y ?? 0; tailMax = Math.max(tailMax, tb); tailMin = Math.min(tailMin, tb);
      const f = cr.bones.flFL1 ? Math.abs(cr.bones.flFL1.rotation.z) : 0; flipMax = Math.max(flipMax, f);
      if (n.respira && prof < n.alto * 0.9) sube++;
    }
    if (nan) errores.push('posición no finita');
    if (fuera >= 1000) errores.push('atravesó el fondo'); else if (fuera) errores.push(`salió del agua ${fuera} veces`);
    if (dist < 12) errores.push(`apenas se movió (${dist.toFixed(1)} m en 120 s)`);
    if (maxProf > n.prof[1] + 6.5) errores.push(`demasiado hondo (${maxProf.toFixed(1)} m)`);
    if (n.respira && sube < 5) errores.push(`no subió a respirar (${sube} muestras en superficie)`);
    if (tailMax - tailMin < 0.03) errores.push('la cola no ondula');
    if (n.tipo === 'plesiosaurio' && flipMax < 0.15) errores.push('las aletas no baten');
    T.limpia();
    return { ok: !errores.length, msg: errores.join('; ') || `prof ${minProf.toFixed(1)}–${maxProf.toFixed(1)} m, ${dist.toFixed(0)} m recorridos, cola ±${Math.max(tailMax, -tailMin).toFixed(2)}${n.respira ? `, superficie ${sube}/1200` : ''}` };
  }, id);
}

// 3) orilla: en agua apenas suficiente no sale a tierra en 90 s (y si el jugador está en la playa no lo persigue fuera del agua)
for (const id of ['mosasaurus', 'xiphactinus', 'elasmosaurus'].filter((i) => ids.includes(i))) {
  await run(`orilla ${id}`, (id) => {
    const T = window.__T, { F, w } = T, sp = T.sp[id], n = sp.nada, errores = [];
    T.limpia();
    // agua justo al pie de la orilla: cualquier punto con agua suficiente y tierra firme (> 1,2 m) a 14 m (el mapa actual no tiene aguas someras: la costa cae directa al fondo)
    let sx = null, sz = null, px = 0, pz = 0;
    const cand = T._somero ??= (() => { const out = []; for (let x = -800; x <= 800; x += 8) for (let z = -800; z <= 800; z += 8) { const h = w.getHeight(x, z); if (h < -1.5) out.push([x, z, h]); } return out; })();
    for (const [x, z, h] of cand) {
      if (!(h < -n.minAgua - 0.2)) continue;
      for (let q = 0; q < 12; q++) { const a = q * Math.PI / 6, tx = x + Math.cos(a) * 14, tz = z + Math.sin(a) * 14; if (w.getHeight(tx, tz) > 1.2) { sx = x; sz = z; px = tx; pz = tz; break; } }
      if (sx !== null) break;
    }
    if (sx === null) return { ok: false, msg: 'sin punto de prueba' };
    T.jug(px, pz);
    const cr = F.spawnAt(id, sx, sz, { tint: 0.5 });
    cr.hambre = 1; cr.tgtJugador = true; cr.sosp = 2; cr.setState('chase'); // lo manda a por el jugador, que está en tierra
    let fuera = 0, chase = 0, minD = 1e9; const danos = []; const off = T.c.events.on('player:damage', (d) => danos.push(`${d.fuente}:${d.cantidad.toFixed(0)}`));
    for (let t = 0; t < 900; t++) {
      T.avanza(0.1, 0.1);
      if (w.getHeight(cr.position.x, cr.position.z) > -n.minAgua + 0.01) fuera++;
      if (cr.state === 'chase' || cr.state === 'charge') chase++;
      minD = Math.min(minD, Math.hypot(cr.position.x - T.p.position.x, cr.position.z - T.p.position.z));
    }
    if (fuera) errores.push(`salió del agua ${fuera} veces`);
    if (chase > 80) errores.push(`siguió persiguiendo al jugador en tierra (${chase} ticks)`);
    off(); // un animal de varios metros puede morder a quien está en la misma orilla; pero no desde más lejos de su alcance (cuerpo + cabeza)
    if (danos.length && minD > sp.radius * 1.7 + 3) errores.push(`daño al jugador en tierra desde ${minD.toFixed(1)} m (alcance máximo razonable ${(sp.radius * 1.7 + 3).toFixed(1)} m): ${danos.slice(0, 4).join(', ')}`);
    if (T.c.state === 'dead') T.S.respawn();
    T.limpia();
    return { ok: !errores.length, msg: errores.join('; ') || `distancia mínima al jugador ${minD.toFixed(0)} m${danos.length ? `, mordisco en la orilla (${danos.length})` : ''}` };
  }, id);
}

// 4) caza: un gran depredador persigue a un nadador/presa cercano; la presa huye sin salir del agua
await run('caza mosasaurus→ichthyosaurus', () => {
  const T = window.__T, { F, w } = T, errores = [];
  T.limpia(); const m = T.mar(), pl = T.playa(); T.jug(pl.x, pl.z); T.cam(m.x + 60, m.z);
  const dep = F.spawnAt('mosasaurus', m.x, m.z, { tint: 0.5 });
  const pre = F.spawnAt('ichthyosaurus', m.x + 35, m.z, { tint: 0.5 });
  dep.hambre = 1; dep.energia = 1; dep.cdCaza = 0;
  let chase = 0, flee = 0, fuera = 0, minD = 1e9, dano = 0;
  for (let t = 0; t < 1200; t++) {
    T.avanza(0.1, 0.1);
    if (dep.state === 'chase' || dep.state === 'charge' || dep.state === 'stalk' || dep.state === 'alert') chase++;
    if (pre.state === 'flee') flee++;
    if (w.getHeight(pre.position.x, pre.position.z) > -pre.sp.nada.minAgua + 0.01 || w.getHeight(dep.position.x, dep.position.z) > -dep.sp.nada.minAgua + 0.01) fuera++;
    minD = Math.min(minD, Math.hypot(dep.position.x - pre.position.x, dep.position.z - pre.position.z));
    if (pre.muerta) { dano = 1; break; }
  }
  if (fuera) errores.push(`salieron del agua ${fuera} veces`);
  if (chase < 10 && flee < 10) errores.push('no hubo reacción depredador–presa');
  T.limpia();
  return { ok: !errores.length, msg: errores.join('; ') || `caza ${chase}, huida ${flee}, distancia mínima ${minD.toFixed(1)} m${dano ? ', presa abatida' : ''}` };
});

// 5) muerte: flota panza arriba cerca de la superficie, se puede despiezar y acaba hundiéndose y desapareciendo
for (const id of ['mosasaurus', 'plesiosaurus', 'xiphactinus'].filter((i) => ids.includes(i))) {
  await run(`muerte ${id}`, (id) => {
    const T = window.__T, { F } = T, sp = T.sp[id], n = sp.nada, errores = [];
    T.limpia(); const m = T.mar(), pl = T.playa(); T.jug(pl.x, pl.z); T.cam(m.x + 60, m.z);
    const cr = F.spawnAt(id, m.x, m.z, { tint: 0.5 });
    T.avanza(5, 0.1);
    cr.damage(1e6, 'jugador');
    T.avanza(12, 0.1);
    const sup = T.nado.superficie(cr), prof = sup - (cr.position.y + sp.hips);
    if (!cr.muerta) errores.push('no murió');
    if (prof > n.alto * 1.2) errores.push(`no flota (prof ${prof.toFixed(2)} m)`);
    if (Math.abs(cr.roll) < 2.4) errores.push(`no quedó panza arriba (roll ${cr.roll.toFixed(2)})`);
    if (!T.finito(cr)) errores.push('posición no finita');
    const bone = cr.bones.hips.rotation.z;
    if (Math.abs(bone) < 2.4) errores.push('el hueso raíz no refleja el vuelco');
    T.avanza(120, 0.2);
    const sigue = F.creatures.includes(cr);
    if (sigue) errores.push('sigue en la lista tras 130 s');
    T.limpia();
    return { ok: !errores.length, msg: errores.join('; ') || `flotó a ${prof.toFixed(2)} m de la superficie, roll ${cr.roll.toFixed(2)} y desapareció` };
  }, id);
}

// 6) golpes: un rayo contra el centro del cuerpo acierta; desde el lado opuesto al mar no; el pez no emite voz
await run('golpe y voz', () => {
  const T = window.__T, { F, c } = T, errores = [];
  T.limpia(); const m = T.mar(), pl = T.playa(); T.jug(pl.x, pl.z); T.cam(m.x + 60, m.z);
  const cr = F.spawnAt('mosasaurus', m.x, m.z, { tint: 0.5, frozen: true });
  T.avanza(2, 0.1);
  const centro = cr.center.clone();
  const THREE_V = centro.constructor, o = new THREE_V(centro.x, centro.y + 6, centro.z - 3), d = centro.clone().sub(o).normalize();
  const h = F.pick(o, d, 12);
  if (!h || h.criatura !== cr) errores.push(`el rayo hacia el centro no acierta (${h ? 'otra criatura' : 'nada'}; centro ${[centro.x, centro.y, centro.z].map((q) => q.toFixed(1))}, hips ${cr.sp.hips}, y ${cr.position.y.toFixed(1)}, rumbo ${cr.yaw.toFixed(2)}, pitch ${cr.pitch.toFixed(2)}, roll ${cr.roll.toFixed(2)}, visible ${cr.group.visible})`);
  const lejos = F.pick(new THREE_V(centro.x + 40, centro.y + 6, centro.z), new THREE_V(0, -1, 0), 12);
  if (lejos) errores.push('acierta donde no hay cuerpo');
  const f = F.spawnAt('xiphactinus', m.x + 30, m.z, { tint: 0.5, frozen: true });
  let voces = 0; c.events.on('creature:roar', () => { voces++; });
  f.lastRoar = -1e9; cr.lastRoar = -1e9; // los rugidos ambientales del gestor pueden haber disparado el temporizador
  f.roar(true); f.roar(true);
  if (voces) errores.push('el pez emite voz');
  if (f.sp.voz !== null) errores.push('sp.voz debería ser null en peces');
  cr.lastRoar = -1e9; cr.roar(true);
  if (!voces) errores.push(`el reptil marino no emite voz (voz=${cr.sp.voz}, lastRoar=${cr.lastRoar}, t=${c.time.elapsed})`);
  T.limpia();
  return { ok: !errores.length, msg: errores.join('; ') || 'rayo, hitboxes y voces correctos' };
});

console.log('\nPRUEBA DE NADO');
let fallos = 0;
for (const r of results) { console.log(`${r.ok ? ' OK ' : 'FALLO'}  ${r.name.padEnd(34)} ${r.msg ?? ''}`); if (!r.ok) fallos++; }
const e2 = errs.filter((e) => !/WebGL|GPU stall|swiftshader|ReadPixels/i.test(e));
if (e2.length) { console.log('\nErrores de consola/página:'); for (const e of [...new Set(e2)].slice(0, 8)) console.log('  ', e.slice(0, 240)); }
console.log(`\n${results.length - fallos}/${results.length} escenarios correctos${e2.length ? ` · ${e2.length} errores de consola` : ''}`);
await browser.close(); server.kill();
process.exit(fallos || e2.length ? 1 : 0);
