#!/usr/bin/env node
// Prueba automática en navegador de la Etapa 2: inventario con peso/volumen/durabilidad, las 35 recetas, aprendizaje, ropa y armadura,
// combate cuerpo a cuerpo y a distancia (arco, honda, jabalina), reparación, despiece de cadáveres y guardado (v2 y migración desde v1).
// No renderiza: solo simula con window.__game (?debug=1).   Uso: node tools/craft-test.mjs [regex de escenario]
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

await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, S = c.survival;
  const M = await import('/src/core/items.js');
  const T = window.__T = { M, g, c, p, F, S, ev: [] };
  for (const n of ['crafted', 'saber:aprendido', 'saber:nivel', 'item:roto', 'proyectil:impacto', 'proyectil:roto', 'proyectil:disparado', 'despiece', 'player:target', 'equipo:cambio'])
    c.events.on(n, (e) => T.ev.push({ n, ...e }));
  T.evs = (n) => T.ev.filter((e) => e.n === n);
  T.limpiaEv = () => { T.ev.length = 0; };
  c.render = () => {};
  c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
  // mochila y conocimiento a cero (las fogatas colocadas se conservan)
  T.limpiar = () => {
    S.slots.fill(null); for (const r of M.RANURAS) S.equipo[r] = null;
    S.saber.reset(); S.stats.vida = 100; S.stats.hambre = 100; S.stats.sed = 100; S.stats.energia = 100;
    S.select(0); T.limpiaEv();
  };
  T.sabeTodo = () => { for (const r of M.RECIPES) S.saber.conocidas.add(r.clave); };
  T.site = () => {
    if (T._site) return T._site;
    const w = c.world;
    for (let x = -480; x <= 480; x += 16) for (let z = -480; z <= 480; z += 16) {
      if (w.getBiome(x, z) !== 'pradera' || w.colliders.query(x, z, 22, []).length) continue;
      let ok = true, lo = 1e9, hi = -1e9;
      for (let dx = -40; dx <= 40 && ok; dx += 20) for (let dz = -40; dz <= 40; dz += 20) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5) { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (ok && hi - lo < 5) return (T._site = { x, z });
    }
    return null;
  };
  T.jug = (x, z) => { p.teleport(x, z); p.velocity.set(0, 0, 0); p.crouching = false; p.sprinting = false; S.heal(100); g.advance(2, 1 / 60); }; // el avance deja la cámara en su sitio
  // apunta al punto; con `vel` (m/s) compensa la caída del proyectil como haría un jugador
  T.mira = (tx, ty, tz, vel = 0) => {
    const e = p.position, ey = e.y + 1.7, dx = tx - e.x, dz = tz - e.z, h = Math.hypot(dx, dz);
    const caida = vel ? 0.5 * 9.8 * (h / vel) ** 2 : 0;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(ty + caida - ey, h); g.advance(1, 1 / 60);
  };
  T.pulsa = () => c.events.emit('input:action', { action: 'usar', pressed: true });
  T.avanza = (seg, dt = 1 / 60) => g.advance(Math.max(1, Math.round(seg / dt)), dt);
  T.slotDe = (item) => S.slots.findIndex((s) => s && s.item === item);
  T.sostiene = (item) => { const i = T.slotDe(item); if (i < 0) throw new Error('no tiene ' + item); S.select(i); return S.slots[i]; };
  T.herrDe = { corta: 'cuchillo_piedra', perfora: 'punzon_hueso', talar: 'hacha_piedra', picar: 'pico_piedra', martillar: 'martillo_piedra' };
});

const results = [];
const R = async (label, fn, check, arg) => {
  if (only && !only.test(label)) return;
  const t0 = Date.now();
  let r; try { r = await page.evaluate(fn, arg); } catch (e) { r = { error: String(e).slice(0, 400) }; }
  let ok = true, why = '';
  try { const v = check(r); ok = v === true; why = v === true ? '' : v; } catch (e) { ok = false; why = 'check: ' + e.message; }
  results.push({ label, ok });
  console.log(`${ok ? '✔' : '✘'} ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${ok ? '' : '→ ' + why}\n    ${JSON.stringify(r).slice(0, 600)}`);
};
const sinError = (r) => (r && r.error ? r.error : null);

// ============================================================================ 1. TODAS LAS RECETAS
await R('recetas: las 35 se fabrican (consumen, producen, desgastan herramienta, dan XP y evento)', async () => {
  const T = window.__T, { S, c, p, M } = T, fallos = [];
  // fogata encendida cerca para las recetas con estación
  T.limpiar(); const s = T.site(); T.jug(s.x, s.z);
  S.inventory.add('madera', 6); S.inventory.add('piedra', 4); S.inventory.add('pedernal', 1); T.sabeTodo();
  S.use(T.slotDe('fogata') >= 0 ? T.slotDe('fogata') : -1);
  S.craft('fogata'); S.select(T.slotDe('fogata')); S.use(T.slotDe('fogata')); T.avanza(2);
  const fuego = S.nearFire();
  let n = 0;
  for (const r of M.RECIPES) {
    T.limpiar(); T.sabeTodo(); T.jug(s.x, s.z);
    S.saber.xp[r.hab.tipo] = M.NIVEL_XP[r.hab.nivel];
    for (const [m, q] of Object.entries(r.costo)) S.inventory.add(m, q);
    if (r.herramienta) S.inventory.add(T.herrDe[r.herramienta], 1);
    const antes = Object.fromEntries(Object.keys(r.costo).map((m) => [m, S.inventory.count(m)]));
    const prodAntes = S.inventory.count(r.id), xpAntes = S.saber.xp[r.hab.tipo];
    const ti = r.herramienta ? S.inventory.mejorConEtiqueta(r.herramienta) : -1, durAntes = ti >= 0 ? S.slots[ti].dur : null, toolItem = ti >= 0 ? S.slots[ti].item : null;
    T.limpiaEv();
    const info = S.recipeInfo(r);
    const ok = S.craft(r.clave);
    const e = [];
    if (!info.posible) e.push('recipeInfo dice que no es posible: ' + info.motivo);
    if (!ok) e.push('craft devolvió false');
    else {
      for (const [m, q] of Object.entries(r.costo)) {
        const ya = m === toolItem ? 0 : 0; // la herramienta no es material
        const esperado = antes[m] - q + ya + (m === r.id ? r.cantidad : 0);
        if (S.inventory.count(m) !== esperado && m !== r.id) e.push(`${m}: ${S.inventory.count(m)} ≠ ${esperado}`);
      }
      if (S.inventory.count(r.id) - prodAntes !== r.cantidad && !(r.id in r.costo)) e.push(`producto +${S.inventory.count(r.id) - prodAntes} ≠ ${r.cantidad}`);
      const evt = T.evs('crafted').find((x) => x.clave === r.clave);
      if (!evt) e.push('sin evento crafted');
      if (Math.abs(S.saber.xp[r.hab.tipo] - xpAntes - r.xp) > 1e-6) e.push(`xp +${S.saber.xp[r.hab.tipo] - xpAntes} ≠ ${r.xp}`);
      if (ti >= 0) { const t2 = S.slots.find((x) => x && x.item === toolItem && x.dur != null && x.dur < durAntes); if (!t2 || t2.dur !== durAntes - 1) e.push(`herramienta sin desgaste (${durAntes} → ${t2?.dur})`); }
      if (M.ITEMS[r.id].dur) {
        const inst = S.slots.find((x) => x && x.item === r.id && x.dur != null);
        if (!inst || !(inst.cal >= 0 && inst.cal <= 3) || inst.dur !== S.durMaxDe(r.id, inst.cal, 0)) e.push('instancia sin durabilidad/calidad válida');
      }
    }
    if (e.length) fallos.push(`${r.clave}: ${e.join('; ')}`); else n++;
  }
  return { ok: n, total: M.RECIPES.length, fuego, fallos };
}, (r) => sinError(r) ?? (r.fuego && r.fallos.length === 0 && r.ok === r.total ? true : r.fallos.slice(0, 5).join(' | ') || 'sin fogata'));

// ============================================================================ 2. REHÚSOS
await R('recetas: se rechazan sin saberla / sin materiales / sin herramienta / sin nivel / sin fogata, y no consumen nada', () => {
  const T = window.__T, { S, M, p } = T, fuera = {};
  const foto = () => JSON.stringify(S.slots.map((s) => s && [s.item, s.cantidad]));
  // sin saberla
  T.limpiar(); S.inventory.add('rama', 3); S.inventory.add('fibra', 8); S.inventory.add('cuchillo_piedra', 1); S.saber.conocidas.delete('arco'); S.saber.conocidas.delete('cuerda');
  S.inventory.add('cuerda', 2); S.saber.conocidas.delete('arco'); let f = foto(); fuera.desconocida = { ok: S.craft('arco'), igual: foto() === f, motivo: S.recipeInfo(M.RECIPES.find((r) => r.clave === 'arco')).motivo };
  // sin materiales (le falta 1)
  T.limpiar(); T.sabeTodo(); S.inventory.add('madera', 3); S.inventory.add('piedra', 1); S.inventory.add('fibra', 3); f = foto(); fuera.materiales = { ok: S.craft('hacha_piedra'), igual: foto() === f };
  // sin herramienta
  T.limpiar(); T.sabeTodo(); S.inventory.add('hueso', 1); S.inventory.add('fibra', 2); S.inventory.add('resina', 1); f = foto(); fuera.herramienta = { ok: S.craft('cuchillo_hueso'), igual: foto() === f, motivo: S.recipeInfo(M.RECIPES.find((r) => r.clave === 'cuchillo_hueso')).motivo };
  // sin nivel
  T.limpiar(); T.sabeTodo(); S.inventory.add('diente', 1); S.inventory.add('madera', 1); S.inventory.add('resina', 1); S.inventory.add('cuchillo_piedra', 1); f = foto(); fuera.nivel = { ok: S.craft('cuchillo_diente'), igual: foto() === f, motivo: S.recipeInfo(M.RECIPES.find((r) => r.clave === 'cuchillo_diente')).motivo };
  // sin fogata cerca
  T.limpiar(); T.sabeTodo(); const s = T.site(); T.jug(s.x + 300, s.z); S.inventory.add('carne_cruda', 1); f = foto(); fuera.estacion = { ok: S.craft('carne_cocida'), igual: foto() === f, motivo: S.recipeInfo(M.RECIPES.find((r) => r.clave === 'carne_cocida')).motivo, fuegoCerca: S.nearFire() };
  return fuera;
}, (r) => sinError(r) ?? (Object.entries(r).every(([k, v]) => v.ok === false && v.igual === true) && r.desconocida.motivo === 'desconocida' && r.herramienta.motivo === 'herramienta' && r.nivel.motivo === 'nivel' && r.estacion.motivo === 'estacion' ? true : 'alguno se fabricó o consumió: ' + JSON.stringify(r)));

// ============================================================================ 3. APRENDIZAJE EN JUEGO
await R('aprendizaje: tener una rama enseña el arco; fabricar el arco enseña la flecha; despiezar un triceratops enseña la lanza de cuerno', () => {
  const T = window.__T, { S, F } = T; T.limpiar();
  const a = { arcoAntes: S.saber.conoce('arco'), flechaAntes: S.saber.conoce('flecha_madera') };
  S.inventory.add('rama', 5); a.arcoTrasRama = S.saber.conoce('arco'); a.evento = T.evs('saber:aprendido').map((e) => e.clave);
  S.inventory.add('cuerda', 2); S.inventory.add('cuchillo_piedra', 1); S.craft('arco');
  a.flechaTrasArco = S.saber.conoce('flecha_madera');
  const s = T.site(); T.jug(s.x, s.z);
  const tri = F.spawnAt('triceratops', s.x + 6, s.z, { frozen: true }); a.lanzaAntes = S.saber.conoce('lanza_cuerno');
  tri.damage(1e6, 'jugador'); F.despiezar(tri); a.lanzaTras = S.saber.conoce('lanza_cuerno');
  const info = S.recipeInfo(S.recipes.find((r) => r.clave === 'arco'));
  a.noRepite = (() => { T.limpiaEv(); S.inventory.add('rama', 1); return T.evs('saber:aprendido').length; })();
  return a;
}, (r) => sinError(r) ?? (!r.arcoAntes && !r.flechaAntes && r.arcoTrasRama && r.evento.includes('arco') && r.flechaTrasArco && !r.lanzaAntes && r.lanzaTras && r.noRepite === 0 ? true : 'aprendizaje incorrecto'));

await R('oficios: fabricar da experiencia, sube de nivel y mejora la calidad media', () => {
  const T = window.__T, { S, M } = T; T.limpiar(); T.sabeTodo();
  const niveles = [], cal = { bajo: [], alto: [] };
  for (let i = 0; i < 12; i++) { // nivel 0: cuchillos de piedra (talla 0)
    S.inventory.add('piedra', 1); S.inventory.add('madera', 1); S.inventory.add('fibra', 2); S.craft('cuchillo_piedra'); niveles.push(S.saber.nivel('talla'));
    const k = S.slots.findIndex((x) => x && x.item === 'cuchillo_piedra'); cal.bajo.push(S.slots[k].cal); S.slots[k] = null;
  }
  const subio = T.evs('saber:nivel').length;
  S.saber.xp.talla = M.NIVEL_XP[4];
  for (let i = 0; i < 12; i++) { S.inventory.add('piedra', 1); S.inventory.add('madera', 1); S.inventory.add('fibra', 2); S.craft('cuchillo_piedra'); const k = S.slots.findIndex((x) => x && x.item === 'cuchillo_piedra'); cal.alto.push(S.slots[k].cal); S.slots[k] = null; }
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { niveles, subio, calBaja: m(cal.bajo), calAlta: m(cal.alto) };
}, (r) => sinError(r) ?? (r.niveles[r.niveles.length - 1] >= 1 && r.subio >= 1 && r.calAlta > r.calBaja ? true : 'no subió de nivel o la calidad no mejora'));

// ============================================================================ 4. DURABILIDAD, ROTURA, REPARACIÓN
await R('durabilidad: la herramienta se gasta al usarla, se rompe en 0 y desaparece del equipo', () => {
  const T = window.__T, { S, c, p } = T; T.limpiar();
  const s = T.site(); T.jug(s.x, s.z);
  S.inventory.add('hacha_piedra', 1); const h = T.sostiene('hacha_piedra'); const dur0 = h.dur; h.dur = 2;
  // un árbol cerca
  const arbol = c.flora.getHarvestablesNear(p.position, 120, []).find((e) => e.tipo === 'arbol'); if (!arbol) return { error: 'sin árbol' };
  T.jug(arbol.it.x + 1.7, arbol.it.z); T.mira(arbol.it.x, arbol.it.y + 1.6, arbol.it.z);
  const m0 = S.inventory.count('madera'); T.limpiaEv(); T.pulsa(); T.avanza(0.8); const tras1 = T.slotDe('hacha_piedra') >= 0 ? S.slots[T.slotDe('hacha_piedra')].dur : null;
  const m1 = S.inventory.count('madera'); T.pulsa(); T.avanza(0.8);
  return { dur0, tras1, madera: [m0, m1, S.inventory.count('madera')], rota: T.evs('item:roto').map((e) => e.item), sigue: T.slotDe('hacha_piedra'), equipado: S.equipped };
}, (r) => sinError(r) ?? (r.dur0 === 70 && r.tras1 === 1 && r.madera[1] >= 2 && r.rota.includes('hacha_piedra') && r.sigue === -1 && r.equipado === null ? true : 'desgaste/rotura incorrectos'));

await R('reparación: consume materiales, devuelve durabilidad, resta máximo y tiene tope de 4', () => {
  const T = window.__T, { S } = T; T.limpiar();
  S.inventory.add('hacha_piedra', 1); const i = T.slotDe('hacha_piedra'), s = S.slots[i]; s.dur = 10;
  S.inventory.add('piedra', 6); S.inventory.add('fibra', 6);
  const max0 = S.durMaxDe('hacha_piedra', s.cal, 0), pasos = [];
  for (let k = 0; k < 5; k++) { s.dur = 5; const ok = S.reparar(i); pasos.push({ ok, dur: Math.round(s.dur), rep: s.rep, max: S.durMaxDe('hacha_piedra', s.cal, s.rep) }); }
  const sinMat = (() => { S.inventory.remove('piedra', S.inventory.count('piedra')); const t = S.slots[i]; t.rep = 0; t.dur = 5; return S.reparar(i); })();
  const intacto = (() => { S.inventory.add('piedra', 1); S.slots[i].dur = S.durMaxDe('hacha_piedra', S.slots[i].cal, S.slots[i].rep); return S.reparar(i); })();
  return { max0, pasos, sinMat, intacto, material: [S.inventory.count('piedra'), S.inventory.count('fibra')] };
}, (r) => sinError(r) ?? (r.pasos.slice(0, 4).every((x) => x.ok) && r.pasos[4].ok === false && r.pasos[3].rep === 4 && r.pasos[3].max < r.max0 && r.pasos[0].dur > 5 && r.sinMat === false && r.intacto === false ? true : 'reparación incorrecta'));

// ============================================================================ 5. PESO Y VOLUMEN
await R('carga: el peso lento reduce la velocidad, el volumen es tope duro, la mochila de cuero amplía capacidad', () => {
  const T = window.__T, { S, c, p, M } = T; T.limpiar();
  const base = S.inventory.capacidad(), v0 = c.config.player.walkSpeed; T.avanza(0.1);
  let n = 0; while (S.inventory.cabe('piedra', 1) > 0 && n < 400) { S.inventory.add('piedra', 1); n++; }
  T.avanza(0.2); const lleno = { peso: S.inventory.peso(), vol: S.inventory.volumen(), factor: S.cargaFactor, vel: c.config.player.walkSpeed, n };
  const tope = S.inventory.add('piedra', 5); // ya no entra
  S.slots.fill(null); T.avanza(0.2); const libre = { factor: S.cargaFactor, vel: c.config.player.walkSpeed };
  S.inventory.add('mochila_cuero', 1); S.equipar(T.slotDe('mochila_cuero')); const cap2 = S.inventory.capacidad();
  return { base, v0, lleno, tope, libre, cap2, equipada: S.equipo.espalda?.item };
}, (r) => sinError(r) ?? (r.base.peso === 60 && r.lleno.factor < 1 && r.lleno.factor >= 0.55 && r.lleno.vel < r.v0 && r.tope === 5 && r.libre.factor === 1 && r.cap2.peso === 90 && r.cap2.volumen === 210 && r.equipada === 'mochila_cuero' ? true : 'carga incorrecta'));

// ============================================================================ 6. ROPA
await R('ropa: la armadura reduce el daño de criaturas (no el del frío), se desgasta, cambia ruido y abrigo', () => {
  const T = window.__T, { S } = T; T.limpiar();
  const perdida = (fn) => { S.stats.vida = 100; fn(); return 100 - S.stats.vida; };
  const sin = perdida(() => S.damage(30, 'bicho', { armadura: true }));
  S.inventory.add('peto_osteodermo', 1); const ok1 = S.equipar(T.slotDe('peto_osteodermo'));
  const durAntes = S.equipo.torso.dur, A = S.armadura();
  const con = perdida(() => S.damage(30, 'bicho', { armadura: true }));
  const frio = perdida(() => S.damage(30, 'Frío'));
  const desgaste = durAntes - S.equipo.torso.dur;
  const ruido = S.ruidoMul, abrigo = S.abrigo();
  S.inventory.add('chaleco_cuero', 1); const ok2 = S.equipar(T.slotDe('chaleco_cuero')); // reemplaza al peto: el peto vuelve a la mochila
  const vuelve = T.slotDe('peto_osteodermo') >= 0;
  const q = ok2 ? S.equipo.torso.item : null;
  const quita = S.desequipar('torso');
  return { sin, con, frio, ok1, A, desgaste, ruido, abrigo, ok2, vuelve, q, quita, vacio: S.equipo.torso };
}, (r) => sinError(r) ?? (Math.abs(r.sin - 30) < 1e-6 && r.con < r.sin * 0.8 && Math.abs(r.frio - 30) < 1e-6 && r.A > 10 && r.desgaste > 0 && Math.abs(r.ruido - 1.35) < 1e-6 && r.ok2 && r.vuelve && r.q === 'chaleco_cuero' && r.quita && r.vacio === null ? true : 'armadura o intercambio de ropa incorrecto'));

await R('ropa: abrigo sube la temperatura en frío y la capa de piel impermeabiliza', () => {
  const T = window.__T, { S, c } = T; T.limpiar();
  c.time.hour = 3; // noche fría
  const medir = () => { S.stats.temperatura = 15; T.avanza(20); return S.stats.temperatura; };
  const desnudo = medir();
  S.inventory.add('chaleco_cuero', 1); S.inventory.add('capucha_cuero', 1); S.inventory.add('pantalon_cuero', 1);
  for (const it of ['chaleco_cuero', 'capucha_cuero', 'pantalon_cuero']) S.equipar(T.slotDe(it));
  const vestido = medir();
  S.inventory.add('capa_piel', 1); const imp0 = T.slotDe('capa_piel') >= 0;
  return { desnudo, vestido, abrigo: S.abrigo(), imp0 };
}, (r) => sinError(r) ?? (r.vestido > r.desnudo && r.abrigo > 4 ? true : `no abriga: ${r.desnudo} vs ${r.vestido}`));

// ============================================================================ 7. COMBATE CUERPO A CUERPO
await R('melé: el arma en mano fija daño, alcance y desgaste; el golpe hace ruido; los puños no desgastan', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z);
  S.inventory.add('lanza', 1); const l = T.sostiene('lanza'); const dur0 = l.dur;
  const bicho = F.spawnAt('stegosaurus', s.x, s.z - 2.5, { frozen: true }); bicho.yaw = 0;
  const hp0 = bicho.hp; T.mira(bicho.position.x, bicho.position.y + 1.4, bicho.position.z);
  p.ruidoExtra = 0; T.pulsa(); const ruido = p.ruidoExtra, perfil = F.sentidos.perfilJugador().ruido; T.avanza(0.3);
  const d1 = hp0 - bicho.hp;
  const durTras = S.slots[T.slotDe('lanza')].dur;
  // lejos (por encima del alcance de la lanza) no golpea
  T.jug(bicho.position.x, bicho.position.z + 10); T.mira(bicho.position.x, bicho.position.y + 1.4, bicho.position.z); T.avanza(1); const hp1 = bicho.hp; T.pulsa(); T.avanza(0.3); const lejos = hp1 - bicho.hp;
  // puños
  S.slots.fill(null); S.select(0); T.jug(s.x, s.z); T.mira(bicho.position.x, bicho.position.y + 1.4, bicho.position.z); T.avanza(1); const hp2 = bicho.hp; T.pulsa(); T.avanza(0.4);
  return { d1, esperado: 28, dur0, durTras, ruido, perfil, lejos, punos: hp2 - bicho.hp };
}, (r) => sinError(r) ?? (Math.abs(r.d1 - 28) < 1.5 && r.durTras === r.dur0 - 1 && r.ruido >= 0.5 && r.perfil >= r.ruido - 0.01 && r.lejos === 0 && r.punos > 0 && r.punos < 8 ? true : 'combate de melé incorrecto'));

await R('melé: la penetración del arma reduce la coraza natural del anquilosaurio', () => {
  const T = window.__T, { S, F, p } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z);
  const a = F.spawnAt('ankylosaurus', s.x, s.z); a.yaw = 0; T.avanza(1.5);
  const frente = (pen) => { a.hp = a.hpMax; T.jug(a.position.x + Math.sin(a.yaw) * 6, a.position.z + Math.cos(a.yaw) * 6); F.damage(a, 30, 'jugador', { penetra: pen }); const d = a.hpMax - a.hp; a.hp = a.hpMax; return d; };
  const r = { sin: frente(0), media: frente(0.2), alta: frente(0.4), armadura: a.armaduraF };
  return r;
}, (r) => sinError(r) ?? (r.armadura > 0.4 && r.sin < r.media && r.media < r.alta ? true : 'la penetración no aumenta el daño'));

// ============================================================================ 8. COMBATE A DISTANCIA
await R('arco: carga, consume una flecha, la flecha vuela, impacta, daña, y se recupera o se rompe', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z);
  S.inventory.add('arco', 1); S.inventory.add('flecha_madera', 12);
  const arco = T.sostiene('arco'), dur0 = arco.dur;
  const bicho = F.spawnAt('stegosaurus', s.x, s.z - 14, { frozen: true }); bicho.yaw = 0; T.avanza(0.3);
  const hp0 = bicho.hp; let n = 0, hits = 0, rotas = 0, drops = 0;
  for (let k = 0; k < 6; k++) {
    T.limpiaEv(); T.mira(bicho.position.x, bicho.position.y + 1.9, bicho.position.z, 46);
    const flechas = S.inventory.count('flecha_madera'); T.pulsa(); T.avanza(0.2);
    const aun = c.proyectiles.lista.length === 0 ? 'sin proyectil aún (carga)' : 'volando';
    T.avanza(1.6);
    if (S.inventory.count('flecha_madera') === flechas - 1) n++;
    hits += T.evs('proyectil:impacto').filter((e) => e.en === 'criatura').length;
    rotas += T.evs('proyectil:roto').length;
  }
  drops = c.physics.list.filter((q) => q.kind === 'loot' && q.data?.item === 'flecha_madera').length;
  return { disparos: n, hits, rotas, drops, danio: hp0 - bicho.hp, flechasQuedan: S.inventory.count('flecha_madera'), durArco: [dur0, S.slots[T.slotDe('arco')].dur], vuelanAun: c.proyectiles.lista.length };
}, (r) => sinError(r) ?? (r.disparos === 6 && r.hits >= 4 && r.danio > 20 && r.flechasQuedan === 6 && r.durArco[1] === r.durArco[0] - 6 && r.vuelanAun === 0 && r.hits - r.rotas <= r.drops + 1 ? true : 'arco incorrecto'));

await R('arco: sin munición no dispara; el daño de la flecha de hueso supera al de madera y penetra más', () => {
  const T = window.__T, { S, F, p, c, M } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z); S.inventory.add('arco', 1); T.sostiene('arco'); T.limpiaEv();
  T.mira(s.x, 2, s.z - 20); T.pulsa(); T.avanza(1.2); const sin = T.evs('proyectil:disparado').length;
  const dm = M.ITEMS.flecha_madera, dh = M.ITEMS.flecha_hueso, dp = M.ITEMS.flecha_piedra;
  return { sin, madera: dm.dano, piedra: dp.dano, hueso: dh.dano, penetraHueso: dh.penetra, penetraMadera: dm.penetra ?? 0 };
}, (r) => sinError(r) ?? (r.sin === 0 && r.madera < r.piedra && r.piedra <= r.hueso && r.penetraHueso > r.penetraMadera ? true : 'munición mal'));

await R('honda: dispara guijarros (consume 1) y daña', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z); S.inventory.add('honda', 1); S.inventory.add('guijarro', 10); T.sostiene('honda');
  const b = F.spawnAt('gallimimus', s.x, s.z - 10, { frozen: true }); T.avanza(0.3); const hp0 = b.hp;
  // se apunta al centro de la esfera de impacto más grande (el cuerpo): apuntar a una altura fija caía en el borde de una esfera pequeña y fallaba según el desfase de la cámara
  const h0 = b.sp.hit[0], sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
  T.mira(b.position.x + h0[0] * cy + h0[2] * sy, b.position.y + h0[1], b.position.z - h0[0] * sy + h0[2] * cy, 34); T.limpiaEv(); T.pulsa(); T.avanza(1.2);
  return { guijarros: S.inventory.count('guijarro'), dano: hp0 - b.hp, impactos: T.evs('proyectil:impacto').map((e) => e.en) };
}, (r) => sinError(r) ?? (r.guijarros === 9 && r.dano > 5 && r.impactos.includes('criatura') ? true : 'honda incorrecta'));

await R('jabalina: se arroja (sale de la mano), daña y queda recogible con la durabilidad que le queda', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z); S.inventory.add('jabalina', 1); const j = T.sostiene('jabalina'); const dur0 = j.dur;
  const b = F.spawnAt('stegosaurus', s.x, s.z - 12, { frozen: true }); T.avanza(0.3); const hp0 = b.hp;
  T.mira(b.position.x, b.position.y + 1.9, b.position.z, 24); T.limpiaEv(); T.pulsa(); T.avanza(2.5);
  const loot = c.physics.list.find((q) => q.kind === 'loot' && q.data?.item === 'jabalina');
  return { enMano: T.slotDe('jabalina'), equipado: S.equipped, dano: hp0 - b.hp, dur0, durSuelo: loot?.data?.extra?.dur ?? null, impactos: T.evs('proyectil:impacto').map((e) => e.en) };
}, (r) => sinError(r) ?? (r.enMano === -1 && r.equipado === null && r.dano > 15 && r.durSuelo != null && r.durSuelo < r.dur0 && r.durSuelo > 0 ? true : 'jabalina incorrecta'));

await R('proyectiles: no atraviesan el terreno ni el agua y caen con gravedad', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z); S.inventory.add('arco', 1); S.inventory.add('flecha_madera', 3); T.sostiene('arco'); T.limpiaEv();
  p.yaw = 0; p.pitch = 0.7; T.avanza(0.05); T.pulsa(); T.avanza(9);
  const impactos = T.evs('proyectil:impacto').map((e) => e.en);
  return { impactos, volando: c.proyectiles.lista.length };
}, (r) => sinError(r) ?? (r.impactos.length === 1 && ['suelo', 'agua', 'flora'].includes(r.impactos[0]) && r.volando === 0 ? true : 'el proyectil no aterrizó'));

// ============================================================================ 9. DESPIECE
await R('despiece: el cadáver ofrece "Despiezar"; el cuchillo da cuero y hueso, el hacha da cuerno; sin herramienta se pierde', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear(); T.sabeTodo();
  const s = T.site(); T.jug(s.x, s.z);
  const tri = F.spawnAt('triceratops', s.x, s.z - 6, { frozen: true }); T.avanza(0.3);
  tri.damage(1e6, 'jugador'); T.avanza(1.5);
  // el jugador lo mira de cerca
  // el punto de interacción del cadáver es la esfera de impacto más cercana al jugador (fauna/index.js): se mira esa parte del cuerpo
  // (antes se miraba el centro y el resultado dependía de la orientación aleatoria del animal)
  T.jug(s.x, s.z - 2);
  { const sy = Math.sin(tri.yaw), cy = Math.cos(tri.yaw); let bd = 1e9, bp = null;
    for (const [hx, hy, hz, hr] of tri.sp.hit) { const wx = tri.position.x + hx * cy + hz * sy, wy = tri.position.y + hy, wz = tri.position.z - hx * sy + hz * cy, d = Math.hypot(wx - p.position.x, wz - p.position.z) - hr; if (d < bd) { bd = d; bp = [wx, wy - 0.3, wz]; } }
    p.yaw = Math.atan2(-(bp[0] - p.position.x), -(bp[2] - p.position.z)); p.pitch = Math.atan2(bp[1] - (p.position.y + 1.7), Math.hypot(bp[0] - p.position.x, bp[2] - p.position.z)); }
  T.limpiaEv(); T.avanza(0.3);
  const t = p.target; const ofrece = t && t.kind === 'interactuable' ? t.hit.getPrompt() : (t ? `otro objetivo: ${t.nombre}` : null);
  // sin herramienta: mitad de carne, sin cuero ni hueso
  const a = { sinHerr: null };
  const copia = F.spawnAt('triceratops', s.x + 8, s.z, { frozen: true }); copia.damage(1e6, 'jugador');
  F.despiezar(copia); a.sinHerr = { carne: S.inventory.count('carne_cruda'), cuero: S.inventory.count('cuero'), hueso: S.inventory.count('hueso') };
  T.limpiar(); T.sabeTodo();
  S.inventory.add('cuchillo_piedra', 1); const k = S.slots[T.slotDe('cuchillo_piedra')]; const kd = k.dur;
  const copia2 = F.spawnAt('triceratops', s.x + 12, s.z, { frozen: true }); copia2.damage(1e6, 'jugador');
  const xp0 = S.saber.xp.cuero; F.despiezar(copia2);
  a.cuchillo = { carne: S.inventory.count('carne_cruda'), cuero: S.inventory.count('cuero'), hueso: S.inventory.count('hueso'), cuerno: S.inventory.count('cuerno'), kdur: [kd, S.slots[T.slotDe('cuchillo_piedra')].dur], xp: S.saber.xp.cuero - xp0 };
  T.limpiar(); T.sabeTodo();
  S.inventory.add('cuchillo_piedra', 1); S.inventory.add('hacha_piedra', 1);
  const copia3 = F.spawnAt('triceratops', s.x + 16, s.z, { frozen: true }); copia3.damage(1e6, 'jugador'); F.despiezar(copia3);
  a.hacha = { cuerno: S.inventory.count('cuerno') };
  const repetir = F.despiezar(copia3);
  // lo devorado reduce la carne
  T.limpiar(); S.inventory.add('cuchillo_piedra', 1);
  const c4 = F.spawnAt('triceratops', s.x + 20, s.z, { frozen: true }); c4.damage(1e6, 'jugador'); c4.devorado = 28; F.despiezar(c4); a.devorado = { carne: S.inventory.count('carne_cruda') };
  return { ofrece, a, repetir, hundeEn: copia3.deathT, prof: !!tri.muerta };
}, (r) => sinError(r) ?? (r.ofrece && /Despiezar/.test(r.ofrece) && r.a.sinHerr.cuero === 0 && r.a.sinHerr.hueso === 0 && r.a.sinHerr.carne > 0 && r.a.cuchillo.cuero > 0 && r.a.cuchillo.hueso > 0 && r.a.cuchillo.cuerno === 0 && r.a.cuchillo.carne > r.a.sinHerr.carne && r.a.cuchillo.kdur[1] === r.a.cuchillo.kdur[0] - 2 && r.a.cuchillo.xp > 0 && r.a.hacha.cuerno > 0 && r.repetir === false && r.hundeEn >= 100 && r.a.devorado.carne < r.a.cuchillo.carne / 2 ? true : 'despiece incorrecto'));

// ============================================================================ 10. GUARDADO
await R('guardado: v2 conserva equipo, durabilidad, calidad, recetas y oficios', () => {
  const T = window.__T, { S, M } = T; T.limpiar();
  S.inventory.add('hacha_piedra', 1, { dur: 33, cal: 3, rep: 2 }); S.inventory.add('peto_osteodermo', 1, { dur: 120, cal: 2 }); S.equipar(T.slotDe('peto_osteodermo'));
  S.inventory.add('rama', 3); S.saber.xp.talla = 60; S.saber.evaluar(); const nConocidas = S.saber.conocidas.size;
  S.save(true);
  T.limpiar(); const vacio = { slots: S.slots.filter(Boolean).length, peto: S.equipo.torso, arco: S.saber.conoce('arco') };
  const ok = S.load();
  const h = S.slots.find((x) => x && x.item === 'hacha_piedra');
  return { ok, vacio, hacha: h && { dur: h.dur, cal: h.cal, rep: h.rep }, peto: S.equipo.torso && { item: S.equipo.torso.item, dur: S.equipo.torso.dur, cal: S.equipo.torso.cal }, arco: S.saber.conoce('arco'), xpTalla: S.saber.xp.talla, nivel: S.saber.nivel('talla'), nConocidas: [nConocidas, S.saber.conocidas.size] };
}, (r) => sinError(r) ?? (r.ok && r.vacio.peto === null && !r.vacio.arco && r.hacha?.dur === 33 && r.hacha.cal === 3 && r.hacha.rep === 2 && r.peto?.item === 'peto_osteodermo' && r.peto.dur === 120 && r.peto.cal === 2 && r.arco && r.xpTalla === 60 && r.nivel === 2 && r.nConocidas[0] === r.nConocidas[1] ? true : 'guardado v2 incorrecto'));

await R('guardado: una partida v1 (sin equipo, durabilidad ni saber) se migra sin perder nada', () => {
  const T = window.__T, { S, M } = T; T.limpiar();
  const v1 = { v: 1, fecha: Date.now(), stats: { vida: 80, hambre: 70, sed: 60, energia: 50, oxigeno: 100, temperatura: 26 }, slots: [{ item: 'hacha_piedra', cantidad: 1 }, { item: 'madera', cantidad: 7 }, { item: 'lanza', cantidad: 1 }, { item: 'fibra', cantidad: 12 }, { item: 'cantimplora', cantidad: 1 }, ...Array(19).fill(null)], selected: 0, hora: 10, elapsed: 100, pos: [0, 0], yaw: 0, fogatas: [], tutorial: 3 };
  localStorage.setItem('isla-primordial:partida:v1', JSON.stringify(v1));
  const ok = S.load();
  const h = S.slots[0], l = S.slots[2];
  return { ok, hacha: h && { dur: h.dur, cal: h.cal, rep: h.rep }, lanza: l && { dur: l.dur }, madera: S.inventory.count('madera'), fibra: S.inventory.count('fibra'), vida: S.stats.vida, conoceBasicas: ['hacha_piedra', 'lanza', 'fogata'].every((k) => S.saber.conoce(k)), noArco: !S.saber.conoce('arco'), tutorial: S.tutorial.step, equipo: Object.values(S.equipo).every((e) => e === null) };
}, (r) => sinError(r) ?? (r.ok && r.hacha?.dur === 70 && r.hacha.cal === 1 && r.lanza?.dur === 50 && r.madera === 7 && r.fibra === 12 && r.vida === 80 && r.conoceBasicas && r.noArco && r.tutorial === 3 && r.equipo ? true : 'migración incorrecta'));

// ============================================================================ 11. FLORA CON HERRAMIENTAS
await R('recolección: a mano 1 madera por golpe, con hacha 2 y corteza; con pico las rocas dan pedernal', () => {
  const T = window.__T, { S, F, p, c } = T; T.limpiar(); F.clear();
  const s = T.site(); T.jug(s.x, s.z);
  const cerca = (tipo) => c.flora.getHarvestablesNear(p.position, 200, []).filter((e) => e.tipo === tipo).sort((a, b) => Math.hypot(a.it.x - s.x, a.it.z - s.z) - Math.hypot(b.it.x - s.x, b.it.z - s.z))[0];
  const golpea = (e, item, golpes) => { T.limpiaEv(); const antes = Object.fromEntries(['madera', 'corteza', 'piedra', 'pedernal', 'rama', 'fibra'].map((k) => [k, S.inventory.count(k)])); if (item) T.sostiene(item); else S.select(8);
    T.jug(e.it.x + 1.7, e.it.z); T.mira(e.it.x, e.it.y + 1.2, e.it.z);
    for (let i = 0; i < golpes; i++) { T.pulsa(); T.avanza(0.9); }
    return Object.fromEntries(Object.keys(antes).map((k) => [k, S.inventory.count(k) - antes[k]])); };
  const a1 = cerca('arbol'); const mano = golpea(a1, null, 1);
  S.inventory.add('hacha_piedra', 1); const a2 = c.flora.getHarvestablesNear(p.position, 300, []).filter((e) => e.tipo === 'arbol' && e !== a1)[3] ?? a1; const hacha = golpea(a2, 'hacha_piedra', 1);
  const r1 = cerca('roca'); const romano = golpea(r1, null, 1);
  S.inventory.add('pico_piedra', 1); const r2 = c.flora.getHarvestablesNear(p.position, 300, []).filter((e) => e.tipo === 'roca' && e !== r1)[2] ?? r1; const pico = golpea(r2, 'pico_piedra', 1);
  return { mano, hacha, romano, pico };
}, (r) => sinError(r) ?? (r.mano.madera === 1 && r.mano.corteza === 0 && r.hacha.madera >= 2 && r.pico.piedra >= 2 && r.romano.piedra <= 1 && r.romano.pedernal === 0 ? true : 'recolección según herramienta incorrecta'));

await R('sin NaN ni errores tras todas las pruebas', () => {
  const T = window.__T, { F, S } = T;
  return { mal: F.creatures.filter((o) => !Number.isFinite(o.position.x) || !Number.isFinite(o.hp)).length, vida: Number.isFinite(S.stats.vida), proyectiles: T.c.proyectiles.lista.length };
}, (r) => sinError(r) ?? (r.mal === 0 && r.vida ? true : 'NaN'));

console.log('\nRESUMEN:', results.filter((r) => r.ok).length + '/' + results.length, 'OK');
console.log('ERRORES de consola/página:', errs.length ? errs.slice(0, 6) : 'ninguno');
await browser.close(); server.kill();
process.exit(results.every((r) => r.ok) && errs.length === 0 ? 0 : 1);
