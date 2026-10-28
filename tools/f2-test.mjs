#!/usr/bin/env node
// Prueba automática en navegador de la fase F2 del GDD (supervivencia completa): piezas colocables (cama, refugio, cesta, cofre, vasija)
// con vista previa y validación, colisión, recogida, contenedores, techo y guardado. Las demás partes de F2 se añaden aquí a medida
// que se implementan. No renderiza: simula con window.__game (?debug=1).   Uso: tools/lock.sh node tools/f2-test.mjs [regex de escenario]
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
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
const matar = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* ya no está */ } };
const vigia = setTimeout(() => { console.log('✘ VIGÍA: la prueba superó 15 min'); matar(); process.exit(3); }, 15 * 60 * 1000);
let browser, codigo = 0;
const resultados = [], errs = [];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });

  await page.evaluate(async () => {
    const g = window.__game, c = g.ctx, p = c.player, S = c.survival, K = c.construccion;
    const M = await import('/src/core/items.js');
    const T = window.__T = { M, g, c, p, S, K, ev: [] };
    T.T = T; // los escenarios desestructuran { T, S, K… } de window.__T
    for (const n of ['construccion:colocada', 'construccion:recogida', 'construccion:estado', 'crafted']) c.events.on(n, (e) => T.ev.push({ n, ...e }));
    T.evs = (n) => T.ev.filter((e) => e.n === n);
    c.render = () => {};
    c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
    c.fauna?.setGrace?.(1e9); c.fauna?.clear?.(); // sin criaturas que molesten
    T.limpiar = () => { if (S.dead) S.respawn('playa'); S.quitarBolsa?.(); S.slots.fill(null); for (const r of M.RANURAS) S.equipo[r] = null; S.saber.reset(); S.heal(100); S.stats.hambre = 100; S.stats.sed = 100; S.select(0); T.ev.length = 0; K.restaurar([]); };
    T.sabeTodo = () => { for (const r of M.RECIPES) S.saber.conocidas.add(r.clave); };
    T.dar = (item, n = 1) => S.inventory.add(item, n);
    // llano de pradera sin árboles ni rocas en 25 m
    T.site = () => {
      if (T._site) return T._site;
      const w = c.world, s0 = w.spawn;
      for (let r = 0; r < 3000; r += 30) for (let a = 0; a < 6.283; a += 0.35) {
        const x = s0.x + Math.cos(a) * r, z = s0.z + Math.sin(a) * r;
        if (w.getHeight(x, z) < 3 || w.colliders.query(x, z, 25, []).length) continue;
        let lo = 1e9, hi = -1e9, ok = true;
        for (let dx = -20; dx <= 20 && ok; dx += 5) for (let dz = -20; dz <= 20; dz += 5) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5) { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (ok && hi - lo < 1.2) return (T._site = { x, z });
      }
      return null;
    };
    T.jug = (x, z, yaw = 0, pitch = -0.5) => { p.teleport(x, z); p.velocity.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; g.advance(2, 1 / 60); };
    T.avanza = (seg, dt = 1 / 30) => g.advance(Math.max(1, Math.round(seg / dt)), dt);
  });

  async function R(nombre, fn, arg) {
    if (only && !only.test(nombre)) return;
    const t0 = Date.now(); let res;
    try { res = await page.evaluate(fn, arg); } catch (e) { res = 'EXCEPCIÓN: ' + String(e).slice(0, 400); }
    const ok = res === true || (typeof res === 'object' && res?.ok === true);
    resultados.push({ nombre, ok });
    console.log(`${ok ? '✔' : '✘'} ${nombre}  (${Date.now() - t0} ms)${ok ? (res?.info ? '  ' + JSON.stringify(res.info) : '') : '\n    → ' + (typeof res === 'string' ? res : JSON.stringify(res))}`);
  }

  // ------------------------------------------------------------------------------------------ F2.1 piezas colocables
  await R('piezas: las 5 recetas nuevas se fabrican y dan su objeto colocable (cama y cesta se saben desde el inicio)', () => {
    const { S, M, T } = window.__T; T.limpiar();
    const inicio = ['cama_hojas', 'cesta'].filter((k) => !S.saber.conoce(k));
    if (inicio.length) return 'no se conocen al empezar: ' + inicio;
    T.sabeTodo();
    for (const it of ['cuchillo_piedra', 'hacha_piedra']) T.dar(it); // corta y talar
    S.saber.ganar('talla', 60);
    const out = {};
    for (const id of ['cama_hojas', 'cesta', 'refugio_ramas', 'cofre_madera', 'vasija_barro']) {
      const r = M.RECIPES.find((x) => x.id === id); for (const [m, n] of Object.entries(r.costo)) T.dar(m, n);
      if (r.estacion) window.__T.c.survival.campfires.restore([{ x: window.__T.p.position.x + 1.5, z: window.__T.p.position.z, fuel: 600 }]);
      const ok = S.craft(r.clave); out[id] = ok && S.inventory.has(id);
      const it = M.ITEMS[id]; if (!it.pieza || it.tipo !== 'colocable') return `${id}: no es una pieza colocable`;
    }
    window.__T.c.survival.campfires.restore([]);
    const mal = Object.entries(out).filter(([, v]) => !v).map(([k]) => k);
    return mal.length ? 'no se pudieron fabricar: ' + mal : { ok: true, info: out };
  });

  await R('colocar: la vista previa sigue la mirada, valida (verde) en llano y la pieza se coloca con un clic gastando el objeto', () => {
    const { S, K, T, p, g } = window.__T; T.limpiar();
    const s = T.site(); if (!s) return 'sin sitio llano';
    T.jug(s.x, s.z, 0, -0.45); T.dar('cama_hojas'); S.select(0);
    if (S.slots[0]?.item !== 'cama_hojas') return 'la cama no quedó en la casilla 1';
    S.consume(0); // F
    if (!K.colocando) return 'F no inició la colocación';
    T.avanza(0.2);
    const e = K.estado, d = Math.hypot(e.x - p.position.x, e.z - p.position.z);
    if (!(d > 1 && d < 6.2)) return `la vista previa no está delante a distancia razonable: ${d.toFixed(2)} m`;
    // delante del jugador (yaw 0 → mira a -z)
    if (!(e.z < p.position.z - 0.5)) return 'la vista previa no está delante del jugador';
    if (!e.ok) return 'en llano debería poder colocarse: ' + e.motivo;
    const giro0 = e.rot; K.girar(2); if (Math.abs(e.rot - giro0 - Math.PI / 6) > 1e-6) return 'girar no cambia la orientación';
    window.__T.c.events.emit('input:action', { action: 'usar', pressed: true }); // clic
    if (K.colocando) return 'el clic no colocó la pieza';
    if (S.inventory.has('cama_hojas')) return 'no gastó el objeto';
    const pz = K.piezas.find((q) => q.tipo === 'cama_hojas'); if (!pz) return 'no hay pieza creada';
    if (!pz.mesh.parent) return 'la malla no está en la escena';
    const malla = []; pz.mesh.traverse((o) => { if (o.isMesh) malla.push(o); });
    return { ok: true, info: { distancia: +d.toFixed(2), mallas: malla.length, y: +(pz.y - window.__T.c.world.getHeight(pz.x, pz.z)).toFixed(3), evento: T.evs('construccion:colocada').length } };
  });

  await R('validar: rojo en el agua, en pendiente fuerte, sobre un árbol, encima de otra pieza y encima del jugador', () => {
    const { K, T, c } = window.__T; T.limpiar();
    const w = c.world, s = T.site(); T.jug(s.x, s.z);
    const res = {};
    // agua: primer punto de mar desde el sitio hacia la costa
    let agua = null; for (let r = 10; r < 6000 && !agua; r += 10) for (let a = 0; a < 6.283; a += 0.5) { const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; if (w.getHeight(x, z) < w.seaLevel - 1) { agua = { x, z }; break; } }
    T.jug(agua.x + 1, agua.z + 1); res.agua = K.evaluar('cesta', agua.x, agua.z, 0).motivo;
    // pendiente: el punto más inclinado cerca del sitio
    let pend = null, best = 0; for (let r = 0; r < 800; r += 8) for (let a = 0; a < 6.283; a += 0.4) { const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, sl = w.getSlope(x, z); if (sl > best && w.getHeight(x, z) > 3) { best = sl; pend = { x, z }; } }
    T.jug(pend.x + 2, pend.z + 2); res.pendiente = K.evaluar('refugio_ramas', pend.x, pend.z, 0).motivo; res.pendienteVal = +best.toFixed(2);
    // árbol
    let arbol = null; for (let r = 10; r < 1500 && !arbol; r += 6) for (let a = 0; a < 6.283; a += 0.3) { const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; const q = w.colliders.query(x, z, 0.5, []).find((k) => k.kind === 'arbol'); if (q) { arbol = q; break; } }
    T.jug(arbol.x + 3, arbol.z + 3); res.arbol = K.evaluar('cama_hojas', arbol.x, arbol.z, 0).motivo;
    // otra pieza
    T.jug(s.x, s.z); const a = K.crear('cofre_madera', s.x + 3, s.z, 0); res.otra = K.evaluar('cesta', s.x + 3.2, s.z, 0).motivo;
    // encima del jugador (el cofre es sólido)
    res.jugador = K.evaluar('cofre_madera', s.x, s.z + 0.2, 0).motivo;
    // y llano libre sí
    res.libre = K.evaluar('cesta', s.x - 3, s.z - 2, 0).ok;
    K.quitar(a);
    const malos = Object.entries({ agua: /agua/, pendiente: /desparejo/, arbol: /árbol/, otra: /otra construcción/, jugador: /en medio/ }).filter(([k, re]) => !re.test(res[k] ?? '')).map(([k]) => k);
    if (!res.libre) malos.push('libre');
    return malos.length ? { motivo: 'validación incorrecta: ' + malos, ...res } : { ok: true, info: res };
  });

  await R('colisión: el jugador no atraviesa el cofre, pasa bajo el refugio y pisa la cama', () => {
    const { K, T, p, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    const cofre = K.crear('cofre_madera', s.x, s.z - 4, 0);
    const refu = K.crear('refugio_ramas', s.x + 8, s.z - 4, 0);
    const cama = K.crear('cama_hojas', s.x - 8, s.z - 4, 0);
    // camina hacia -z (yaw 0) desde 2 m antes de cada pieza
    const andar = (x, z) => { T.jug(x, z, 0, 0); c.input.keys.add('KeyW'); T.avanza(2.2); c.input.keys.delete('KeyW'); return { x: p.position.x, z: p.position.z }; };
    const fC = andar(s.x, s.z), fR = andar(s.x + 8, s.z), fB = andar(s.x - 8, s.z);
    const out = { cofre: +(fC.z - (s.z - 4)).toFixed(2), refugio: +(fR.z - (s.z - 4)).toFixed(2), cama: +(fB.z - (s.z - 4)).toFixed(2) };
    for (const q of [cofre, refu, cama]) K.quitar(q);
    if (!(out.cofre > 0.4)) return { motivo: 'atravesó el cofre', ...out };
    // bajo el refugio: entra entre los horcones (z local 0,9) y lo para el faldón de atrás (no lo atraviesa)
    if (!(out.refugio < 0.6 && out.refugio > -1.1)) return { motivo: out.refugio >= 0.6 ? 'no pudo entrar bajo el refugio (entre los horcones)' : 'atravesó el faldón trasero', ...out };
    if (!(out.cama < -0.5)) return { motivo: 'la cama no se puede pisar', ...out };
    return { ok: true, info: out };
  });

  await R('recoger (X): devuelve el objeto; un contenedor con cosas no se recoge hasta vaciarlo', () => {
    const { K, T, S, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    const cesta = K.crear('cesta', s.x, s.z - 2, 0);
    cesta.cont.casillas[0] = { item: 'baya', cantidad: 5 };
    const lleno = K.recoger(cesta);
    if (lleno) return 'se recogió una cesta con cosas';
    cesta.cont.casillas[0] = null;
    // X sobre la pieza mirada
    T.jug(s.x, s.z, 0, -0.55); T.avanza(0.1);
    const tgt = c.player.target;
    if (tgt?.kind !== 'interactuable' || tgt.hit.pieza !== cesta) return 'la cesta no queda como objetivo al mirarla';
    const px = tgt.hit.getPromptX?.();
    c.events.emit('input:action', { action: 'desmontar', pressed: true });
    if (K.piezas.includes(cesta)) return 'X no la recogió';
    if (!S.inventory.has('cesta')) return 'no devolvió la cesta a la mochila';
    return { ok: true, info: { prompt: px, recogidas: T.evs('construccion:recogida').length } };
  });

  await R('contenedor: guardar y sacar respetan casillas, apilado, durabilidad y peso de la mochila', () => {
    const { K, T, S } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    const v = K.crear('vasija_barro', s.x + 1.5, s.z, 0);
    T.dar('baya', 30); T.dar('hacha_piedra'); S.slots[S.slots.findIndex((x) => x?.item === 'hacha_piedra')].dur = 33;
    const iB = S.slots.findIndex((x) => x?.item === 'baya'), iH = S.slots.findIndex((x) => x?.item === 'hacha_piedra');
    const g1 = K.guardar(v, iB, 20), g2 = K.guardar(v, iB), g3 = K.guardar(v, iH);
    const enV = v.cont.casillas.filter(Boolean).map((x) => `${x.item}×${x.cantidad}${x.dur != null ? `(${x.dur})` : ''}`);
    if (g1 !== 20 || g2 !== 10 || g3 !== 1) return { motivo: 'guardar no movió lo esperado', g1, g2, g3, enV };
    if (S.inventory.count('baya') !== 0 || S.inventory.has('hacha_piedra')) return 'quedaron cosas en la mochila';
    if (v.cont.casillas.filter((x) => x?.item === 'baya').length !== 1) return 'las bayas no se apilaron en una casilla: ' + enV;
    // llenar: 6 casillas; la séptima cosa distinta no cabe
    for (const it of ['piedra', 'madera', 'fibra', 'rama']) { T.dar(it, 1); K.guardar(v, S.slots.findIndex((x) => x?.item === it)); }
    T.dar('pedernal', 1); const noCabe = K.guardar(v, S.slots.findIndex((x) => x?.item === 'pedernal'));
    if (noCabe !== 0 || !S.inventory.has('pedernal')) return 'metió algo con las 6 casillas llenas';
    // sacar devuelve la durabilidad
    const iHv = v.cont.casillas.findIndex((x) => x?.item === 'hacha_piedra'); K.sacar(v, iHv);
    const h = S.slots.find((x) => x?.item === 'hacha_piedra');
    if (!h || h.dur !== 33) return 'el hacha volvió sin su durabilidad: ' + JSON.stringify(h);
    K.guardar(v, S.slots.findIndex((x) => x?.item === 'hacha_piedra'));
    // sacar todo con la mochila casi llena de peso (93,6 kg de 96 posibles): el hacha (2,2 kg) no cabe y se queda en la vasija
    S.slots.fill(null); T.dar('piedra', 78);
    const antes = v.cont.casillas.filter(Boolean).length; K.sacarTodo(v); const quedan = v.cont.casillas.filter(Boolean).map((x) => x.item);
    K.quitar(v);
    if (!quedan.includes('hacha_piedra')) return 'el hacha salió aunque no cabía por peso: ' + quedan;
    if (S.inventory.count('baya') !== 30) return 'las bayas (ligeras) debían salir';
    return { ok: true, info: { guardado: enV, quedanEnVasija: `${quedan.length}/${antes}: ${quedan}` } };
  });

  await R('techo: bajo el refugio hay techo (1) y fuera no (0); girado también', () => {
    const { K, T } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x + 10, s.z + 10);
    const r = K.crear('refugio_ramas', s.x, s.z, Math.PI / 2);
    // con giro de 90°: el eje z local (frente) apunta a +x de mundo
    const dentro = K.techoEn(s.x + 0.2, s.z), fuera = K.techoEn(s.x + 4, s.z), lado = K.techoEn(s.x, s.z + 2.2), atras = K.techoEn(s.x - 0.8, s.z + 0.5);
    K.quitar(r);
    if (dentro !== 1 || atras !== 1) return { motivo: 'sin techo bajo el refugio', dentro, atras };
    if (fuera !== 0 || lado !== 0) return { motivo: 'techo fuera del refugio', fuera, lado };
    return { ok: true, info: { dentro, atras, fuera, lado } };
  });

  await R('guardado: piezas, giro y contenido vuelven tras guardar y cargar; una partida nueva las quita', () => {
    const { K, T, S } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    K.crear('cama_hojas', s.x + 3, s.z - 3, 0.7);
    const cof = K.crear('cofre_madera', s.x - 3, s.z - 3, 1.2); cof.cont.casillas[3] = { item: 'lanza', cantidad: 1, dur: 17, cal: 2, rep: 1 }; cof.cont.casillas[0] = { item: 'baya', cantidad: 12 };
    const antes = JSON.stringify(K.serializar());
    S.save(true);
    K.restaurar([]); if (K.piezas.length) return 'restaurar([]) no vació';
    if (!S.load()) return 'no cargó la partida';
    const despues = JSON.stringify(K.serializar());
    const colisiones = K.piezas.reduce((a, q) => a + q.cols.length, 0);
    const recup = K.piezas.find((q) => q.tipo === 'cofre_madera')?.cont.casillas[3];
    S.newGame(); const tras = K.piezas.length;
    S.clearSave();
    if (antes !== despues) return { motivo: 'no coinciden', antes, despues };
    if (!recup || recup.dur !== 17 || recup.cal !== 2) return 'el contenido perdió datos: ' + JSON.stringify(recup);
    if (tras !== 0) return 'la partida nueva conserva piezas';
    return { ok: true, info: { piezas: JSON.parse(antes).length, colisiones } };
  });

  // ------------------------------------------------------------------------------------------ F2.2 descanso y sueño
  await R('sueño: baja estando despierto (más corriendo); cansado y agotado frenan la energía y la vida', () => {
    const { T, S, c, p } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    S.stats.sueno = 100; T.avanza(60); const quieto = 100 - S.stats.sueno;
    S.stats.sueno = 100; c.input.keys.add('KeyW'); c.input.keys.add('ShiftLeft');
    for (let i = 0; i < 60; i++) { T.avanza(1); S.stats.energia = 100; S.stats.hambre = 100; S.stats.sed = 100; if (i % 10 === 0) T.jug(s.x, s.z, p.yaw + 0.5, 0); }
    c.input.keys.clear(); const corriendo = 100 - S.stats.sueno;
    // energía: descansado vs agotado (mismo tiempo quieto desde 20)
    const rec = (z) => { S.stats.sueno = z; S.stats.energia = 20; S.stats.vida = 60; T.jug(s.x, s.z); T.avanza(10); return { e: +(S.stats.energia - 20).toFixed(1), v: +(S.stats.vida - 60).toFixed(2), z }; };
    const bien = rec(90), cansado = rec(18), agotado = rec(5);
    const tope = (() => { S.stats.sueno = 5; S.stats.energia = 100; T.avanza(20); return +S.stats.energia.toFixed(1); })();
    const o = { porMinQuieto: +quieto.toFixed(2), porMinCorriendo: +corriendo.toFixed(2), bien, cansado, agotado, topeAgotado: tope };
    if (!(quieto > 2 && quieto < 4)) return { motivo: 'el sueño no baja ~2,5/min despierto', ...o };
    if (!(corriendo > quieto * 1.3)) return { motivo: 'correr no cansa más', ...o };
    if (!(cansado.e < bien.e * 0.75 && agotado.e < cansado.e)) return { motivo: 'el cansancio no frena la energía', ...o };
    if (!(agotado.v <= 0.001 && bien.v > 0)) return { motivo: 'agotado aún se cura solo', ...o };
    if (!(tope <= 46)) return { motivo: 'agotado conserva la energía llena', ...o };
    return { ok: true, info: o };
  });

  await R('dormir en la cama de noche: el reloj corre hasta el amanecer, recupera sueño y vida, gasta comida a medio ritmo y fija la reaparición', () => {
    const { T, S, K, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    const cama = K.crear('cama_hojas', s.x + 2, s.z, 0.4);
    c.time.locked = false; c.time.hour = 22; Object.assign(S.stats, { sueno: 20, vida: 55, hambre: 90, sed: 90 });
    const prompt = S.descanso.prompt(cama);
    const t0 = performance.now(), el0 = c.time.elapsed;
    if (!S.descanso.dormir({ cama })) return 'no pudo dormir en la cama: ' + S.descanso.puede(cama).motivo;
    let pasos = 0; while (S.descanso.durmiendo && pasos < 2000) { T.avanza(1 / 30, 1 / 30); pasos++; }
    const real = pasos / 30, horas = ((c.time.elapsed - el0) / c.config.time.dayLengthSec) * 24;
    const o = { prompt, motivo: S.descanso.despertoPor, horaFinal: +c.time.hour.toFixed(2), horas: +horas.toFixed(2), realSeg: +real.toFixed(1), sueno: +S.stats.sueno.toFixed(1), vida: +S.stats.vida.toFixed(1), hambre: +S.stats.hambre.toFixed(1), sed: +S.stats.sed.toFixed(1), reap: S.reaparicion, escala: c.time.escala, ms: Math.round(performance.now() - t0) };
    c.time.locked = true; c.time.hour = 12; K.quitar(cama);
    if (o.motivo !== 'amanecer') return { motivo: 'no despertó al amanecer', ...o };
    if (!(o.horaFinal >= 6.2 && o.horaFinal < 7.2)) return { motivo: 'hora de despertar rara', ...o };
    if (!(o.realSeg < 20 && o.horas > 8)) return { motivo: 'el tiempo no se aceleró lo esperado', ...o };
    if (!(o.sueno > 95)) return { motivo: 'no recuperó el sueño en la cama', ...o };
    if (!(o.vida > 70)) return { motivo: 'no recuperó vida durmiendo', ...o };
    // despierto, 8,6 h de juego gastarían ≈ 30 de hambre; dormido, la mitad
    if (!(90 - o.hambre > 8 && 90 - o.hambre < 22)) return { motivo: 'gasto de comida dormido fuera de lo esperado', ...o };
    if (!o.reap || Math.hypot(o.reap.x - (s.x + 2), o.reap.z - s.z) > 0.01) return { motivo: 'la cama no quedó como reaparición', ...o };
    if (o.escala !== 1) return { motivo: 'el tiempo siguió acelerado al despertar', ...o };
    return { ok: true, info: o };
  });

  await R('dormir en el suelo (Z) de día solo con mucho sueño, recupera más despacio y despierta descansado', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    c.time.locked = false; c.time.hour = 10;
    S.stats.sueno = 80; c.events.emit('input:action', { action: 'dormir', pressed: true }); const conSueno80 = S.descanso.durmiendo;
    S.stats.sueno = 30; c.events.emit('input:action', { action: 'dormir', pressed: true }); const conSueno30 = S.descanso.durmiendo;
    let pasos = 0; const el0 = c.time.elapsed; while (S.descanso.durmiendo && pasos < 3000) { T.avanza(1 / 30, 1 / 30); pasos++; }
    const horas = ((c.time.elapsed - el0) / c.config.time.dayLengthSec) * 24;
    const o = { conSueno80, conSueno30, motivo: S.descanso.despertoPor, horas: +horas.toFixed(2), sueno: +S.stats.sueno.toFixed(1) };
    c.time.locked = true; c.time.hour = 12;
    if (conSueno80) return { motivo: 'durmió en el suelo sin apenas sueño', ...o };
    if (!conSueno30) return { motivo: 'no pudo dormir en el suelo con sueño', ...o };
    if (o.motivo !== 'descansado') return { motivo: 'no despertó descansado', ...o };
    // de 30 a 100 en el suelo: ~70/(100/620) s = 434 s de juego ≈ 6,9 h (en cama serían 4,2 h)
    if (!(horas > 5.5 && horas < 8.5)) return { motivo: 'el suelo no recupera más despacio que la cama', ...o };
    return { ok: true, info: o };
  });

  await R('amenazas: con un depredador cerca no se puede dormir; si llega dormido, despierta; el daño también despierta', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    c.time.locked = false; c.time.hour = 23; S.stats.sueno = 20;
    const F = c.fauna;
    const rex = F.spawnAt('tyrannosaurus', s.x + 20, s.z, { frozen: true });
    const conRex = S.descanso.puede(null);
    rex.position.set(s.x + 200, rex.position.y, s.z); T.avanza(0.1);
    const lejos = S.descanso.dormir({});
    T.avanza(1); rex.position.set(s.x + 15, c.world.getHeight(s.x + 15, s.z), s.z); T.avanza(1);
    const desperto = { durmiendo: S.descanso.durmiendo, motivo: S.descanso.despertoPor };
    F.clear();
    S.dormirDano = null; S.descanso.dormir({}); T.avanza(0.5); S.damage(5, 'prueba'); const trasDano = { durmiendo: S.descanso.durmiendo, motivo: S.descanso.despertoPor };
    c.time.locked = true; c.time.hour = 12;
    const o = { conRex, lejos, desperto, trasDano };
    if (conRex.ok || !/cerca/.test(conRex.motivo)) return { motivo: 'dejó dormir con un tiranosaurio a 20 m', ...o };
    if (!lejos) return { motivo: 'con el tiranosaurio a 200 m debía poder dormir', ...o };
    if (desperto.durmiendo || desperto.motivo !== 'amenaza') return { motivo: 'no despertó al acercarse el depredador', ...o };
    if (trasDano.durmiendo || trasDano.motivo !== 'dano') return { motivo: 'el daño no despertó', ...o };
    return { ok: true, info: o };
  });

  await R('reaparición: muerto con cama reaparece junto a ella; si la cama ya no está o elige la playa, en el inicio', () => {
    const { T, S, K, c, p } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    const cama = K.crear('cama_hojas', s.x + 3, s.z + 1, 0);
    S.reaparicion = { x: cama.x, z: cama.z };
    const muere = (lugar) => { S.stats.vida = 100; S.damage(500, 'prueba'); T.avanza(0.1); S.respawn(lugar); T.avanza(0.1); return { x: p.position.x, z: p.position.z, estado: c.state }; };
    const enCama = muere('cama');
    const enPlaya = muere('playa');
    K.quitar(cama); const sinCama = muere('cama');
    const sp = c.world.spawn;
    const dC = Math.hypot(enCama.x - cama.x, enCama.z - cama.z), dP = Math.hypot(enPlaya.x - sp.x, enPlaya.z - sp.z), dS = Math.hypot(sinCama.x - sp.x, sinCama.z - sp.z);
    const o = { dCama: +dC.toFixed(2), dPlaya: +dP.toFixed(2), dSinCama: +dS.toFixed(2), estado: enCama.estado };
    if (!(dC < 2.5)) return { motivo: 'no reapareció junto a la cama', ...o };
    if (!(dP < 1 && dS < 1)) return { motivo: 'no reapareció en la playa', ...o };
    if (o.estado !== 'playing') return { motivo: 'no volvió a jugar', ...o };
    return { ok: true, info: o };
  });

  await R('guardado del sueño: el valor de sueño y la cama de reaparición se guardan; una partida vieja sin sueño empieza descansada', () => {
    const { T, S } = window.__T; T.limpiar();
    S.stats.sueno = 37; S.reaparicion = { x: 12.5, z: -4 }; S.save(true);
    S.stats.sueno = 100; S.reaparicion = null; S.load();
    const r1 = { sueno: S.stats.sueno, reap: S.reaparicion };
    // partida antigua: sin campo sueño
    const k = 'isla-primordial:partida:v1', d = JSON.parse(localStorage.getItem(k)); delete d.stats.sueno; delete d.reaparicion; localStorage.setItem(k, JSON.stringify(d));
    S.stats.sueno = 3; S.load(); const r2 = { sueno: S.stats.sueno, reap: S.reaparicion };
    S.clearSave();
    if (Math.round(r1.sueno) !== 37 || r1.reap?.x !== 12.5) return { motivo: 'no se guardó', r1 };
    if (r2.sueno !== 100 || r2.reap !== null) return { motivo: 'la partida vieja no empezó descansada', r2 };
    return { ok: true, info: { r1, r2 } };
  });

  // ------------------------------------------------------------------------------------------ F2.4 conservación de la comida
  await R('frescura: la comida se estropea con el tiempo de juego (cruda antes que cocida, la seca casi nada) y a 0 se vuelve restos podridos', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const dia = c.config.time.dayLengthSec;
    T.dar('carne_cruda', 3); T.dar('carne_cocida', 3); T.dar('carne_seca', 3); T.dar('baya', 10); T.dar('agua', 2);
    const fr = (id) => S.slots.find((x) => x?.item === id)?.fr;
    const inicial = { cruda: fr('carne_cruda'), agua: fr('agua') };
    // medio día de juego (la frescura se procesa cada segundo de juego)
    S.frescura.tick(dia * 0.3);
    const medio = { cruda: +fr('carne_cruda').toFixed(3), cocida: +fr('carne_cocida').toFixed(3), seca: +fr('carne_seca').toFixed(3), baya: +fr('baya').toFixed(3) };
    S.frescura.tick(dia * 0.4); // 0,7 días: la cruda (0,6 días) ya se pudrió
    const final = { cruda: S.inventory.count('carne_cruda'), podrido: S.inventory.count('podredumbre'), cocida: +fr('carne_cocida').toFixed(3) };
    const o = { inicial, medio, final };
    if (inicial.cruda !== 1 || inicial.agua !== undefined) return { motivo: 'frescura inicial incorrecta (o el agua lleva frescura)', ...o };
    if (!(medio.cruda < medio.baya && medio.baya < medio.cocida && medio.cocida < medio.seca && medio.seca > 0.98)) return { motivo: 'orden de deterioro incorrecto', ...o };
    if (final.cruda !== 0 || final.podrido !== 3) return { motivo: 'la carne cruda no se pudrió a restos', ...o };
    return { ok: true, info: o };
  });

  await R('frescura al apilar: se promedia por cantidad; la vasija conserva 2,5 veces más; se guarda con la partida', () => {
    const { T, S, K } = window.__T; T.limpiar();
    S.inventory.add('carne_cocida', 2, { fr: 0.5 }); S.inventory.add('carne_cocida', 2, { fr: 1 });
    const apilada = S.slots.filter((x) => x?.item === 'carne_cocida'), frPila = apilada[0]?.fr;
    const s = T.site(); T.jug(s.x, s.z);
    const v = K.crear('vasija_barro', s.x + 2, s.z, 0), ce = K.crear('cesta', s.x - 2, s.z, 0);
    v.cont.casillas[0] = { item: 'carne_cruda', cantidad: 2, fr: 1 }; ce.cont.casillas[0] = { item: 'carne_cruda', cantidad: 2, fr: 1 };
    S.frescura.tick(300);
    const enV = v.cont.casillas[0].fr, enC = ce.cont.casillas[0].fr;
    S.save(true); const guardado = JSON.parse(localStorage.getItem('isla-primordial:partida:v1'));
    const frG = guardado.slots.find((x) => x?.item === 'carne_cocida')?.fr, frCont = guardado.construccion.find((q) => q.t === 'vasija_barro')?.cont?.[0]?.fr;
    K.quitar(v); K.quitar(ce); S.clearSave();
    const o = { pilas: apilada.length, frPila: +frPila.toFixed(3), enVasija: +enV.toFixed(3), enCesta: +enC.toFixed(3), frGuardada: frG, frContGuardada: frCont };
    if (o.pilas !== 1 || Math.abs(frPila - 0.75) > 0.01) return { motivo: 'no promedió al apilar', ...o };
    if (!(Math.abs((1 - enC) / (1 - enV) - 2.5) < 0.05)) return { motivo: 'la vasija no conserva 2,5×', ...o };
    if (frG == null || frCont == null) return { motivo: 'la frescura no se guardó', ...o };
    return { ok: true, info: o };
  });

  await R('comer: lo pasado alimenta menos y lo casi podrido puede intoxicar; carne seca da sed; podrido no se come', () => {
    const { T, S } = window.__T; T.limpiar();
    const come = (fr, n = 1) => { S.slots.fill(null); S.stats.hambre = 20; S.inventory.add('carne_cocida', n, { fr }); S.select(0); S.consume(0); return S.stats.hambre - 20; };
    const fresca = come(1), pasada = come(0.4);
    let intox = 0; for (let i = 0; i < 40; i++) { S.heridas.limpiar(); come(0.1); if (S.heridas.st.intox > 0) intox++; }
    const podrida = come(0.1);
    S.slots.fill(null); S.stats.sed = 50; S.inventory.add('carne_seca', 1); S.select(0); S.consume(0); const sedSeca = S.stats.sed - 50;
    S.slots.fill(null); S.inventory.add('podredumbre', 2); S.select(0); const comioPodr = S.consume(0);
    S.heridas.limpiar();
    const o = { fresca, pasada: +pasada.toFixed(1), casiPodrida: +podrida.toFixed(1), intoxEn40: intox, sedSeca, comioPodr };
    if (!(Math.abs(fresca - 38) < 0.01 && Math.abs(pasada - 38 * 0.8) < 0.01 && Math.abs(podrida - 19) < 0.01)) return { motivo: 'nutrición según frescura incorrecta', ...o };
    if (!(intox >= 8 && intox <= 30)) return { motivo: 'la intoxicación no ronda el 45 %', ...o };
    if (sedSeca !== -6) return { motivo: 'la carne seca no da sed', ...o };
    if (comioPodr) return { motivo: 'se pudo comer la podredumbre', ...o };
    return { ok: true, info: o };
  });

  await R('carne seca: se descubre al tener sal y se hace en la fogata con oficio de cocina 1', () => {
    const { T, S, M, c, p } = window.__T; T.limpiar();
    const antes = S.saber.conoce('carne_seca');
    T.dar('sal', 2); const despues = S.saber.conoce('carne_seca');
    T.dar('carne_cruda', 4);
    const sinFuego = S.craft('carne_seca');
    c.survival.campfires.restore([{ x: p.position.x + 1.5, z: p.position.z, fuel: 600 }]);
    const sinNivel = S.craft('carne_seca');
    S.saber.ganar('cocina', 20);
    const ok = S.craft('carne_seca');
    c.survival.campfires.restore([]);
    const o = { antes, despues, sinFuego, sinNivel, ok, carneSeca: S.inventory.count('carne_seca'), fr: S.slots.find((x) => x?.item === 'carne_seca')?.fr };
    if (antes || !despues) return { motivo: 'el descubrimiento por la sal no funciona', ...o };
    if (sinFuego || sinNivel || !ok || o.carneSeca !== 2) return { motivo: 'requisitos de la receta', ...o };
    if (o.fr !== 1) return { motivo: 'sale sin frescura', ...o };
    return { ok: true, info: o };
  });

  // ------------------------------------------------------------------------------------------ F2.5 heridas
  await R('heridas: los mordiscos hacen sangrar, el vendaje lo corta; el nivel leve para solo; no se duerme sangrando', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const H = S.heridas;
    // probabilidades por tipo de golpe
    const { probHerida } = window.__T.H ?? {};
    let sang = 0; for (let i = 0; i < 200; i++) { H.limpiar(); S.stats.vida = 100; S.damage(30, 'raptor', { armadura: true, tipo: 'mordisco' }); if (H.st.sangrado) sang++; }
    let sangGolpe = 0; for (let i = 0; i < 200; i++) { H.limpiar(); S.stats.vida = 100; S.damage(30, 'triceratops', { armadura: true, tipo: 'golpe' }); if (H.st.sangrado) sangGolpe++; }
    H.limpiar(); H.sangrar(2); S.stats.vida = 100;
    const s = T.site(); T.jug(s.x, s.z); T.avanza(10); const pierde = 100 - S.stats.vida;
    c.time.hour = 23; const dormir = S.descanso.puede(null);
    T.dar('vendaje', 1); S.select(S.slots.findIndex((x) => x?.item === 'vendaje')); S.consume(S.selected); const tras = H.st.sangrado;
    T.dar('vendaje', 1); S.stats.vida = 100; const gastaSinNecesidad = S.consume(S.slots.findIndex((x) => x?.item === 'vendaje'));
    H.sangrar(1); S.stats.vida = 100; T.avanza(50); const leve = H.st.sangrado;
    c.time.hour = 12;
    const o = { mordiscoSangra: sang / 200, golpeSangra: sangGolpe / 200, pierdeEn10s: +pierde.toFixed(2), dormir: dormir.motivo, trasVendaje: tras, gastaSinNecesidad, leveTras50s: leve };
    if (!(o.mordiscoSangra > 0.4 && o.golpeSangra < o.mordiscoSangra / 2)) return { motivo: 'probabilidad de sangrado por tipo', ...o };
    if (!(pierde > 2 && pierde < 3)) return { motivo: 'el sangrado nivel 2 no quita ~0,24 de vida por segundo', ...o };
    if (!/sangrando/.test(dormir.motivo)) return { motivo: 'dejó dormir sangrando', ...o };
    if (tras !== 0 || gastaSinNecesidad) return { motivo: 'el vendaje no cortó el sangrado o se gastó sin hacer falta', ...o };
    if (leve !== 0) return { motivo: 'el sangrado leve no paró solo', ...o };
    return { ok: true, info: o };
  });

  await R('fracturas: una caída alta rompe un hueso; se cojea (sin correr, salto bajo); la férula acorta la curación; sana sola', () => {
    const { T, S, c, p } = window.__T; T.limpiar();
    const H = S.heridas, cfg = c.config.player;
    const s = T.site();
    // caída que llega a ~21 m/s (≈ 42 de daño: duele, rompe, no mata)
    const alto = (21 * 21) / (2 * c.config.physics.gravity);
    let rotas = 0, muertes = 0; for (let i = 0; i < 20; i++) { if (S.dead) { muertes++; S.respawn('playa'); } H.limpiar(); S.stats.vida = 100; T.jug(s.x, s.z); p.position.y += alto; p.onGround = false; T.avanza(3.5); if (H.st.fractura) rotas++; }
    if (S.dead) { muertes++; S.respawn('playa'); }
    H.limpiar(); H.fracturar(); T.jug(s.x, s.z); T.avanza(0.2);
    const cojo = { andar: +cfg.walkSpeed.toFixed(2), correr: +cfg.sprintSpeed.toFixed(2), salto: +cfg.jumpSpeed.toFixed(2), puedeCorrer: S.puedeCorrer };
    c.input.keys.add('KeyW'); c.input.keys.add('ShiftLeft'); T.avanza(1); const corre = p.sprinting; c.input.keys.clear();
    const tSin = H.st.fractura.t;
    T.dar('ferula', 1); S.consume(S.slots.findIndex((x) => x?.item === 'ferula')); const tCon = H.st.fractura.t, ferula = H.st.fractura.ferula;
    T.avanza(0.2); const conFerula = +cfg.walkSpeed.toFixed(2);
    H.tick(600); const sano = !H.st.fractura; T.avanza(0.2);
    const sanoVel = { andar: +cfg.walkSpeed.toFixed(2), correr: +cfg.sprintSpeed.toFixed(2) };
    const o = { alto: +alto.toFixed(1), rotasEn20: rotas, muertes, cojo, corre, tSin, tCon, ferula, conFerula, sano, sanoVel };
    if (rotas < 12) return { motivo: 'una caída de 40 m casi nunca rompe un hueso', ...o };
    if (cojo.puedeCorrer || corre || cojo.correr > cojo.andar + 1e-6) return { motivo: 'con fractura se puede correr', ...o };
    if (!(cojo.salto < 4)) return { motivo: 'con fractura se salta igual', ...o };
    if (!(ferula && tCon <= tSin / 2.9 && conFerula > cojo.andar)) return { motivo: 'la férula no acorta ni alivia', ...o };
    if (!sano || !(sanoVel.correr > sanoVel.andar)) return { motivo: 'no sanó o sigue sin poder correr', ...o };
    return { ok: true, info: o };
  });

  await R('intoxicación: gasta agua y comida, pasa sola y beber la acorta; las heridas se guardan y se borran al morir', () => {
    const { T, S } = window.__T; T.limpiar();
    const H = S.heridas;
    H.intoxicar(2); const t0 = H.st.intox;
    Object.assign(S.stats, { sed: 80, hambre: 80, vida: 80 });
    H.tick(30); const sed30 = 80 - S.stats.sed, ham30 = 80 - S.stats.hambre;
    const antesBeber = H.st.intox; S.drink(10); const trasBeber = H.st.intox;
    H.sangrar(1); H.fracturar(); S.save(true);
    H.limpiar(); S.load(); const rest = { sangrado: H.st.sangrado, fractura: !!H.st.fractura, intox: +H.st.intox.toFixed(1) };
    S.stats.vida = 100; S.damage(500, 'prueba'); const trasMorir = H.estados().length; S.respawn('playa');
    S.clearSave();
    const o = { t0, sed30: +sed30.toFixed(2), ham30: +ham30.toFixed(2), antesBeber, trasBeber, rest, trasMorir };
    if (!(sed30 > 3 && ham30 > 1)) return { motivo: 'la intoxicación no gasta agua y comida', ...o };
    if (!(trasBeber <= antesBeber - 39)) return { motivo: 'beber no acorta la intoxicación', ...o };
    if (!(rest.sangrado === 1 && rest.fractura && rest.intox > 0)) return { motivo: 'las heridas no se guardaron', ...o };
    if (trasMorir !== 0) return { motivo: 'las heridas siguen tras morir', ...o };
    return { ok: true, info: o };
  });

  // ------------------------------------------------------------------------------------------ F2.6 clima, dificultad y muerte
  await R('mojado: la lluvia moja sin techo, bajo el refugio no y bajo un árbol menos; la capa frena; mojado da frío; se seca junto al fuego', () => {
    const { T, S, K, c, p } = window.__T; T.limpiar();
    const s = T.site(), w = c.world;
    // punto a cielo abierto: sin árboles en 4 m (la flora pudo cargar árboles cerca del sitio después de elegirlo)
    const abierto = (x, z) => { for (let r = 0; r < 60; r += 3) for (let a = 0; a < 6.283; a += 0.6) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!w.colliders.query(px, pz, 4, []).some((k) => k.kind === 'arbol')) return { x: px, z: pz }; } return { x, z }; };
    T.jug(s.x, s.z); T.avanza(3); // que cargue la flora de alrededor antes de buscar un claro sin árboles
    let libre = abierto(s.x, s.z); T.jug(libre.x, libre.z); T.avanza(3); libre = abierto(libre.x, libre.z);
    const llover = (x, z, seg, opts = {}) => { S.stats.mojado = 0; T.jug(x, z); if (opts.capa) S.equipo.espalda = { item: 'capa_piel', dur: 100, cal: 1, rep: 0 }; c.fx.setWeather({ rain: 1, storm: 0 }); T.avanza(seg); c.fx.setWeather({ rain: 0, storm: 0 }); S.equipo.espalda = null; return +S.stats.mojado.toFixed(1); };
    const fuera = llover(libre.x, libre.z, 8);
    const r = K.crear('refugio_ramas', s.x + 6, s.z, 0); const bajo = llover(s.x + 6, s.z - 0.3, 8); K.quitar(r);
    const capa = llover(libre.x, libre.z, 8, { capa: true });
    let arbol = null; for (let rr = 10; rr < 1500 && !arbol; rr += 6) for (let a = 0; a < 6.283; a += 0.3) { const q = w.colliders.query(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr, 0.5, []).find((k) => k.kind === 'arbol'); if (q) { arbol = q; break; } }
    const bajoArbol = llover(arbol.x + arbol.radius + 0.6, arbol.z, 8);
    // frío: misma hora, seco frente a empapado
    c.time.hour = 21; T.jug(s.x, s.z); S.stats.mojado = 0; S.stats.temperatura = 20; T.avanza(20); const tSeco = S.stats.temperatura;
    S.stats.temperatura = 20; S.stats.mojado = 100; T.avanza(20); const tMojado = S.stats.temperatura;
    // secarse: al aire vs junto al fuego
    c.time.hour = 12; S.stats.mojado = 80; T.avanza(10); const aire = 80 - S.stats.mojado;
    c.survival.campfires.restore([{ x: p.position.x + 1, z: p.position.z, fuel: 600 }]); S.stats.mojado = 80; T.avanza(10); const fuego = 80 - S.stats.mojado; c.survival.campfires.restore([]);
    const o = { fuera, bajo, capa, bajoArbol, tSeco: +tSeco.toFixed(1), tMojado: +tMojado.toFixed(1), secaAire10s: +aire.toFixed(1), secaFuego10s: +fuego.toFixed(1) };
    if (!(fuera > 40)) return { motivo: 'la lluvia no moja', ...o };
    if (bajo !== 0) return { motivo: 'bajo el refugio se moja', ...o };
    if (!(capa < fuera * 0.35)) return { motivo: 'la capa impermeable no frena', ...o };
    if (!(bajoArbol < fuera * 0.6 && bajoArbol > 0)) return { motivo: 'bajo un árbol debería mojarse menos (no nada)', ...o };
    if (!(tSeco - tMojado > 3)) return { motivo: 'estar mojado no da frío', ...o };
    if (!(fuego > aire * 4)) return { motivo: 'el fuego no seca más deprisa', ...o };
    return { ok: true, info: o };
  });

  await R('fogata bajo techo: con lluvia fuera se consume más deprisa; bajo el refugio no', () => {
    const { T, S, K, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x + 10, s.z + 10);
    const r = K.crear('refugio_ramas', s.x, s.z, 0);
    c.survival.campfires.restore([{ x: s.x, z: s.z - 0.2, fuel: 600 }, { x: s.x + 6, z: s.z, fuel: 600 }]);
    c.fx.setWeather({ rain: 1, storm: 0 }); T.avanza(30); c.fx.setWeather({ rain: 0, storm: 0 }); // el clima de fx fija la lluvia (si no, vuelve sola al tiempo despejado)
    const [cub, fuera] = c.survival.campfires.list.map((f) => 600 - f.fuel);
    c.survival.campfires.restore([]); K.quitar(r);
    const o = { gastoBajoTecho: +cub.toFixed(1), gastoFuera: +fuera.toFixed(1) };
    if (!(fuera > cub * 2)) return { motivo: 'el techo no protege la fogata', ...o };
    return { ok: true, info: o };
  });

  await R('dificultad: fácil gasta menos, recibe menos daño y recolecta más; difícil al revés; se guarda con la partida', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    const medir = (d) => {
      S.setDificultad(d); Object.assign(S.stats, { hambre: 100, sed: 100, vida: 100 }); T.avanza(60);
      const gasto = 100 - S.stats.hambre; S.stats.vida = 100; S.damage(20, 'prueba'); const dano = 100 - S.stats.vida;
      let n = 0; for (let i = 0; i < 400; i++) n += S.recolecta(2);
      return { gasto: +gasto.toFixed(2), dano: +dano.toFixed(1), recoleccion: +(n / 400).toFixed(2) };
    };
    const f = medir('facil'), n = medir('normal'), d = medir('dificil');
    S.setDificultad('dificil'); S.save(true); S.setDificultad('normal'); S.load(); const cargada = S.dificultad;
    S.setDificultad('normal'); S.clearSave(); S.heridas.limpiar();
    const o = { facil: f, normal: n, dificil: d, cargada };
    if (!(f.gasto < n.gasto * 0.75 && d.gasto > n.gasto * 1.2)) return { motivo: 'consumo por dificultad', ...o };
    if (!(Math.abs(f.dano - 12) < 0.01 && Math.abs(n.dano - 20) < 0.01 && Math.abs(d.dano - 28) < 0.01)) return { motivo: 'daño por dificultad', ...o };
    if (!(Math.abs(f.recoleccion - 3) < 0.01 && n.recoleccion === 2)) return { motivo: 'recolección por dificultad', ...o };
    if (cargada !== 'dificil') return { motivo: 'la dificultad no se guardó', ...o };
    return { ok: true, info: o };
  });

  await R('muerte (normal): la bolsa queda donde caíste, sigue ahí tras reaparecer y se recoge con E; se guarda; morir otra vez la pierde', () => {
    const { T, S, c, p } = window.__T; T.limpiar(); S.setDificultad('normal');
    const s = T.site(); T.jug(s.x, s.z);
    T.dar('lanza', 1); T.dar('baya', 12); S.equipo.torso = { item: 'chaleco_cuero', dur: 80, cal: 2, rep: 0 };
    S.damage(500, 'prueba'); const ev = S.ultimaMuerte; const b1 = S.bolsa();
    S.respawn('playa'); T.avanza(0.5); const trasReap = S.bolsa();
    S.save(true); const enSave = JSON.parse(localStorage.getItem('isla-primordial:partida:v1')).bolsa;
    // volver hasta la bolsa y recogerla con E
    T.jug(b1.x, b1.z + 1.6, 0, -0.75); T.avanza(0.2);
    const objetivo = p.target?.hit?.id === 'bolsa';
    c.events.emit('input:action', { action: 'interactuar', pressed: true });
    const rec = { lanza: S.inventory.has('lanza'), baya: S.inventory.count('baya'), chaleco: S.inventory.has('chaleco_cuero'), bolsa: S.bolsa() };
    // segunda muerte con bolsa pendiente: se pierde
    S.damage(500, 'prueba'); S.respawn('playa'); T.dar('piedra', 3); S.damage(500, 'prueba'); const segunda = S.ultimaMuerte; S.respawn('playa');
    S.clearSave();
    const o = { ev, b1, trasReap: !!trasReap, enSave: !!enSave?.items?.length, objetivo, rec, segunda };
    if (!b1 || b1.objetos !== 3) return { motivo: 'la bolsa no tiene las 3 cosas (lanza, bayas, chaleco)', ...o };
    if (!trasReap) return { motivo: 'la bolsa desapareció al reaparecer', ...o };
    if (!o.enSave) return { motivo: 'la bolsa no se guarda con la partida', ...o };
    if (!objetivo || !rec.lanza || rec.baya !== 12 || !rec.chaleco || rec.bolsa) return { motivo: 'no se recogió todo con E', ...o };
    if (!(segunda.perdida === 3 && segunda.objetos === 1)) return { motivo: 'morir otra vez no perdió la bolsa anterior', ...o };
    return { ok: true, info: o };
  });

  await R('muerte (fácil y difícil): fácil conserva ropa y barra rápida y suma la bolsa vieja; en difícil la bolsa caduca en un día de juego', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const s = T.site(); T.jug(s.x, s.z);
    S.setDificultad('facil');
    T.dar('lanza', 1); S.inventory.add('fibra', 20); S.inventory.move(S.slots.findIndex((q) => q?.item === 'fibra'), 14); S.equipo.torso = { item: 'chaleco_cuero', dur: 80, cal: 1, rep: 0 };
    S.damage(500, 'prueba'); const f1 = { lanza: S.inventory.has('lanza'), fibra: S.inventory.count('fibra'), chaleco: !!S.equipo.torso, bolsa: S.bolsa()?.objetos };
    S.respawn('playa'); S.inventory.add('madera', 5); S.inventory.move(S.slots.findIndex((q) => q?.item === 'madera'), 20);
    S.damage(500, 'prueba'); const f2 = { bolsa: S.bolsa()?.objetos, perdida: S.ultimaMuerte.perdida }; S.respawn('playa');
    S.setDificultad('dificil'); S.inventory.add('piedra', 4); S.inventory.move(S.slots.findIndex((q) => q?.item === 'piedra'), 25);
    S.damage(500, 'prueba'); S.respawn('playa');
    const expira0 = S.bolsa()?.expira;
    c.time.elapsed += c.config.time.dayLengthSec + 5; T.avanza(0.2);
    const tras = S.bolsa();
    S.setDificultad('normal'); S.slots.fill(null); S.equipo.torso = null;
    const o = { f1, f2, expira0, trasUnDia: tras };
    if (!(f1.lanza && f1.chaleco && f1.fibra === 0 && f1.bolsa === 1)) return { motivo: 'fácil: no conservó barra y ropa o no embolsó el resto', ...o };
    if (!(f2.bolsa === 2 && f2.perdida === 0)) return { motivo: 'fácil: la bolsa vieja no se sumó', ...o };
    if (!(expira0 > 1400) || tras) return { motivo: 'difícil: la bolsa no caduca en un día', ...o };
    return { ok: true, info: o };
  });

  await R('mundo guardado: un árbol talado sigue talado tras guardar y cargar (y su colisión no vuelve)', () => {
    const { T, S, c } = window.__T; T.limpiar();
    const s = T.site(), w = c.world, Fl = c.flora;
    T.jug(s.x, s.z); T.avanza(2);
    let arbol = null; for (let rr = 6; rr < 600 && !arbol; rr += 6) for (let a = 0; a < 6.283; a += 0.3) { const q = w.colliders.query(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr, 0.5, []).find((k) => k.kind === 'arbol'); if (q) { arbol = q; break; } }
    if (!arbol) return 'no hay árboles cerca';
    const id = arbol.owner, ax = arbol.x, az = arbol.z;
    for (let i = 0; i < 40 && w.colliders.query(ax, az, 0.3, []).some((k) => k.owner === id); i++) Fl.damage(id, 60, 'hacha_piedra', ['talar']);
    const talado = !w.colliders.query(ax, az, 0.3, []).some((k) => k.owner === id);
    const enLista = Fl.serializar().some(([x]) => x === id);
    S.save(true); Fl.restaurar([]); S.load();
    const trasCargar = { lista: Fl.serializar().some(([x]) => x === id), colision: w.colliders.query(ax, az, 0.3, []).some((k) => k.owner === id) };
    S.clearSave();
    const o = { id, talado, enLista, trasCargar };
    if (!talado || !enLista) return { motivo: 'no se taló o no quedó registrado', ...o };
    if (!trasCargar.lista || trasCargar.colision) return { motivo: 'tras cargar el árbol volvió', ...o };
    return { ok: true, info: o };
  });

  await page.close();

  // ------------------------------------------------------------------------------------------ F2.3 panel de contenedor (con interfaz)
  if (!only || only.test('panel')) {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    pg.on('pageerror', (e) => errs.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(`http://127.0.0.1:${port}/?debug=1&quality=low`);
    await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    const t0 = Date.now();
    let res;
    try {
      res = await pg.evaluate(() => {
        const g = window.__game, c = g.ctx, S = c.survival, K = c.construccion, p = c.player;
        c.render = () => {}; c.fauna?.setGrace?.(1e9); c.fauna?.clear?.();
        S.newGame(); g.advance(2, 1 / 30);
        const s = c.world.spawn, x = s.x, z = s.z;
        const cof = K.crear('cofre_madera', x, z - 2.2, 0);
        S.inventory.add('baya', 20); S.inventory.add('madera', 7); S.inventory.add('cuchillo_piedra', 1);
        // abrir con E mirando al cofre
        p.yaw = 0; p.pitch = -0.4; g.advance(2, 1 / 30);
        const objetivo = p.target?.hit?.pieza === cof;
        c.events.emit('input:action', { action: 'interactuar', pressed: true }); g.advance(1, 1 / 30);
        const panel = document.querySelector('.contenedor'), abierto = !!panel && !panel.closest('.screen').classList.contains('hide');
        // dentro del panel: «guardar» también existe en la pantalla de pausa
        const clic = (sel, shift = false) => { const el = document.querySelector('.contenedor ' + sel); el?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: shift })); return !!el; };
        const iB = S.slots.findIndex((q) => q?.item === 'baya'), iM = S.slots.findIndex((q) => q?.item === 'madera');
        clic(`[data-m="${iB}"]`, true); // Mayús: la mitad
        const trasMitad = { mochila: S.inventory.count('baya'), cofre: cof.cont.casillas.filter((q) => q?.item === 'baya').reduce((a, q) => a + q.cantidad, 0) };
        clic(`[data-m="${iM}"]`); // entera
        const trasMadera = cof.cont.casillas.some((q) => q?.item === 'madera' && q.cantidad === 7) && !S.inventory.has('madera');
        clic('[data-a="tomar"]');
        const trasTomar = { baya: S.inventory.count('baya'), madera: S.inventory.count('madera'), cofreVacio: cof.cont.casillas.every((q) => !q) };
        // «Guardar todo» deja la barra rápida: el cuchillo (barra) se queda; lo de las casillas 10+ se guarda
        S.inventory.move(S.slots.findIndex((q) => q?.item === 'madera'), 15);
        clic('[data-a="guardar"]');
        const trasGuardar = { madera: S.inventory.count('madera'), cuchillo: S.inventory.has('cuchillo_piedra') };
        const prompt = document.querySelector('.target .ta')?.textContent ?? '';
        // E cierra; luego reabrir y alejarse lo cierra solo
        c.events.emit('input:action', { action: 'interactuar', pressed: true }); g.advance(1, 1 / 30);
        const cerradoE = document.querySelector('.contenedor')?.closest('.screen').classList.contains('hide') ?? true;
        c.ui.abrirContenedor(cof); g.advance(1, 1 / 30);
        p.teleport(x + 8, z + 8); g.advance(2, 1 / 30);
        const cerradoLejos = document.querySelector('.contenedor')?.closest('.screen').classList.contains('hide') ?? true;
        return { objetivo, abierto, trasMitad, trasMadera, trasTomar, trasGuardar, cerradoE, cerradoLejos, prompt, bloqueo: c.ui.blocksInput };
      });
    } catch (e) { res = { error: String(e).slice(0, 300) }; }
    const r = res, mal = r.error ? r.error : !r.objetivo ? 'el cofre no quedó como objetivo' : !r.abierto ? 'E no abrió el panel'
      : !(r.trasMitad.mochila === 10 && r.trasMitad.cofre === 10) ? 'Mayús+clic no pasó la mitad' : !r.trasMadera ? 'clic no pasó la casilla entera'
      : !(r.trasTomar.baya === 20 && r.trasTomar.madera === 7 && r.trasTomar.cofreVacio) ? 'Tomar todo no sacó todo' : !(r.trasGuardar.madera === 0 && r.trasGuardar.cuchillo) ? 'Guardar todo no respetó la barra rápida'
      : !r.cerradoE ? 'E no cerró el panel' : !r.cerradoLejos ? 'alejarse no cerró el panel' : null;
    resultados.push({ nombre: 'panel', ok: !mal });
    console.log(`${!mal ? '✔' : '✘'} panel de contenedor: E abre, clic pasa la casilla, Mayús+clic la mitad, Guardar/Tomar todo (la barra rápida se queda), E y alejarse cierran  (${Date.now() - t0} ms)${mal ? '\n    → ' + mal + ' ' + JSON.stringify(r).slice(0, 500) : '  ' + JSON.stringify(r).slice(0, 300)}`);

    // comparar equipo en el inventario: ropa contra lo puesto, arma contra lo que hay en la mano
    const t1 = Date.now();
    let rc;
    try {
      rc = await pg.evaluate(() => {
        const g = window.__game, c = g.ctx, S = c.survival;
        S.newGame(); g.advance(1, 1 / 30);
        S.equipo.torso = { item: 'chaleco_cuero', dur: 100, cal: 1, rep: 0 };
        S.inventory.add('peto_osteodermo', 1); S.inventory.add('lanza', 1); S.inventory.add('maza_piedra', 1);
        S.select(S.slots.findIndex((q) => q?.item === 'lanza'));
        c.events.emit('input:action', { action: 'inventario', pressed: true }); g.advance(1, 1 / 30);
        const ver = (id) => { const i = S.slots.findIndex((q) => q?.item === id); document.querySelector(`.inv .slot[data-i="${i}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); const cm = document.querySelector('.inv .detail .cmp'); return cm ? { texto: cm.textContent.replace(/\s+/g, ' ').trim(), up: cm.querySelectorAll('i.up').length, down: cm.querySelectorAll('i.down').length } : null; };
        const peto = ver('peto_osteodermo'), maza = ver('maza_piedra'), lanzaMisma = ver('lanza');
        c.events.emit('input:action', { action: 'inventario', pressed: true });
        return { peto, maza, lanzaMisma };
      });
    } catch (e) { rc = { error: String(e).slice(0, 300) }; }
    const malC = rc.error ? rc.error : !rc.peto || !/Chaleco de cuero/.test(rc.peto.texto) || !/Armadura/.test(rc.peto.texto) || !(rc.peto.up >= 1 && rc.peto.down >= 1) ? 'la ropa no se compara con lo puesto (armadura sube, ruido/peso bajan)'
      : !rc.maza || !/Lanza/.test(rc.maza.texto) || !/Daño/.test(rc.maza.texto) ? 'el arma no se compara con la de la mano' : rc.lanzaMisma ? 'compara la lanza consigo misma' : null;
    resultados.push({ nombre: 'comparar', ok: !malC });
    console.log(`${!malC ? '✔' : '✘'} comparar equipo: la ropa contra lo puesto en su ranura y el arma contra la de la mano, con subidas y bajadas  (${Date.now() - t1} ms)${malC ? '\n    → ' + malC + ' ' + JSON.stringify(rc).slice(0, 600) : '  ' + JSON.stringify(rc).slice(0, 400)}`);
    await pg.close();
  }
  if (errs.length) { console.log('✘ errores en la página:', errs.slice(0, 5)); codigo = 1; }
} catch (e) { console.log('✘ EXCEPCIÓN', e); codigo = 1; } finally {
  clearTimeout(vigia);
  await browser?.close().catch(() => {}); matar();
}
const mal = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - mal}/${resultados.length} escenarios correctos`);
process.exit(mal || codigo ? 1 : 0);
