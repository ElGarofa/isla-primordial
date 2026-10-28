#!/usr/bin/env node
// Prueba automática de las especies generadas por familias (src/fauna/familias/*): contrato de datos, construcción y animación de cada una
// (marcha, apoyo de los pies en el suelo, patinaje, NaN), hitboxes, despiece, montura y simulación de IA. Usa window.__game (?debug=1).
// Uso: node tools/especies-test.mjs [regex de escenario] [--fam bipedos|cuadrupedos|...] [--ids a,b,c]
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
const fam = opt('fam'), idsOpt = opt('ids'), siteRank = +(opt('site') ?? 0); // --site N: usa el N-ésimo solar más llano (diagnóstico de sensibilidad al terreno)
const only = args[0] && !args[0].startsWith('--') ? new RegExp(args[0]) : null;
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript((r) => { window.__SITE_RANK = r; }, siteRank);
await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low`);
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, S = c.survival;
  const T = window.__T = { g, c, p, F, S };
  T.fam = await import('/src/fauna/familias/index.js');
  T.sp = (await import('/src/fauna/species.js')).SPECIES;
  T.items = await import('/src/core/items.js');
  c.render = () => {};
  c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
  T.site = () => {
    if (T._site) return T._site;
    const w = c.world, sp = w.spawn, cand = [];
    // solar de prueba: pradera sin troncos ni rocas a 90 m (la carrera de un saurópodo recorre ~50 m y un obstáculo detiene el cuerpo con las patas aún en marcha) y con la franja
    // por la que caminan las criaturas (hacia +x, yaw π/2, 90 m × ±12 m) casi llana: en un mapa con relieve, una ladera hace que las patas de un cuerpo de 30 m «patinen» o se «hundan» en la medida
    for (let x = sp.x - 1500; x <= sp.x + 1500; x += 16) for (let z = sp.z - 1500; z <= sp.z + 600; z += 16) {
      if (Math.abs(x) > w.limite - 200 || Math.abs(z) > w.limite - 120 || w.getBiome(x, z) !== 'pradera') continue;
      let lo = 1e9, hi = -1e9, ok = true;
      for (let dx = -10; dx <= 90 && ok; dx += 6) for (let dz = -12; dz <= 12; dz += 6) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5 || w.getBiome(x + dx, z + dz) !== 'pradera') { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (ok && hi - lo < 4) cand.push({ x, z, desnivel: +(hi - lo).toFixed(2), obst: w.colliders.query(x + 40, z, 70, []).length }); // puntúa el desnivel y penaliza los obstáculos
    }
    cand.sort((a, b) => (a.desnivel + 1.5 * Math.min(a.obst, 6)) - (b.desnivel + 1.5 * Math.min(b.obst, 6)));
    return (T._site = cand[Math.min(cand.length - 1, window.__SITE_RANK ?? 0)] ?? null);
  };
  T.avanza = (seg, dt = 1 / 30) => { g.advance(Math.max(1, Math.round(seg / dt)), dt); };
  T.limpia = () => { F.clear(); };
  T.jug = (x, z) => { p.teleport(x, z); p.velocity.set(0, 0, 0); S.heal(100); };
  T.modelo = (esp, v, o = {}) => {
    T.limpia();
    const s = T.site(); T.jug(s.x + 14, s.z + 14);
    const c2 = F.spawnAt(esp, s.x, s.z, { frozen: true, yaw: o.yaw ?? Math.PI / 2, tint: 0.5 });
    c2.override = v > 0 ? { speed: v } : null;
    return c2;
  };
  // vértices de la malla animada en coordenadas locales de la criatura (x lateral, y arriba, z adelante)
  T.vertices = (c2, paso = 2) => {
    c2.group.updateMatrixWorld(true);
    const m = c2.mesh, P = m.geometry.attributes.position, v = new c2.position.constructor(), out = [];
    const sy = Math.sin(c2.yaw), cy = Math.cos(c2.yaw), px = c2.position.x, py = c2.position.y, pz = c2.position.z;
    m.skeleton.update();
    for (let i = 0; i < P.count; i += paso) {
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
      const dx = v.x - px, dz = v.z - pz;
      out.push([dx * cy - dz * sy, v.y - py, dx * sy + dz * cy]);
    }
    return out;
  };
});

const ids = await page.evaluate(([fam, idsOpt]) => {
  const I = window.__T.fam.FAMILIAS_INFO;
  if (idsOpt) return idsOpt.split(',');
  return fam ? (I[fam] ?? []) : Object.values(I).flat();
}, [fam, idsOpt]);
console.log(`Especies a probar: ${ids.length}${fam ? ` (familia ${fam})` : ''}`);

const resultados = [];
async function R(nombre, fn, arg) {
  if (only && !only.test(nombre)) return;
  const t0 = Date.now(); let res;
  try { res = await page.evaluate(fn, arg); } catch (e) { res = 'EXCEPCIÓN: ' + String(e).slice(0, 300); }
  const ok = res == null || (typeof res === 'object' && res.ok === true);
  resultados.push({ nombre, ok });
  console.log(`${ok ? '✔' : '✘'} ${nombre}  (${Date.now() - t0} ms)${ok ? (res && res.info ? '  ' + JSON.stringify(res.info) : '') : '\n    → ' + (typeof res === 'string' ? res : JSON.stringify(res))}`);
}

await R('contrato: cada especie tiene los campos que exige Creature, despiece válido y entrada en el catálogo', (ids) => {
  const T = window.__T, mal = [];
  for (const id of ids) {
    const sp = T.sp[id], p = [];
    if (!sp) { mal.push(`${id}: no está en SPECIES`); continue; }
    if (typeof sp.build !== 'function') p.push('sin build');
    if (!(sp.vidaMax > 0)) p.push('vidaMax');
    if (!(sp.vel?.walk > 0) || !(sp.vel.run >= sp.vel.walk)) p.push('vel');
    if (!(sp.cycle?.walk > 0) || !(sp.cycle.run >= sp.cycle.walk)) p.push('cycle');
    if (!(sp.stance > 0.3 && sp.stance < 0.9)) p.push('stance');
    if (!(sp.radius > 0)) p.push('radius');
    if (!Array.isArray(sp.hit) || !sp.hit.length || sp.hit.some((h) => h.length !== 4 || h.some((v) => !Number.isFinite(v)))) p.push('hit');
    if (!sp.ai || typeof sp.ai !== 'object') p.push('ai');
    const cos = T.items.COSECHA[id];
    if (!cos || !cos.length) p.push('sin despiece'); else for (const q of cos) if (!T.items.ITEMS?.[q.item] && !T.items.ITEM_DEFS?.[q.item] && !(T.items.getItem && T.items.getItem(q.item))) { p.push('item desconocido ' + q.item); break; }
    if (sp.montura && !(sp.montura.ancla?.length === 3 && sp.montura.ancla.every(Number.isFinite))) p.push('ancla de montura');
    if (p.length) mal.push(`${id}: ${p.join(', ')}`);
  }
  return mal.length ? { motivo: `${mal.length} especies con datos inválidos`, mal: mal.slice(0, 20) } : { ok: true, info: { especies: ids.length } };
}, ids);

// Construcción + marcha + carrera: vértices finitos, apoyo en el suelo, sin patinar, sin deformaciones
await R('animación: marcha y carrera de cada especie sin NaN, pies apoyados en el suelo, sin hundirse ni flotar', (ids) => {
  const T = window.__T, mal = [], info = [];
  for (const id of ids) {
    const sp = T.sp[id];
    if (sp.ai?.vuelo || sp.nada) continue; // los voladores se prueban en su propio escenario (vuelo) y los nadadores en tools/nado-test.mjs
    const prob = [];
    for (const [k, v] of [['walk', sp.vel.walk], ['run', sp.vel.run]]) {
      let c;
      try { c = T.modelo(id, v); } catch (e) { prob.push('spawn: ' + String(e).slice(0, 80)); break; }
      if (!c.legs?.length) { prob.push('sin patas'); break; }
      T.avanza(2.5);
      const H = sp.hips ?? 1, minimos = [], maximos = [];
      let box0 = null;
      const hist = c.legs.map(() => []);
      const nF = Math.round(Math.min(5, 3.2 * (sp.cycle[k] / Math.max(0.3, v))) * 30);
      for (let i = 0; i < nF; i++) {
        T.g.advance(1, 1 / 30);
        c.legs.forEach((l, j) => hist[j].push({ x: l.wx, z: l.wz, lift: l.ik.lift }));
        if (i % 4 === 0) {
          const V = T.vertices(c, 3);
          let mn = 1e9, mx = -1e9, zmn = 1e9, zmx = -1e9, ok = true;
          for (const q of V) { if (!(Number.isFinite(q[0] + q[1] + q[2]))) { ok = false; break; } mn = Math.min(mn, q[1]); mx = Math.max(mx, q[1]); zmn = Math.min(zmn, q[2]); zmx = Math.max(zmx, q[2]); }
          if (!ok) { prob.push(`${k}: vértice no finito`); break; }
          minimos.push(mn); maximos.push(mx);
          if (!box0) box0 = { alto: mx - mn, largo: zmx - zmn };
          else if ((mx - mn) > box0.alto * 1.35 + 0.3 || (zmx - zmn) > box0.largo * 1.35 + 0.3) prob.push(`${k}: la malla se estira (alto ${(mx - mn).toFixed(1)} vs ${box0.alto.toFixed(1)})`);
        }
      }
      if (!minimos.length) break;
      const peorHundido = Math.min(...minimos), peorFlota = Math.max(...minimos), tol = 0.1 * H + 0.12 + 0.025 * (box0?.largo ?? 0); // el solar de la prueba tiene pendientes de hasta ~10 %: un cuerpo muy largo y bajo (cocodrilo de 10 m) deja la cola por debajo del origen aunque el terreno suba con él
      if (peorHundido < -tol - 0.1 * H) prob.push(`${k}: el cuerpo se hunde ${peorHundido.toFixed(2)} m`);
      if (peorFlota > tol) prob.push(`${k}: los pies no tocan el suelo (mínima ${peorFlota.toFixed(2)} m sobre el suelo)`);
      // patinaje: velocidad mundial del pie mientras está apoyado respecto a la del cuerpo
      const rel = [];
      hist.forEach((h) => {
        const mn = Math.min(...h.map((q) => q.lift)), mx = Math.max(...h.map((q) => q.lift)), lim = mn + 0.12 * (mx - mn) + 0.0005, vs = [];
        for (let i = 1; i < h.length; i++) if (h[i].lift <= lim && h[i - 1].lift <= lim) vs.push(Math.hypot(h[i].x - h[i - 1].x, h[i].z - h[i - 1].z) * 30);
        if (vs.length >= 4) { vs.sort((a, b) => a - b); rel.push(vs[Math.floor(vs.length / 2)] / Math.max(0.1, c.speed)); }
      });
      const patina = rel.length ? Math.max(...rel) : 0;
      if (patina > 0.3 && v / sp.cycle[k] < 6) prob.push(`${k}: patinaje ${patina.toFixed(2)}`); // a más de 6 pasos por segundo el muestreo (30 Hz) no resuelve el apoyo
      if (k === 'walk') info.push([id, +peorHundido.toFixed(2), +peorFlota.toFixed(2), +patina.toFixed(2)]);
    }
    if (prob.length) mal.push(`${id}: ${prob.join('; ')}`);
  }
  return mal.length ? { motivo: `${mal.length} de ${ids.length} especies con problemas de animación`, mal: mal.slice(0, 25) } : { ok: true, info: { especies: ids.length, peor: { hundido: Math.min(...info.map((q) => q[1])), flota: Math.max(...info.map((q) => q[2])), patinaje: Math.max(...info.map((q) => q[3])) } } };
}, ids);

await R('vuelo: cada volador orbita 25 s sobre el relieve sin NaN, con su radio y velocidad, aleteando y planeando; abatido, cae y queda tendido', (ids) => {
  const T = window.__T, { F } = T, w = T.c.world, mal = [], info = [];
  const aire = ids.filter((id) => T.sp[id].ai?.vuelo);
  for (const id of aire) {
    const sp = T.sp[id], vp = typeof sp.ai.vuelo === 'object' ? sp.ai.vuelo : null, prob = [];
    T.limpia();
    const s = T.site(); T.jug(s.x + 60, s.z);
    const c = F.spawnAt(id, s.x, s.z);
    if (!c.flight) { mal.push(`${id}: sin vuelo`); continue; }
    const dt = 1 / 15, cx = c.flight.cx, cz = c.flight.cz, r = c.flight.r;
    let minAgl = 1e9, maxAgl = -1e9, vMax = 0, vMin = 1e9, flapT = 0, glideT = 0, nan = 0, dR = 0, prev = null, bank = 0, ext = 0;
    T.avanza(3, dt); // la altura se alcanza en un par de segundos
    prev = [c.position.x, c.position.y, c.position.z];
    for (let i = 0; i < 25 / dt; i++) {
      T.g.advance(1, dt);
      const q = c.position, ground = Math.max(w.getHeight(q.x, q.z), 0), agl = q.y - ground;
      if (![q.x, q.y, q.z, c.roll, c.pitch].every(Number.isFinite)) { nan++; break; }
      minAgl = Math.min(minAgl, agl); maxAgl = Math.max(maxAgl, agl);
      if (i % 15 === 14) { const v = Math.hypot(q.x - prev[0], q.z - prev[2]); vMax = Math.max(vMax, v); vMin = Math.min(vMin, v); prev = [q.x, q.y, q.z]; } // velocidad media por segundo (las criaturas lejanas se actualizan por tandas)
      dR = Math.max(dR, Math.abs(Math.hypot(q.x - cx, q.z - cz) - r));
      if (c.flight.flap) flapT += dt; else glideT += dt;
      bank = Math.max(bank, Math.abs(c.roll));
      if (Object.values(c.bones).some((b) => !Number.isFinite(b.position.x + b.quaternion.x + b.quaternion.w))) { nan++; break; }
      if (i % 20 === 0) { const V = T.vertices(c, 4); if (V.some((p) => !Number.isFinite(p[0] + p[1] + p[2]))) { nan++; break; } ext = Math.max(ext, ...V.map((p) => Math.abs(p[0]))); }
    }
    const altMin = vp ? vp.alt[0] : 45;
    if (nan) prob.push('valores no finitos');
    if (minAgl < Math.max(2, 0.4 * altMin)) prob.push(`vuela demasiado bajo (${minAgl.toFixed(1)} m sobre el suelo, mínimo previsto ${altMin})`);
    if (dR > 1.5) prob.push(`se sale de su órbita ${dR.toFixed(1)} m`);
    if (vMax > sp.vel.walk * 1.25 + 0.5 || vMin < sp.vel.walk * 0.75 - 0.5) prob.push(`velocidad ${vMin.toFixed(1)}–${vMax.toFixed(1)} m/s, prevista ${sp.vel.walk}`);
    const L = sp.cat?.tamano ?? 0;
    if (L && ext < 0.35 * L) prob.push(`envergadura visible ${ (2 * ext).toFixed(1) } m, esperada ≈ ${L} m`);
    // abatido: cae hasta el suelo y queda tendido y quieto
    if (!prob.length) {
      c.die();
      let t = 0, y0 = c.position.y; while (t < 20 && c.position.y > Math.max(w.getHeight(c.position.x, c.position.z), 0) + c.flight.suelo + 0.05) { T.g.advance(1, dt); t += dt; }
      const gy = Math.max(w.getHeight(c.position.x, c.position.z), 0) + c.flight.suelo;
      if (c.position.y > gy + 0.1) prob.push(`no llega al suelo tras ${t.toFixed(0)} s (desde ${y0.toFixed(0)} m)`);
      T.avanza(2, dt);
      const q0 = [c.position.y, c.group.rotation.x, c.group.rotation.z]; T.avanza(2, dt);
      if (Math.abs(c.position.y - q0[0]) > 0.02 || Math.abs(c.group.rotation.x - q0[1]) > 0.02 || Math.abs(c.group.rotation.z - q0[2]) > 0.02) prob.push('el cadáver no se queda quieto');
      if (Math.abs(c.group.rotation.x) > 0.05 || Math.abs(c.group.rotation.z) > 0.05) prob.push('el cadáver queda inclinado');
      if (!(t < 12)) prob.push(`caída lenta (${t.toFixed(1)} s)`);
    }
    info.push([id, +minAgl.toFixed(0), +maxAgl.toFixed(0), +(flapT / (flapT + glideT)).toFixed(2), +bank.toFixed(2)]);
    if (prob.length) mal.push(`${id}: ${prob.join('; ')}`);
  }
  T.limpia();
  return mal.length ? { motivo: `${mal.length} de ${aire.length} voladores con problemas`, mal: mal.slice(0, 20) } : { ok: true, info: { voladores: aire.length, aglMin_aglMax_aleteo_inclinacion: info } };
}, ids);

await R('hitboxes: las esferas de impacto cubren el cuerpo y cada una contiene geometría; el ancla de montura queda sobre el lomo', (ids) => {
  const T = window.__T, mal = [], cobs = [];
  for (const id of ids) {
    const sp = T.sp[id], c = T.modelo(id, 0); T.avanza(1.5);
    const V = T.vertices(c, 3), hit = sp.hit.map((h) => c.esferaLocal(h, [0, 0, 0, 0])); // los voladores ruedan al virar: sus esferas se inclinan igual
    let dentro = 0; for (const [x, y, z] of V) if (hit.some(([hx, hy, hz, hr]) => Math.hypot(x - hx, y - hy, z - hz) < hr + 0.5 + 0.08 * (sp.hips ?? 1))) dentro++;
    const cob = dentro / V.length; cobs.push([id, +cob.toFixed(2)]);
    const largo = Math.max(...V.map((v) => v[2])) - Math.min(...V.map((v) => v[2])); // el cuerpo se inclina con el terreno: las puntas largas (cola, cuello) se desvían del reposo
    const vacias = hit.filter(([hx, hy, hz, hr]) => !V.some(([x, y, z]) => Math.hypot(x - hx, y - hy, z - hz) < hr * 0.95 + 0.3 + 0.09 * largo));
    const p = [];
    if (cob < 0.75) p.push(`cobertura ${cob.toFixed(2)}`);
    if (vacias.length) p.push(`${vacias.length} esferas vacías (p. ej. [${vacias.slice(0, 2).map((h) => h.map((q) => +q.toFixed(2)).join(', ')).join('] [')}])`);
    if (sp.montura) {
      const [ax, ay, az] = sp.montura.ancla;
      const lomo = V.filter(([x, y, z]) => Math.abs(x - ax) < 0.5 && Math.abs(z - az) < 0.5 && y < ay + 0.6).reduce((m, v) => Math.max(m, v[1]), -1e9);
      // tolerancia de -0,3 m: el cuerpo se inclina con la ladera del solar y el lomo de un cuerpo de 8–10 m queda 20–26 cm sobre el ancla según el terreno (pentaceratops)
      if (!(ay - lomo > -0.3 && ay - lomo < 1.4)) p.push(`ancla de montura a ${(ay - lomo).toFixed(2)} m del lomo`);
    }
    if (p.length) mal.push(`${id}: ${p.join('; ')}`);
  }
  return mal.length ? { motivo: `${mal.length} especies con hitboxes dudosas`, mal: mal.slice(0, 25) } : { ok: true, info: { especies: ids.length, menorCobertura: cobs.sort((a, b) => a[1] - b[1]).slice(0, 4) } };
}, ids);

await R('despiece: matar y despiezar da los objetos de su tabla', (ids) => {
  const T = window.__T, { F } = T, mal = [];
  for (const id of ids) {
    const c = T.modelo(id, 0); T.avanza(0.5);
    try { c.die(); T.avanza(1.2); } catch (e) { mal.push(`${id}: die() ${String(e).slice(0, 60)}`); continue; }
    if (!F.despiezar(c) || !c.despiezada) mal.push(`${id}: no se despieza`);
    else if (!Number.isFinite(c.group.rotation.z)) mal.push(`${id}: pose de muerte no finita`);
  }
  return mal.length ? { motivo: `${mal.length} fallos`, mal: mal.slice(0, 20) } : { ok: true, info: { especies: ids.length } };
}, ids);

await R('IA: cada especie vive 25 s de simulación (jugador cerca) sin NaN, sin salir de su velocidad y con sus habilidades registradas', (ids) => {
  const T = window.__T, { F, p } = T, mal = [];
  for (const id of ids) {
    const sp = T.sp[id];
    if (sp.ai?.vuelo) continue;
    T.limpia();
    const s = T.site(); T.jug(s.x + 40, s.z); T.avanza(0.1);
    const herd = F.spawnHerd ? F.spawnHerd(id, s.x, s.z, sp.ai?.manada ? 3 : 1) : [F.spawnAt(id, s.x, s.z)];
    p.yaw = Math.PI / 2; T.avanza(25, 1 / 15);
    const prob = [];
    for (const c of herd) {
      if (![c.position.x, c.position.y, c.position.z, c.speed].every(Number.isFinite)) prob.push('posición no finita');
      else if (c.speed > sp.vel.run * 1.5 + 1) prob.push(`velocidad ${c.speed.toFixed(1)} > ${sp.vel.run}`);
      if (c.bones && Object.values(c.bones).some((b) => !Number.isFinite(b.position.x + b.quaternion.x + b.quaternion.w))) prob.push('hueso con NaN');
    }
    if (prob.length) mal.push(`${id}: ${[...new Set(prob)].join('; ')}`);
  }
  T.limpia();
  return mal.length ? { motivo: `${mal.length} especies con IA inestable`, mal: mal.slice(0, 20) } : { ok: true, info: { especies: ids.length } };
}, ids);

await R('diversidad: ninguna silueta se repite (largo/alto, cuello, cola, triángulos)', (ids) => {
  const T = window.__T, f = [];
  for (const id of ids) {
    const sp = T.sp[id], b = sp.build(), pos = b.geo.attributes.position;
    let mnY = 1e9, mxY = -1e9, mnZ = 1e9, mxZ = -1e9, mxX = 0;
    for (let i = 0; i < pos.count; i++) { mnY = Math.min(mnY, pos.getY(i)); mxY = Math.max(mxY, pos.getY(i)); mnZ = Math.min(mnZ, pos.getZ(i)); mxZ = Math.max(mxZ, pos.getZ(i)); mxX = Math.max(mxX, Math.abs(pos.getX(i))); }
    const L = mxZ - mnZ, H = mxY - mnY;
    f.push({ id, v: [L / H, mxX / H, (mxZ) / L, (b.geo.index ? b.geo.index.count : pos.count) / 3 / 6000, (sp.hips ?? 1) / H], masa: sp.scale });
  }
  const gemelos = [];
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
    const d = Math.hypot(...f[i].v.map((x, k) => (x - f[j].v[k]) / Math.max(0.05, Math.abs(x)))); if (d < 0.015) gemelos.push(`${f[i].id}≈${f[j].id}`);
  }
  if (gemelos.length > Math.max(3, f.length * 0.1)) return { motivo: 'demasiadas siluetas casi idénticas', gemelos };
  return { ok: true, info: { gemelos } };
}, ids);

console.log(`\nErrores de consola/página: ${errs.length}`);
errs.slice(0, 8).forEach((e) => console.log('  ' + e.slice(0, 200)));
const fallos = resultados.filter((r) => !r.ok).length + (errs.length ? 1 : 0);
console.log(fallos ? `\n${fallos} escenario(s) con fallos` : `\nTodo en orden (${resultados.length} escenarios)`);
await browser.close(); server.kill();
process.exit(fallos ? 1 : 0);
