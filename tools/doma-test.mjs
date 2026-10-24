#!/usr/bin/env node
// Prueba automática de domesticación, equipo y montura (Etapa 3). Usa window.__game (?debug=1). No renderiza: solo simula.
// Uso: node tools/doma-test.mjs [regex de escenario]
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

// ---- utilidades propias de esta prueba
await page.evaluate(() => {
  const T = window.__T, c = T.c, p = T.p, F = T.F, S = T.S, V = F.vinculo;
  T.V = V;
  T.vaciar = () => { for (let i = 0; i < S.slots.length; i++) S.slots[i] = null; for (const k of Object.keys(S.equipo)) S.equipo[k] = null; c.events.emit('inventory:changed', {}); };
  T.cuida = () => { S.heal(100); S.stats.hambre = 100; S.stats.sed = 100; S.stats.energia = 100; };
  T.dist = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  /** Mantiene al jugador quieto a `d` metros de la criatura (como quien la observa de lejos y la sigue con calma). */
  T.mantener = (cr, d) => {
    let dx = p.position.x - cr.position.x, dz = p.position.z - cr.position.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    T.jug(cr.position.x + dx * d, cr.position.z + dz * d, 0); T.mira(p.position.x, p.position.z, cr.position.x, cr.position.z);
  };
  /** Criatura ya bajo manejo / domesticada (precondición de los escenarios; la progresión real se prueba aparte). */
  T.propia = (esp, x, z, o = {}) => {
    const cr = T.pon(esp, x, z); const r = cr.rel; if (!r) return cr;
    r.hab = 1; r.conf = 1;
    if (o.manejo !== false) { r.manejo = true; r.orden = o.orden ?? 'seguir'; r.equipo.cabeza = { item: cr.sp.doma.manejo?.equipo ?? 'cabestro', dur: 100, cal: 1, rep: 0 }; }
    if (o.dom) { r.dom = true; r.cuid = (cr.sp.doma.cuidado?.dias ?? 1) * c.config.time.dayLengthSec; }
    cr.hambre = o.hambre ?? 0.3; cr.energia = 1;
    return cr;
  };
  /** Pone un objeto en la mochila y devuelve el índice de su casilla. */
  T.dar = (item, n = 1) => { S.inventory.add(item, n); return S.slots.findIndex((s) => s && s.item === item); };
  /** Quita la fauna salvaje cercana (la prueba del reloj dura miles de segundos simulados: los depredadores reaparecen y ahuyentarían al animal). */
  T.sinSalvajes = (g) => { for (const x of F.getNear(p.position, 2000)) if (x !== g && !V.esPropio(x)) F.remove(x); };
  T.salvaje = (cr) => { cr.setState('idle'); cr.amenaza = null; cr.provocado = 0; };
});

const SP = ['tyrannosaurus', 'raptor', 'compsognatus', 'gallimimus', 'parasaurolophus', 'stegosaurus', 'ankylosaurus', 'triceratops', 'braquiosaurio', 'pteranodon'];

// ---------------------------------------------------------------------------------- 0. datos
await R('datos: nivel máximo, dieta y anatomía por especie son coherentes', (SP) => {
  const T = window.__T, F = T.F, out = {};
  for (const e of SP) {
    const c = T.pon(e, 0, 0); if (!c) { out[e] = 'sin spawn'; continue; }
    out[e] = { max: c.sp.doma?.max, rel: !!c.rel, jinete: !!c.sp.montura?.jinete, tipos: c.sp.montura?.tipos ?? [], depredador: (c.sp.ai.caza?.length ?? 0) > 0 || !!c.sp.ai.agresivo };
    F.remove(c);
  }
  return out;
}, (r, ) => {
  if (r.error) return r.error;
  for (const [e, v] of Object.entries(r)) {
    if (typeof v === 'string') return `${e}: ${v}`;
    if (v.depredador && v.max > 3) return `${e}: un depredador no puede pasar de habituado`;
    if (v.max === 0 && v.rel) return `${e}: no domesticable pero tiene relación`;
    if (v.max >= 1 && !v.rel) return `${e}: domesticable sin datos de relación`;
    if (v.jinete && v.max < 6) return `${e}: montura sin nivel 6`;
  }
  if (!r.gallimimus.jinete || !r.parasaurolophus.jinete || !r.triceratops.jinete) return 'faltan monturas previstas';
  if (r.stegosaurus.jinete || r.ankylosaurus.jinete || r.braquiosaurio.jinete || r.tyrannosaurus.jinete) return 'montura en especie cuya anatomía no la permite';
  return true;
}, SP);

// ---------------------------------------------------------------------------------- 1. habituación real
await R('habituación: solo con presencia tranquila a distancia; tarda su tiempo y nunca asusta', () => {
  const T = window.__T, F = T.F, c = T.c, p = T.p; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const g = T.pon('gallimimus', s.x, s.z); g.hambre = 0.4;
  // el jugador observa desde lejos y, a medida que el animal se acostumbra, se acerca despacio sin pasar nunca de su distancia de huida
  const dist = () => 42 - 20 * Math.min(1, g.rel.hab * 2);
  T.mantener(g, 42);
  const seg = g.sp.doma.hab.seg; let t = 0, flee = 0, alert = 0, t50 = null, vistoNivel2 = false;
  while (t < seg * 3 && g.rel.hab < 1) {
    T.sinSalvajes(g); T.avanza(0.5); t += 0.5; T.cuida(); T.mantener(g, dist());
    if (g.state === 'flee') flee++; if (g.state === 'alert') alert++;
    if (t50 == null && g.rel.hab >= 0.5) t50 = t;
  }
  return { t, seg, hab: g.rel.hab, flee, alert, t50, nivel: F.vinculo.nivelDe(g), evento: g.rel.hab >= 1 };
}, (r) => {
  if (r.error) return r.error;
  if (r.hab < 1) return `no llegó a habituarse en ${r.t} s (hab ${r.hab.toFixed(2)})`;
  if (r.t < r.seg * 0.8) return `demasiado rápido: ${r.t} s para ${r.seg} s`;
  if (r.flee > 0) return `huyó ${r.flee} veces mientras se habituaba`;
  if (r.nivel !== 3) return `nivel esperado 3 (habituado), fue ${r.nivel}`;
  return true;
});

await R('habituación: un animal habituado tolera que te acerques a pie; uno salvaje huye', () => {
  const T = window.__T, F = T.F, p = T.p; T.limpia(); F.setGrace(0);
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const run = (hab) => {
    T.limpia(); const g = T.pon('gallimimus', s.x, s.z); g.hambre = 0.4; g.rel.hab = hab; g.yaw = 0;
    T.jug(s.x, s.z + 30, 0); T.mira(p.position.x, p.position.z, s.x, s.z);
    let flee = 0, minD = 1e9, prev = null;
    for (let i = 0; i < 80; i++) { // se acerca caminando (3 m/s) hasta 5 m y se queda 10 s
      const d = T.dist(g, p), obj = Math.max(5, d - 1.5);
      if (d > 5.2) { const dx = (g.position.x - p.position.x) / d, dz = (g.position.z - p.position.z) / d; T.jug(p.position.x + dx * 1.5, p.position.z + dz * 1.5, 0); T.mira(p.position.x, p.position.z, g.position.x, g.position.z); }
      T.avanza(0.5); T.cuida(); if (g.state === 'flee' && prev !== 'flee' && (hab < 1 || T.dist(g, p) > 3.5)) flee++; prev = g.state; minD = Math.min(minD, T.dist(g, p)); void obj; // un habituado que pasea hasta rozar a un jugador quieto puede sobresaltarse a menos de ~2 m: no cuenta como huida por acercarse
    }
    return { flee, minD: +minD.toFixed(1) };
  };
  return { salvaje: run(0), habituado: run(1) };
}, (r) => {
  if (r.error) return r.error;
  if (r.salvaje.flee === 0) return 'el salvaje no huyó al acercarse';
  if (r.habituado.flee > 0) return `el habituado huyó (${r.habituado.flee})`;
  if (r.habituado.minD > 7.5) return `el habituado no dejó acercarse: ${r.habituado.minD} m`;
  return true;
});

await R('habituación: correr o hacer ruido cerca deshace la tolerancia (susto = penalización única)', () => {
  const T = window.__T, F = T.F, p = T.p; T.limpia(); F.setGrace(0);
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const g = T.pon('gallimimus', s.x, s.z); g.hambre = 0.4; g.rel.hab = 1; g.yaw = 0;
  T.jug(s.x, s.z + 14, 0); T.mira(p.position.x, p.position.z, s.x, s.z); p.sprinting = true; p.ruidoExtra = 1;
  let flee = false; for (let i = 0; i < 30; i++) { p.sprinting = true; p.ruidoExtra = 1; T.avanza(0.25); T.S.heal(100); if (g.state === 'flee') flee = true; }
  p.sprinting = false; T.avanza(10);
  return { flee, hab: g.rel.hab };
}, (r) => r.error ? r.error : (!r.flee ? 'no huyó ante una carrera ruidosa a 14 m' : r.hab >= 1 ? 'el susto no restó habituación' : r.hab < 0.6 ? 'la penalización fue excesiva' : true));

await R('habituación: especies fuera de alcance no avanzan (pteranodon sin relación, braquiosaurio tope 3)', () => {
  const T = window.__T, F = T.F; T.limpia();
  const pt = T.pon('pteranodon', 0, 0), br = T.pon('braquiosaurio', 40, 0);
  br.rel.hab = 1; br.rel.conf = 1; T.vaciar();
  const man = F.vinculo.puedeManejo(br);
  return { ptRel: pt.rel, nivelBr: F.vinculo.nivelDe(br), man };
}, (r) => r.error ? r.error : (r.ptRel !== null ? 'el pteranodon tiene relación' : r.nivelBr !== 3 ? `braquiosaurio nivel ${r.nivelBr}` : r.man.ok ? 'el braquiosaurio admitió manejo' : true));

// ---------------------------------------------------------------------------------- 2. ofrendas y confianza
await R('confianza: el alimento incorrecto se rechaza y resta; el correcto sube confianza, baja el hambre y tiene cooldown', () => {
  const T = window.__T, F = T.F, p = T.p, V = T.V, S = T.S; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const g = T.pon('gallimimus', s.x, s.z + 4); g.rel.hab = 1; g.rel.conf = 0.3; g.hambre = 0.6; g.yaw = Math.PI;
  T.jug(s.x, s.z, 0); T.mira(s.x, s.z, g.position.x, g.position.z);
  T.dar('carne_cruda', 2); T.dar('baya', 8);
  const out = {}; g.setState('idle');
  const mal = V.ofrecer(g, 'carne_cruda'); out.mal = { ok: mal.ok, motivo: mal.motivo, conf: +g.rel.conf.toFixed(2), carne: S.inventory.count('carne_cruda') };
  const bien = V.ofrecer(g, 'baya'); out.bien = { ok: bien.ok, conf: +g.rel.conf.toFixed(2), hambre: +g.hambre.toFixed(2), baya: S.inventory.count('baya') };
  const otra = V.ofrecer(g, 'baya'); out.cooldown = { ok: otra.ok, motivo: otra.motivo, baya: S.inventory.count('baya') };
  T.avanza(21); g.hambre = 0.7; g.setState('idle'); T.mantener(g, 4); g.rel.hab = 1;
  const des = V.ofrecer(g, 'baya'); out.despues = { ok: des.ok, motivo: des.motivo, conf: +g.rel.conf.toFixed(2) };
  g.hambre = 0.1; T.avanza(21); g.hambre = 0.1; g.setState('idle'); T.mantener(g, 4); g.rel.hab = 1; const sat = V.ofrecer(g, 'baya'); out.saciado = { ok: sat.ok, motivo: sat.motivo, baya: S.inventory.count('baya') };
  const nh = T.pon('gallimimus', s.x + 8, s.z); nh.hambre = 0.7; const x = V.ofrecer(nh, 'baya'); out.noHab = { ok: x.ok, motivo: x.motivo };
  out.xp = +S.saber.xp.manejo.toFixed(1);
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (r.mal.ok || r.mal.motivo !== 'dieta' || r.mal.conf >= 0.3 || r.mal.carne !== 2) return 'alimento incorrecto mal gestionado: ' + JSON.stringify(r.mal);
  if (!r.bien.ok || r.bien.hambre > 0.45 || r.bien.baya !== 7 || r.bien.conf < r.mal.conf + 0.2) return 'alimento correcto mal gestionado: ' + JSON.stringify(r.bien);
  if (r.cooldown.ok || r.cooldown.motivo !== 'cooldown' || r.cooldown.baya !== 7) return 'sin cooldown';
  if (!r.despues.ok) return 'no aceptó tras el cooldown: ' + r.despues.motivo;
  if (r.saciado.ok || r.saciado.motivo !== 'saciado') return 'aceptó comida estando saciado';
  if (r.noHab.ok || r.noHab.motivo !== 'no habituado') return 'aceptó comida sin estar habituado';
  if (r.xp < 2) return 'sin experiencia de manejo';
  return true;
});

await R('confianza: 4 ofrendas correctas dan confianza completa y la acción E pasa a ser colocar el cabestro', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const g = T.pon('gallimimus', s.x, s.z + 4); g.rel.hab = 1; T.jug(s.x, s.z, 0); T.mira(s.x, s.z, g.position.x, g.position.z);
  T.dar('baya', 8); const eventos = []; T.c.events.on('fauna:ofrenda', (e) => eventos.push(+e.conf.toFixed(2)));
  const antes = V.accionE(g);
  for (let i = 0; i < 4; i++) { T.sinSalvajes(g); g.hambre = 0.7; g.setState('idle'); T.mantener(g, 4); V.ofrecer(g, 'baya'); for (let k = 0; k < 21; k++) { T.sinSalvajes(g); T.avanza(1); } }
  return { antes, conf: g.rel.conf, despues: V.accionE(g), eventos, ofrecidas: g.rel.ofrecidas, nivel: V.nivelDe(g) };
}, (r) => r.error ? r.error : (r.conf < 1 ? `confianza ${r.conf}` : !/^Ofrecer/.test(r.antes) ? 'acción previa: ' + r.antes : !/Colocar cabestro/.test(r.despues) ? 'acción posterior: ' + r.despues : r.nivel !== 3 ? 'ya debería seguir en nivel 3' : true));

// ---------------------------------------------------------------------------------- 3. manejo (nivel 4)
await R('manejo: exige habituación, confianza, nivel de oficio y cabestro; luego el animal te sigue', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const mk = (esp, dx) => { const g = T.pon(esp, s.x + dx, s.z + 4); g.rel.hab = 1; g.rel.conf = 1; g.hambre = 0.4; return g; };
  T.jug(s.x, s.z, 0);
  const g = mk('gallimimus', 0), st = mk('stegosaurus', 10), rex = mk('tyrannosaurus', -12), cm = mk('compsognatus', 6);
  const sin = V.puedeManejo(g);                       // sin cabestro
  T.dar('cabestro', 1);
  const nivel1 = V.puedeManejo(st);                   // estegosaurio pide manejo 1
  const rexR = V.puedeManejo(rex);
  const cmR = V.puedeManejo(cm);                      // compsognatus pide collar, no cabestro
  const xp0 = S.saber.xp.manejo;
  const lejos = (() => { g.rel.conf = 0.5; const q = V.puedeManejo(g); g.rel.conf = 1; return q; })();
  g.setState('idle'); T.mantener(g, 4);
  const ok = V.colocarManejo(g);
  return { sin, nivel1, rexR, cmR, lejos, ok, manejo: g.rel.manejo, nivel: V.nivelDe(g), orden: g.rel.orden, cabeza: g.rel.equipo.cabeza?.item, cabestros: S.inventory.count('cabestro'), xp: S.saber.xp.manejo - xp0 };
}, (r) => {
  if (r.error) return r.error;
  if (r.sin.ok || !/cabestro/.test(r.sin.motivo)) return 'permitió manejo sin cabestro: ' + JSON.stringify(r.sin);
  if (r.nivel1.ok || !/nivel 1/.test(r.nivel1.motivo)) return 'estegosaurio sin nivel de manejo: ' + JSON.stringify(r.nivel1);
  if (r.rexR.ok) return 'un T. rex admitió manejo';
  if (r.cmR.ok || !/collar/i.test(r.cmR.motivo)) return 'compsognatus sin collar: ' + JSON.stringify(r.cmR);
  if (r.lejos.ok) return 'manejo con confianza insuficiente';
  if (!r.ok.ok || !r.manejo || r.nivel !== 4 || r.orden !== 'seguir' || r.cabeza !== 'cabestro' || r.cabestros !== 0) return 'colocar cabestro falló: ' + JSON.stringify(r);
  if (r.xp < 4) return 'sin experiencia por el cabestro';
  return true;
});

await R('manejo: «seguir» mantiene al animal junto al jugador durante un recorrido; «quedarse» lo ata a su sitio', () => {
  const T = window.__T, F = T.F, V = T.V, p = T.p; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const g = T.propia('parasaurolophus', s.x - 40, s.z, { orden: 'seguir' }); g.yaw = Math.PI / 2;
  T.jug(s.x - 40, s.z + 6, 0);
  let maxD = 0; const dsts = [];
  for (let i = 0; i < 240; i++) { // 60 s caminando a 4 m/s hacia +x (80 m)
    p.position.x = Math.min(s.x + 40, p.position.x + 1.0); p.position.y = T.c.world.getHeight(p.position.x, p.position.z); p.velocity.set(i < 239 ? 4 : 0, 0, 0); T.avanza(0.25); T.cuida(); const d = T.dist(g, p); maxD = Math.max(maxD, d); if (i % 40 === 0) dsts.push(+d.toFixed(1));
  }
  const finalD = T.dist(g, p), recorrido = Math.hypot(g.position.x - (s.x - 40), g.position.z - s.z);
  // quedarse
  V.ordenar(g, 'quedarse'); const hogar = { ...g.rel.hogar };
  T.jug(hogar.x + 70, hogar.z, 0); T.avanza(45); T.cuida();
  const dHogar = Math.hypot(g.position.x - hogar.x, g.position.z - hogar.z), dJug = T.dist(g, p);
  // vuelve a su sitio si se le aparta
  g.position.x = hogar.x + 30; T.avanza(40); T.cuida(); const dHogar2 = Math.hypot(g.position.x - hogar.x, g.position.z - hogar.z);
  return { maxD: +maxD.toFixed(1), finalD: +finalD.toFixed(1), recorrido: +recorrido.toFixed(1), dsts, dHogar: +dHogar.toFixed(1), dJug: +dJug.toFixed(1), dHogar2: +dHogar2.toFixed(1) };
}, (r) => {
  if (r.error) return r.error;
  if (r.recorrido < 55) return `no siguió al jugador (recorrió ${r.recorrido} m)`;
  if (r.finalD > 30) return `quedó rezagado a ${r.finalD} m`;
  if (r.dHogar > 16) return `«quedarse» no lo retuvo: a ${r.dHogar} m de su sitio`;
  if (r.dHogar2 > 16) return `desplazado, no volvió a su sitio (${r.dHogar2} m)`;
  return true;
});

// ---------------------------------------------------------------------------------- 4. domesticación (nivel 5): el reloj del juego
await R('domesticación: exige cuidado continuo durante días de juego; sin comida, tormenta o lejos no avanza', () => {
  const T = window.__T, F = T.F, V = T.V, p = T.p, c = T.c; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const dia = c.config.time.dayLengthSec;
  const g = T.propia('gallimimus', s.x, s.z + 5, { orden: 'seguir' }); T.jug(s.x, s.z, 0);
  const dias = g.sp.doma.cuidado.dias, total = dias * dia;
  const out = { dias, total };
  // (a) hambre extrema: no cuenta
  let c0 = g.rel.cuid; for (let i = 0; i < 120; i++) { g.hambre = 0.95; T.avanza(1, 0.5); T.cuida(); } out.hambre = +(g.rel.cuid - c0).toFixed(1);
  // (b) tormenta sin refugio: no cuenta y aumenta el estrés
  c0 = g.rel.cuid; g.hambre = 0.3; Object.assign(c.time.weather, { storm: 1, rain: 1 }); const e0 = g.rel.estres;
  for (let i = 0; i < 120; i++) { g.hambre = Math.min(g.hambre, 0.5); T.avanza(1, 0.5); T.cuida(); }
  out.tormenta = +(g.rel.cuid - c0).toFixed(1); out.estres = +(g.rel.estres - e0).toFixed(2); Object.assign(c.time.weather, { storm: 0, rain: 0 }); g.rel.estres = 0;
  // (c) el jugador se aleja más de 150 m: no cuenta
  c0 = g.rel.cuid; g.setState('idle'); g.rel.orden = 'quedarse'; g.rel.hogar = { x: g.position.x, z: g.position.z }; T.jug(g.position.x + 5, g.position.z - 200, 0); // más de 150 m pero dentro del radio activo (320 m)
  for (let i = 0; i < 60; i++) { T.sinSalvajes(g); T.avanza(1, 0.5); T.cuida(); } out.lejos = +(g.rel.cuid - c0).toFixed(1); out.lejosD = Math.round(g.distToPlayer());
  // (d) el cuidado real, con el reloj del juego, hasta domesticarlo
  g.rel.orden = 'seguir'; g.rel.hogar = null; T.jug(g.position.x, g.position.z - 3, 0); g.rel.cuid = 0;
  let t = 0, tDom = null, maxH = 0, mitad = null; const ev = []; c.events.on('fauna:domesticada', (e) => ev.push(e.nombre));
  while (t < total + 200) {
    T.sinSalvajes(g); T.avanza(5, 0.5); t += 5; T.cuida(); maxH = Math.max(maxH, g.hambre);
    if (!g.rel.dom && (t === Math.round(total / 5 / 2) * 5 || (mitad === null && t >= total / 2))) mitad ??= { t, dom: g.rel.dom, cuid: +g.rel.cuid.toFixed(0) };
    if (g.rel.dom) { tDom = t; break; }
    if (g.state === 'flee') { g.setState('idle'); }
    if (T.dist(g, p) > 100) T.jug(g.position.x + 5, g.position.z, 0);
  }
  out.t = tDom; out.mitad = mitad; out.maxHambre = +maxH.toFixed(2); out.eventos = ev.length; out.nivel = V.nivelDe(g); out.xp = +T.S.saber.xp.manejo.toFixed(1); out.cuid = +g.rel.cuid.toFixed(0);
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (r.hambre > 5) return `con hambre extrema avanzó ${r.hambre} s`;
  if (r.tormenta > 5) return `en tormenta sin refugio avanzó ${r.tormenta} s`;
  if (r.estres <= 0) return 'la tormenta no estresó al animal';
  if (r.lejos > 5 || r.lejosD < 150) return `con el jugador lejos (${r.lejosD} m) avanzó ${r.lejos} s`;
  if (r.t == null) return `no llegó a domesticarse (cuidado ${r.cuid}/${r.total})`;
  if (r.t < r.total * 0.97) return `se domesticó demasiado pronto: ${r.t} s de ${r.total}`;
  if (r.mitad?.dom) return 'domesticado a mitad de camino';
  if (r.eventos !== 1 || r.nivel !== 5) return `evento/nivel: ${r.eventos}/${r.nivel}`;
  if (r.maxHambre > 0.9) return `el animal pasó hambre (${r.maxHambre})`;
  return true;
});

await R('domesticación: abandono (hambre prolongada) o maltrato bajan un nivel; el cabestro se suelta', () => {
  const T = window.__T, F = T.F, V = T.V, p = T.p, c = T.c; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const out = {};
  // maltrato: primer golpe → baja a «bajo manejo»; segundo → pierde el manejo y el cabestro cae
  const g = T.propia('gallimimus', s.x, s.z + 6, { dom: true }); const props0 = c.physics?.list?.filter((q) => q.data?.item === 'cabestro').length ?? 0;
  out.antes = V.nivelDe(g);
  F.damage(g, 5, 'jugador'); out.golpe1 = { nivel: V.nivelDe(g), dom: g.rel.dom, manejo: g.rel.manejo, conf: +g.rel.conf.toFixed(2) };
  F.damage(g, 5, 'jugador'); out.golpe2 = { nivel: V.nivelDe(g), manejo: g.rel.manejo, hab: +g.rel.hab.toFixed(2), cabeza: g.rel.equipo.cabeza, cabestroSuelto: (c.physics?.list?.filter((q) => q.data?.item === 'cabestro').length ?? 0) - props0 };
  // abandono: 150 s con hambre máxima erosionan la confianza hasta perder el manejo
  const h = T.propia('gallimimus', s.x + 8, s.z + 6, { dom: false }); h.rel.conf = 0.55;
  let t = 0; while (t < 700 && h.rel.manejo) { h.hambre = 1.1; T.avanza(1, 0.5); t += 1; T.cuida(); }
  out.abandono = { t, manejo: h.rel.manejo, conf: +h.rel.conf.toFixed(2), nivel: V.nivelDe(h) };
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (r.antes !== 5) return `nivel previo ${r.antes}`;
  if (r.golpe1.dom || r.golpe1.nivel !== 4) return 'tras un golpe debía bajar a nivel 4: ' + JSON.stringify(r.golpe1);
  if (r.golpe2.manejo || r.golpe2.cabeza || r.golpe2.nivel >= 3 || r.golpe2.cabestroSuelto !== 1) return 'tras el segundo golpe: ' + JSON.stringify(r.golpe2);
  if (r.abandono.manejo || r.abandono.t > 600) return 'el abandono no hizo perder el manejo: ' + JSON.stringify(r.abandono);
  return true;
});

// ---------------------------------------------------------------------------------- 5. equipo según anatomía (nivel 6)
await R('equipo: cada especie solo admite lo que su anatomía permite (silla, bolsas, coraza)', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const items = ['montura_ligera', 'montura_transporte', 'montura_reforzada', 'arnes_cuero', 'alforjas', 'bolsa_carga', 'proteccion_animal'];
  const tabla = (c) => Object.fromEntries(items.map((i) => { const q = V.puedeEquipar(c, i); return [i, q.ok ? 'ok' : q.motivo.slice(0, 60)]; }));
  const out = {};
  const gal = T.propia('gallimimus', s.x + 4, s.z + 6, { dom: true }); out.gal0 = tabla(gal);
  for (const i of ['montura_ligera']) { const idx = T.dar(i); out.galEq = V.equipar(gal, idx).ok; }
  out.gal1 = tabla(gal); out.galNivel = V.nivelDe(gal);
  const par = T.propia('parasaurolophus', s.x - 6, s.z + 8, { dom: true }); out.par0 = tabla(par);
  out.parEq = V.equipar(par, T.dar('montura_transporte')).ok; out.par1 = tabla(par);
  const tri = T.propia('triceratops', s.x + 12, s.z + 10, { dom: true, hambre: 0.3 }); out.tri0 = tabla(tri);
  const ste = T.propia('stegosaurus', s.x - 14, s.z + 10, { dom: true }); out.ste = tabla(ste);
  const anq = T.propia('ankylosaurus', s.x + 20, s.z + 12, { dom: false }); out.anq = tabla(anq);
  const hab = T.pon('gallimimus', s.x + 30, s.z + 10); hab.rel.hab = 1; out.habituado = V.puedeEquipar(hab, 'montura_ligera').motivo;
  const manejo = T.propia('gallimimus', s.x + 34, s.z + 10, { dom: false }); out.soloManejo = V.puedeEquipar(manejo, 'montura_ligera').motivo;
  // protección real: reduce el daño recibido
  T.dar('proteccion_animal'); const p1 = V.equipar(tri, S.slots.findIndex((x) => x?.item === 'proteccion_animal')); out.triProt = p1.ok;
  const sin = T.propia('triceratops', s.x - 30, s.z + 14, { dom: true }); const hp0 = tri.hp, hp1 = sin.hp;
  tri.damage(100, 'criatura'); sin.damage(100, 'criatura'); out.dano = { con: +(hp0 - tri.hp).toFixed(1), sin: +(hp1 - sin.hp).toFixed(1) };
  out.tri1 = V.nivelDe(tri);
  // quitar equipo: no se puede quitar el arnés con bolsas puestas
  T.dar('alforjas'); out.parAlforjas = V.equipar(par, S.slots.findIndex((x) => x?.item === 'alforjas')).ok;
  out.quitarLomo = V.quitarEquipo(par, 'lomo'); out.quitarCarga = V.quitarEquipo(par, 'carga').ok;
  return out;
}, (r) => {
  if (r.error) return r.error;
  const ok = (m, k) => m[k] === 'ok';
  // gallimimus
  if (ok(r.gal0, 'montura_transporte') || ok(r.gal0, 'alforjas') || ok(r.gal0, 'bolsa_carga') || ok(r.gal0, 'proteccion_animal')) return 'gallimimus admitió equipo que su anatomía no permite: ' + JSON.stringify(r.gal0);
  if (!ok(r.gal0, 'montura_ligera') || !r.galEq || r.galNivel !== 6) return `gallimimus no pudo llevar montura ligera / nivel ${r.galNivel}`;
  if (!ok(r.gal1, 'bolsa_carga') || ok(r.gal1, 'alforjas')) return 'gallimimus: bolsa sí, alforjas no: ' + JSON.stringify(r.gal1);
  // parasaurolophus
  if (ok(r.par0, 'montura_ligera') || ok(r.par0, 'proteccion_animal') || ok(r.par0, 'montura_reforzada')) return 'parasaurolophus admitió monturas ajenas';
  if (!ok(r.par0, 'montura_transporte') || !r.parEq || !ok(r.par1, 'alforjas') || !ok(r.par1, 'bolsa_carga')) return 'parasaurolophus: silla de transporte y alforjas: ' + JSON.stringify(r.par1);
  // triceratops
  if (!ok(r.tri0, 'montura_reforzada') || !ok(r.tri0, 'montura_transporte') || !ok(r.tri0, 'proteccion_animal') || ok(r.tri0, 'montura_ligera')) return 'triceratops mal configurado: ' + JSON.stringify(r.tri0);
  if (!r.triProt || r.dano.con > r.dano.sin * 0.8) return `la protección no redujo el daño: ${JSON.stringify(r.dano)}`;
  // estegosaurio / anquilosaurio: nada
  if (Object.values(r.ste).some((v) => v === 'ok')) return 'estegosaurio admitió equipo: ' + JSON.stringify(r.ste);
  if (Object.values(r.anq).some((v) => v === 'ok')) return 'anquilosaurio admitió equipo: ' + JSON.stringify(r.anq);
  if (!/bajo tu manejo/.test(r.habituado)) return 'habituado admitió equipo: ' + r.habituado;
  if (!/domesticado/.test(r.soloManejo)) return 'sin domesticar admitió equipo: ' + r.soloManejo;
  if (!r.parAlforjas || r.quitarLomo.ok || r.quitarCarga !== true) return 'orden de quitar equipo: ' + JSON.stringify([r.parAlforjas, r.quitarLomo, r.quitarCarga]);
  return true;
});

await R('carga: alforjas con peso y volumen reales; al morir el animal la carga cae al suelo', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, c = T.c; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const par = T.propia('parasaurolophus', s.x + 3, s.z + 5, { dom: true });
  T.dar('arnes_cuero'); V.equipar(par, S.slots.findIndex((x) => x?.item === 'arnes_cuero'));
  const sinBolsa = V.guardar(par, T.dar('piedra', 5));
  T.dar('alforjas'); const eq = V.equipar(par, S.slots.findIndex((x) => x?.item === 'alforjas'));
  const cap = V.capacidadCarga(par);
  // la mochila del jugador no cabe tanta piedra: se va llenando y vaciando
  T.vaciar(); par.rel.equipo.lomo && 0;
  let guardado = 0; for (let k = 0; k < 20; k++) { const i = T.dar('piedra', 10); if (i < 0) break; const q = V.guardar(par, S.slots.findIndex((x) => x?.item === 'piedra')); guardado += q.ok ? q.cantidad : 0; if (!q.ok) break; }
  const cur = V.cargaActual(par);
  const lejos = (() => { const old = { x: p0().x, z: p0().z }; return old; })();
  function p0() { return T.p.position; }
  void lejos;
  const extra = V.guardar(par, T.dar('madera', 5) >= 0 ? S.slots.findIndex((x) => x?.item === 'madera') : 0);
  // sacar a la mochila del jugador (con su propio límite)
  const enMochila0 = S.inventory.count('piedra');
  const sacar = V.sacar(par, 0, 15);
  // al morir, lo que lleva cae al suelo
  const antes = par.rel.almacen.reduce((a, x) => a + x.cantidad, 0);
  const props0 = c.physics.list.length;
  par.damage(1e6, 'criatura');
  const dentro = par.rel.almacen.length, sueltos = c.physics.list.filter((q) => q.data?.item).reduce((a, q) => a + (q.data.cantidad ?? 0), 0);
  return { sinBolsa: { ok: sinBolsa.ok, motivo: sinBolsa.motivo }, eq: eq.ok, cap, guardado, cur: { peso: +cur.peso.toFixed(1), vol: +cur.vol.toFixed(1) }, extra: { ok: extra.ok, motivo: extra.motivo }, sacado: sacar.ok ? sacar.cantidad : sacar.motivo, enMochila: S.inventory.count('piedra') - enMochila0, antes, dentro, sueltos, nuevos: c.physics.list.length - props0 };
}, (r) => {
  if (r.error) return r.error;
  if (r.sinBolsa.ok) return 'guardó carga sin alforjas';
  if (!r.eq || r.cap.peso !== 70) return 'alforjas: ' + JSON.stringify([r.eq, r.cap]);
  if (r.cur.peso > r.cap.peso + 1e-6 || r.cur.vol > r.cap.vol + 1e-6) return `se superó la capacidad: ${JSON.stringify(r.cur)} / ${JSON.stringify(r.cap)}`;
  if (r.guardado < 40 || r.guardado > 58) return `guardó ${r.guardado} piedras (esperado ≤ 58 por peso, ≥ 40)`;
  if (r.sacado !== 15 || r.enMochila !== 15) return 'sacar: ' + JSON.stringify([r.sacado, r.enMochila]);
  if (r.dentro !== 0 || r.sueltos < r.antes) return `carga perdida al morir: dentro ${r.dentro}, sueltos ${r.sueltos}/${r.antes}`;
  return true;
});

await R('liberar: el equipo vuelve a la mochila (o cae al suelo si no cabe), la carga queda en el suelo y el animal vuelve a ser salvaje', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, c = T.c; T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const mk = (x) => {
    const par = T.propia('parasaurolophus', x, s.z + 4, { dom: true });
    T.dar('montura_transporte'); V.equipar(par, S.slots.findIndex((q) => q?.item === 'montura_transporte'));
    T.dar('alforjas'); V.equipar(par, S.slots.findIndex((q) => q?.item === 'alforjas'));
    T.dar('piedra', 4); V.guardar(par, S.slots.findIndex((q) => q?.item === 'piedra'));
    return par;
  };
  const out = {};
  const a = mk(s.x + 3); T.vaciar();
  const sueltos = () => c.physics.list.filter((q) => q.data?.item).length;
  const n0 = sueltos(); V.liberar(a);
  out.conMochila = { mochila: ['montura_transporte', 'alforjas', 'cabestro'].map((i) => S.inventory.count(i)), nuevos: sueltos() - n0, manejo: a.rel.manejo, dom: a.rel.dom, nivel: V.nivelDe(a), equipo: Object.values(a.rel.equipo).filter(Boolean).length };
  F.remove(a); T.vaciar();
  const b = mk(s.x - 3);
  for (let i = 0; i < 400; i++) { if (S.inventory.add('piedra', 10) > 0) break; } // mochila llena
  const m0 = sueltos(); V.liberar(b);
  out.llena = { nuevos: sueltos() - m0, manejo: b.rel.manejo, dom: b.rel.dom, equipo: Object.values(b.rel.equipo).filter(Boolean).length, almacen: b.rel.almacen.length };
  return out;
}, (r) => {
  if (r.error) return r.error;
  const a = r.conMochila, b = r.llena;
  if (a.mochila.join() !== '1,1,1' || a.nuevos !== 1 || a.manejo || a.dom || a.nivel > 2 || a.equipo !== 0) return 'liberar con mochila libre: ' + JSON.stringify(a);
  if (b.nuevos < 4 || b.manejo || b.dom || b.equipo !== 0 || b.almacen !== 0) return 'liberar con mochila llena (se perdió equipo): ' + JSON.stringify(b);
  return true;
});

// ---------------------------------------------------------------------------------- 6. monturas
await R('montura: solo con animal domesticado y equipado; la silla sigue al animal; trote, galope, giro, freno y bajada', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, p = T.p, c = T.c, M = c.montura, k = c.input.keys;
  T.limpia(); F.setGrace(0); T.vaciar(); k.clear();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0); S.stats.vida = 100;
  const out = {}, TAU = Math.PI * 2, sh = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const par = T.propia('parasaurolophus', s.x + 3, s.z + 4, { dom: true });
  out.sinSilla = M.puede(par).motivo;
  const ste = T.propia('stegosaurus', s.x - 8, s.z + 6, { dom: true }); out.stego = M.puede(ste).motivo; F.remove(ste);
  const man = T.propia('parasaurolophus', s.x + 12, s.z + 6, { dom: false }); out.sinDom = M.puede(man).motivo; F.remove(man);
  T.dar('montura_transporte'); out.equipa = V.equipar(par, S.slots.findIndex((x) => x?.item === 'montura_transporte')).ok;
  T.jug(s.x + 40, s.z, 0); out.lejos = M.puede(par).motivo;
  T.jug(par.position.x + 3, par.position.z, 0); par.setState('idle');
  // el rayo de apuntado no «ve» a la montura propia mientras vas montado (y sí antes)
  const rayo = () => {
    const o = p.eyePosition.clone(), h = par.sp.hit[0], sy = Math.sin(par.yaw), cy = Math.cos(par.yaw);
    const t = o.clone().set(par.position.x + h[0] * cy + h[2] * sy, par.position.y + h[1], par.position.z - h[0] * sy + h[2] * cy);
    return !!F.pick(o, t.sub(o).normalize(), 14);
  };
  T.avanza(0.1); par.setState('idle'); out.pickAntes = rayo();
  out.montar = M.montar(par).ok; T.avanza(0.5);
  out.montado = !!p.montura && par.jinete && par.state === 'ride' && M.activa === par;
  out.pickMontado = rayo();
  const err = () => { const a = M.ancla(par); return Math.hypot(p.position.x - a.x, p.position.z - a.z) + Math.abs(p.position.y - (a.y - 0.55)); };
  out.anclaQuieto = +err().toFixed(3);
  // trote hacia donde mira el jugador
  p.yaw = 0; k.add('KeyW'); T.avanza(2, 0.05);
  const a0 = { x: par.position.x, z: par.position.z }; let maxErr = 0;
  for (let i = 0; i < 100; i++) { T.avanza(0.05, 0.05); maxErr = Math.max(maxErr, err()); }
  const fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) }, dx = par.position.x - a0.x, dz = par.position.z - a0.z;
  out.trote = { v: +(Math.hypot(dx, dz) / 5).toFixed(2), alinea: +((dx * fwd.x + dz * fwd.z) / Math.hypot(dx, dz)).toFixed(2), maxErr: +maxErr.toFixed(3), walk: par.sp.vel.walk, run: par.sp.vel.run };
  // galope: más rápido y gasta energía
  k.add('ShiftLeft'); const e0 = par.energia; T.avanza(2, 0.05); const b0 = { x: par.position.x, z: par.position.z }; T.avanza(4, 0.05);
  out.galope = { v: +(Math.hypot(par.position.x - b0.x, par.position.z - b0.z) / 4).toFixed(2), energia: +(e0 - par.energia).toFixed(2) };
  k.delete('ShiftLeft');
  // desvío lateral con D: el rumbo converge a (yaw del jugador + π − 0.9)
  k.add('KeyD'); T.avanza(5, 0.05); out.giroD = +Math.abs(sh(par.yaw - (p.yaw + Math.PI - 0.9))).toFixed(2); k.delete('KeyD');
  // el ratón dirige: girar la vista 90° gira al animal
  p.yaw = Math.PI / 2; T.avanza(5, 0.05); out.giroRaton = +Math.abs(sh(par.yaw - (p.yaw + Math.PI))).toFixed(2);
  // freno
  k.delete('KeyW'); k.add('KeyS'); T.avanza(4, 0.05); out.freno = +par.speed.toFixed(2); k.delete('KeyS');
  out.xp = +S.saber.xp.manejo.toFixed(2);
  // bajar
  const ok = M.desmontar(); T.avanza(0.5);
  out.bajo = ok && !p.montura && !par.jinete && M.activa === null; out.dBaja = +T.dist(par, p).toFixed(1); out.vidaBaja = S.stats.vida; out.pickDespues = rayo();
  out.estado = par.state;
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (!/montura adecuada/.test(r.sinSilla)) return 'sin silla: ' + r.sinSilla;
  if (!/anatom/.test(r.stego)) return 'estegosaurio: ' + r.stego;
  if (!/domesticad/.test(r.sinDom)) return 'sin domesticar: ' + r.sinDom;
  if (!r.equipa || !/Acércate/.test(r.lejos)) return 'equipar/lejos: ' + JSON.stringify([r.equipa, r.lejos]);
  if (!r.pickAntes) return 'el control del rayo no alcanzó al animal sin montar';
  if (!r.montar || !r.montado) return 'no se pudo montar';
  if (r.pickMontado) return 'el rayo de apuntado alcanzó a la montura propia';
  if (r.anclaQuieto > 0.05 || r.trote.maxErr > 0.05) return `jinete desfasado de la silla: ${r.anclaQuieto} / ${r.trote.maxErr}`;
  const t = r.trote, vt = t.walk + (t.run - t.walk) * 0.55;
  if (t.v < vt * 0.7 || t.v > vt * 1.1 || t.alinea < 0.9) return `trote: ${JSON.stringify(t)} (esperado ≈ ${vt.toFixed(2)})`;
  if (r.galope.v < t.v * 1.12 || r.galope.v > t.run * 1.1 || r.galope.energia < 0.01) return 'galope: ' + JSON.stringify(r.galope);
  if (r.giroD > 0.2) return 'el desvío lateral no se aplicó: ' + r.giroD;
  if (r.giroRaton > 0.25) return 'el ratón no dirige al animal: ' + r.giroRaton;
  if (r.freno > 0.4) return 'no frenó: ' + r.freno;
  if (!(r.xp > 0)) return 'montar no dio experiencia de manejo';
  if (!r.bajo || r.dBaja < 1 || r.dBaja > 6 || r.vidaBaja !== 100 || !r.pickDespues) return 'bajada: ' + JSON.stringify([r.bajo, r.dBaja, r.vidaBaja, r.pickDespues]);
  return true;
});

await R('montura: no entra al agua ni sube pendientes imposibles; si el animal muere, el jinete cae y se hiere', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, p = T.p, c = T.c, M = c.montura, k = c.input.keys, w = c.world;
  T.limpia(); F.setGrace(0); T.vaciar(); k.clear();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const par = T.propia('parasaurolophus', s.x + 3, s.z + 4, { dom: true });
  T.dar('montura_transporte'); V.equipar(par, S.slots.findIndex((x) => x?.item === 'montura_transporte'));
  const out = {};
  // 1) buscar una orilla: tramo recto hacia el este, todo transitable hasta que deja de serlo
  let orilla = null;
  outer: for (let z = -440; z <= 440; z += 10) for (let x = -440; x <= 380; x += 10) {
    if (!par.walkable(x, z)) continue;
    let j = 0; while (j < 90 && par.walkable(x + j, z)) j++;
    if (j >= 25 && j < 90 && w.getHeight(x + j + 2, z) < 0.1) { orilla = { x, z, borde: x + j }; break outer; }
  }
  out.orilla = orilla;
  if (orilla) {
    F.remove(par); const q = T.propia('parasaurolophus', orilla.borde - 18, orilla.z, { dom: true });
    T.dar('montura_transporte'); V.equipar(q, S.slots.findIndex((x) => x?.item === 'montura_transporte'));
    T.sinSalvajes(q); T.jug(q.position.x - 3, q.position.z, 0); q.setState('idle'); q.yaw = -Math.PI / 2 + 0; // mira al este (+x)
    out.monta1 = M.montar(q).ok; p.yaw = -Math.PI / 2; k.add('KeyW'); k.add('ShiftLeft');
    let minH = 1e9; for (let i = 0; i < 400; i++) { T.avanza(0.05, 0.05); minH = Math.min(minH, w.getHeight(q.position.x, q.position.z)); }
    out.orilla2 = { x: +q.position.x.toFixed(1), borde: orilla.borde, minH: +minH.toFixed(2), nada: !!p.swimming, camino: +(q.position.x - (orilla.borde - 18)).toFixed(1) };
    k.clear(); M.desmontar(); T.avanza(0.3);
    out.baja = !p.montura;
    // 2) muerte del animal con el jugador encima
    T.jug(q.position.x - 3, q.position.z, 0); q.setState('idle'); out.monta2 = M.montar(q).ok; S.stats.vida = 100; T.avanza(0.3);
    const par2 = q; par2.damage(1e6, 'criatura'); T.avanza(0.5);
    out.muerte = { montado: !!p.montura, vida: +S.stats.vida.toFixed(1), jinete: par2.jinete, muerta: par2.muerta, activa: M.activa === null };
  }
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (!r.orilla) return 'no se encontró ninguna orilla para la prueba';
  if (!r.monta1) return 'no pudo montar junto a la orilla';
  if (r.orilla2.camino < 10) return 'el animal no se movió hacia la orilla: ' + JSON.stringify(r.orilla2);
  if (r.orilla2.x > r.orilla2.borde + 1.5 || r.orilla2.minH < 0.1 || r.orilla2.nada) return 'el animal montado entró en el agua: ' + JSON.stringify(r.orilla2);
  if (!r.baja || !r.monta2) return 'bajar/montar de nuevo';
  if (r.muerte.montado || r.muerte.jinete || !r.muerte.muerta || !r.muerte.activa) return 'tras la muerte seguía montado: ' + JSON.stringify(r.muerte);
  if (Math.abs(r.muerte.vida - 94) > 0.6) return 'la caída debía herir 6 puntos: ' + r.muerte.vida;
  return true;
});

await R('montura: gallimimus con montura ligera y bolsa (la más pequeña); el arnés solo no basta', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, p = T.p, c = T.c, M = c.montura;
  T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const g = T.propia('gallimimus', s.x + 2, s.z + 3, { dom: true });
  T.dar('arnes_cuero'); V.equipar(g, S.slots.findIndex((x) => x?.item === 'arnes_cuero'));
  const soloArnes = M.puede(g).motivo; out0: void 0;
  V.quitarEquipo(g, 'lomo');
  T.dar('montura_ligera'); const eq = V.equipar(g, S.slots.findIndex((x) => x?.item === 'montura_ligera')).ok;
  T.dar('bolsa_carga'); const bolsa = V.equipar(g, S.slots.findIndex((x) => x?.item === 'bolsa_carga')).ok;
  T.jug(g.position.x + 2, g.position.z, 0); g.setState('idle');
  const m = M.montar(g).ok; const nivel = V.nivelDe(g); T.avanza(1); const a = M.ancla(g);
  M.desmontar();
  return { soloArnes, eq, bolsa, m, nivel, ancla: a.y - g.position.y };
}, (r) => {
  if (r.error) return r.error;
  if (!/montura adecuada/.test(r.soloArnes)) return 'el arnés solo permitió montar: ' + r.soloArnes;
  if (!r.eq || !r.bolsa || !r.m || r.nivel !== 6) return JSON.stringify(r);
  if (r.ancla < 1.8 || r.ancla > 2.8) return 'altura de silla rara: ' + r.ancla;
  return true;
});

// ---------------------------------------------------------------------------------- 7. grandes depredadores: nunca mascotas obedientes
await R('depredadores: habituado deja de huir/atacar por defecto pero el hambre manda; ninguno llega a doméstico', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, p = T.p, c = T.c;
  T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const ATAQUE = new Set(['alert', 'stalk', 'chase', 'charge']);
  const prueba = (hab, hambre, provocado = false) => {
    T.limpia(); F.setGrace(0); T.jug(s.x + 300, s.z, 0); T.avanza(12); T.reset(); // deja que se disipen los ruidos de la prueba anterior
    const r = T.pon('tyrannosaurus', s.x, s.z - 11); r.rel.hab = hab; r.hambre = hambre; r.energia = 1;
    T.jug(s.x, s.z, 0); T.mira(s.x, s.z, r.position.x, r.position.z);
    let ataque = 0, minD = 1e9; const d0 = S.stats.vida;
    for (let i = 0; i < 80; i++) { T.avanza(0.5); T.cuida(); if (provocado && i === 4) r.provocado = 30; if (ATAQUE.has(r.state)) ataque++; minD = Math.min(minD, T.dist(r, p)); S.stats.hambre = 100; }
    return { ataque, minD: +minD.toFixed(1), estado: r.state, vida: S.stats.vida };
  };
  const out = {};
  out.salvajeSaciado = prueba(0, 0.1);
  out.habSaciado = prueba(1, 0.1);
  out.habHambriento = prueba(1, 0.9);
  out.habProvocado = prueba(1, 0.1, true);
  // un tiranosaurio nunca pasa del nivel de habituado: no admite cabestro ni cuidado
  const r = T.pon('tyrannosaurus', s.x + 60, s.z); r.rel.hab = 1; r.rel.conf = 1;
  out.nivel = V.nivelDe(r); out.manejo = V.puedeManejo(r); out.max = r.sp.doma.max; out.accion = V.accionE ? V.accionE(r) : null;
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (r.salvajeSaciado.ataque < 4) return 'el control salvaje no reaccionó: ' + JSON.stringify(r.salvajeSaciado);
  if (r.habSaciado.ataque > 2 || r.habSaciado.vida < 100) return 'habituado y saciado atacó: ' + JSON.stringify(r.habSaciado);
  if (r.habHambriento.ataque < 4) return 'habituado y hambriento no cazó: ' + JSON.stringify(r.habHambriento);
  if (r.habProvocado.ataque < 4) return 'habituado y provocado no respondió: ' + JSON.stringify(r.habProvocado);
  if (r.nivel !== 3 || r.max > 3 || (r.manejo && r.manejo.ok)) return 'el tiranosaurio llegó más allá de habituado: ' + JSON.stringify([r.nivel, r.max, r.manejo]);
  return true;
});

await R('niveles: alertado (2) solo mientras reacciona al jugador; propio (4) vs habituado (3) en el aviso de vigía; anquilosaurio nunca se domestica', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, p = T.p, c = T.c;
  T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  const out = {};
  // nivel 2
  const g = T.pon('gallimimus', s.x, s.z - 90); T.jug(s.x, s.z, 0); T.mira(s.x, s.z, g.position.x, g.position.z); // más allá de su vista (60 m)
  T.avanza(2); out.n1 = V.nivelDe(g);
  p.sprinting = true; T.jug(g.position.x, g.position.z + 10, 0); p.sprinting = true; T.mira(p.position.x, p.position.z, g.position.x, g.position.z);
  let n2 = false; for (let i = 0; i < 100 && !n2; i++) { T.avanza(0.1, 0.05); p.sprinting = true; if (V.nivelDe(g) === 2) n2 = true; } // hasta 10 s: la percepción no es instantánea
  out.n2 = n2; out.estado = g.state;
  T.jug(g.position.x, g.position.z + 120, 0); T.avanza(12); out.nDespues = V.nivelDe(g);
  // 3 vs 4
  T.limpia(); F.setGrace(0);
  const h = T.pon('gallimimus', s.x + 20, s.z); h.rel.hab = 1; const o = T.propia('gallimimus', s.x - 20, s.z, { dom: false });
  T.jug(s.x, s.z, 0); T.avanza(1); out.v3 = h.vinculo; out.v4 = o.vinculo;
  // anquilosaurio: bajo manejo sí; domesticado nunca, aunque pasen muchos días
  const a = T.propia('ankylosaurus', s.x, s.z + 20, { dom: false }); T.jug(s.x, s.z + 14, 0);
  const t0 = c.time.elapsed; for (let i = 0; i < 100; i++) { T.sinSalvajes(a); T.avanza(30, 0.5); T.cuida(); if (a.rel.hambre > 0) 0; a.hambre = 0.3; }
  out.anq = { nivel: V.nivelDe(a), dom: a.rel.dom, cuid: a.rel.cuid, dias: +((c.time.elapsed - t0) / c.config.time.dayLengthSec).toFixed(1), max: a.sp.doma.max };
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (r.n1 !== 1) return 'salvaje tranquilo no es nivel 1: ' + r.n1;
  if (!r.n2) return `no llegó a nivel 2 con el jugador corriendo cerca (estado ${r.estado})`;
  if (r.nDespues !== 1) return 'el nivel 2 no se disipó: ' + r.nDespues;
  if (r.v3 !== 3 || r.v4 !== 4) return `vínculo habituado/propio: ${r.v3}/${r.v4}`;
  if (r.anq.dom || r.anq.nivel !== 4 || r.anq.max !== 4 || r.anq.dias < 1.5) return 'anquilosaurio: ' + JSON.stringify(r.anq);
  return true;
});

// ---------------------------------------------------------------------------------- 8. guardado
await R('guardado: animales propios y habituados (nombre, orden, equipo, carga, nivel) vuelven tras cargar; partidas antiguas sin fauna no fallan', () => {
  const T = window.__T, F = T.F, V = T.V, S = T.S, p = T.p, c = T.c;
  T.limpia(); F.setGrace(0); T.vaciar();
  const s = T.site(); if (!s) return { error: 'sin sitio' };
  T.jug(s.x, s.z, 0);
  const par = T.propia('parasaurolophus', s.x + 4, s.z + 4, { dom: true, orden: 'quedarse' });
  par.rel.nombre = 'Peluso'; par.rel.hogar = { x: par.position.x, z: par.position.z }; par.hp = par.hpMax * 0.7;
  T.dar('montura_transporte'); V.equipar(par, S.slots.findIndex((x) => x?.item === 'montura_transporte'));
  T.dar('alforjas'); V.equipar(par, S.slots.findIndex((x) => x?.item === 'alforjas'));
  T.dar('piedra', 12); const gd = V.guardar(par, S.slots.findIndex((x) => x?.item === 'piedra'));
  const hab = T.pon('gallimimus', s.x - 30, s.z); hab.rel.hab = 1;
  const sal = T.pon('stegosaurus', s.x, s.z - 60); // salvaje cualquiera: no se guarda
  const antes = { x: par.position.x, z: par.position.z, hp: par.hp, nivel: V.nivelDe(par), n: F.serializar().length, guardo: gd.ok };
  S.save(true);
  F.clear(); T.reset();
  const vacio = F.propios().length;
  const okLoad = S.load();
  const p2 = F.propios()[0], h2 = F.creatures.find((x) => x.especie === 'gallimimus' && x.rel.hab >= 1);
  const out = { antes, vacio, okLoad, propios: F.propios().length, total: F.creatures.length };
  if (p2) {
    out.p = { e: p2.especie, dom: p2.rel.dom, manejo: p2.rel.manejo, nombre: p2.rel.nombre, orden: p2.rel.orden, lomo: p2.rel.equipo.lomo?.item, carga: p2.rel.equipo.carga?.item, cabeza: p2.rel.equipo.cabeza?.item, almacen: p2.rel.almacen.map((a) => a.item + '×' + a.cantidad), nivel: V.nivelDe(p2), hp: +(p2.hp / p2.hpMax).toFixed(2), d: +Math.hypot(p2.position.x - antes.x, p2.position.z - antes.z).toFixed(1), cuid: p2.rel.cuid, hogar: !!p2.rel.hogar };
  }
  out.hab = h2 ? { hab: h2.rel.hab, nivel: V.nivelDe(h2) } : null;
  out.salvajes = F.creatures.filter((x) => x.especie === 'stegosaurus').length;
  // partida antigua (sin campo fauna)
  out.clave = 'isla-primordial:partida:v1';
  const raw = JSON.parse(localStorage.getItem(out.clave) ?? 'null');
  if (raw && out.clave) { delete raw.fauna; localStorage.setItem(out.clave, JSON.stringify(raw)); out.antigua = S.load(); out.propiosAntigua = F.propios().length; }
  // mover al animal a mano y comprobar que no queda nada colgado
  out.nan = F.creatures.some((x) => !Number.isFinite(x.position.x + x.position.y + x.position.z + x.hp));
  return out;
}, (r) => {
  if (r.error) return r.error;
  if (!r.antes.guardo) return 'no se pudo guardar la carga antes de salvar';
  if (r.antes.n !== 2) return 'serializar debía incluir propio + habituado: ' + r.antes.n;
  if (r.vacio !== 0 || !r.okLoad || r.propios !== 1) return `carga: ${JSON.stringify([r.vacio, r.okLoad, r.propios])}`;
  const p = r.p; if (!p) return 'no volvió el animal propio';
  if (p.e !== 'parasaurolophus' || !p.dom || !p.manejo || p.nombre !== 'Peluso' || p.orden !== 'quedarse' || p.lomo !== 'montura_transporte' || p.carga !== 'alforjas' || p.nivel !== 6) return 'estado restaurado incorrecto: ' + JSON.stringify(p);
  if (p.almacen.join() !== 'piedra×12') return 'carga restaurada: ' + p.almacen.join();
  if (p.d > 2 || Math.abs(p.hp - 0.7) > 0.03 || !p.hogar) return 'posición/vida/hogar: ' + JSON.stringify(p);
  if (!r.hab || r.hab.hab < 1 || r.hab.nivel !== 3) return 'el habituado no volvió: ' + JSON.stringify(r.hab);
  if (r.salvajes !== 0) return 'se restauró fauna salvaje cualquiera';
  if (r.antigua !== true || r.propiosAntigua !== 0) return 'partida antigua: ' + JSON.stringify([r.antigua, r.propiosAntigua, r.clave]);
  if (r.nan) return 'valores no finitos tras cargar';
  return true;
});

// ---------------------------------------------------------------------------------- 9. estabilidad
await R('estabilidad: tras todo lo anterior no hay valores no finitos ni criaturas rotas', () => {
  const T = window.__T, F = T.F, c = T.c;
  T.avanza(20);
  const malas = F.creatures.filter((x) => ![x.position.x, x.position.y, x.position.z, x.hp, x.hambre, x.energia, x.yaw, x.rel?.hab, x.rel?.conf, x.rel?.cuid].every((v) => v === undefined || Number.isFinite(v)));
  return { n: F.creatures.length, malas: malas.length, jug: [c.player.position.x, c.player.position.y, c.player.position.z].every(Number.isFinite) };
}, (r) => (r.malas === 0 && r.jug ? true : JSON.stringify(r)));

console.log('\nRESUMEN:', results.filter((r) => r.ok).length + '/' + results.length, 'OK');
console.log('ERRORES de consola/página:', errs.length ? errs.slice(0, 6) : 'ninguno');
await browser.close(); server.kill();
process.exit(results.every((r) => r.ok) && !errs.length ? 0 : 1);
