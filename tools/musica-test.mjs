#!/usr/bin/env node
// Prueba de la música de portada («temita»): sin modo debug (menú real), sin el permiso de autoplay del navegador, con gestos reales de Playwright.
// Uso: tools/lock.sh node tools/musica-test.mjs [regex]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${port}`); if (r.ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); // SIN --autoplay-policy: se prueba la política real
const results = [], errores = [];
// vigilante: si algo se cuelga, se informa lo hecho y se cierra todo (nunca dejar el navegador ni el servidor vivos)
setTimeout(() => { console.log('✘ la prueba superó 10 min: se aborta'); for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.nombre}`); browser.close().catch(() => {}); server.kill(); process.exit(2); }, 600000).unref();
const T = (nombre, ok, msg = '') => results.push({ nombre, ok, msg });
const URL0 = `http://127.0.0.1:${port}/?quality=low`;
const esperaJuego = (page) => page.waitForFunction(() => window.__ctx && window.__ctx.state === 'menu' && window.__ctx.audio && !!document.querySelector('.velo'), null, { timeout: 300000 });
const nuevaPagina = async (q = '', bloquear = false) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errores.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  if (bloquear) await page.route('**/audio/temita.mp3', (r) => r.abort());
  await page.goto(URL0 + q);
  await esperaJuego(page);
  return page;
};
const si = (re) => !only || only.test(re);
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

try {
// ---- archivo
if (si('archivo')) {
  const f = path.join(root, 'public/audio/temita.mp3');
  let tam = 0; try { tam = statSync(f).size; } catch { /* ausente */ }
  T('archivo: temita.mp3 existe y pesa < 8 MB', tam > 1e6 && tam < 8e6, `${(tam / 1e6).toFixed(2)} MB`);
}

// ---- recorrido completo: velo → gesto → suena → Jugar → fundido → silencio → volver al menú
if (si('recorrido|velo|suena|fundido|menu')) {
  const page = await nuevaPagina();
  const can = await page.evaluate(() => new Audio().canPlayType('audio/mpeg'));
  T('navegador: puede reproducir MP3', can === 'probably' || can === 'maybe', `canPlayType=${can}`);
  const s0 = await page.evaluate(() => ({ velo: !document.querySelector('.velo').classList.contains('hide'), running: window.__ctx.audio.running, estado: window.__ctx.audio.titulo.estado, sonando: window.__ctx.audio.titulo.sonando }));
  T('antes del gesto: se ve el velo y no suena nada', s0.velo && !s0.sonando && !s0.running, JSON.stringify(s0));
  const tClic = Date.now();
  await page.mouse.click(480, 270); // clic sobre el velo (cubre toda la pantalla)
  // demora hasta que la pista avanza de verdad (en este equipo de pruebas el render por software ocupa la CPU: se mide, no se supone)
  await page.waitForFunction(() => window.__ctx.audio.titulo.tiempo > 0.05, null, { timeout: 20000 }).catch(() => {});
  const demora = Date.now() - tClic;
  // (en este equipo de pruebas un cuadro tarda 4–30 s por el render por software: la demora mide sobre todo eso; en un navegador con GPU es inmediata)
  T('la música empieza en < 15 s tras el clic (precargada durante el menú)', demora < 15000, `${demora} ms`);
  await duerme(2600);
  const s1 = await page.evaluate(() => { const t = window.__ctx.audio.titulo; return { velo: !document.querySelector('.velo').classList.contains('hide'), running: window.__ctx.audio.running, estado: t.estado, sonando: t.sonando, tiempo: t.tiempo, nivel: t.nivel, rms: t.rms(), dur: t.duracion }; });
  T('tras el clic: el velo se oculta y el audio queda activo', !s1.velo && s1.running, JSON.stringify(s1));
  T('tras el clic: la portada suena (estado, tiempo avanza, nivel sube)', s1.sonando && s1.tiempo > 1.2 && s1.nivel > 0.5, `tiempo=${s1.tiempo?.toFixed?.(2)} nivel=${s1.nivel?.toFixed?.(2)}`);
  T('duración de la pista ≈ 189 s', Math.abs(s1.dur - 189) < 2, `${s1.dur}`);
  const rmsOn = []; for (let i = 0; i < 6; i++) { rmsOn.push(await page.evaluate(() => window.__ctx.audio.titulo.rms())); await duerme(150); }
  const med = rmsOn.reduce((a, b) => a + b, 0) / rmsOn.length;
  T('hay señal real en el grafo de audio (RMS > 0,005)', med > 0.005 && rmsOn.every(Number.isFinite), `RMS medio=${med.toFixed(4)}`);
  T('nivel prudente (RMS < 0,5, sin saturar)', med < 0.5, `RMS=${med.toFixed(3)}`);
  // volumen de música: a 0 la portada deja de oírse (RMS ~ 0) y al restaurar vuelve
  const rms0 = await page.evaluate(async () => { window.__ctx.audio.setMusicVolume(0); await new Promise((r) => setTimeout(r, 900)); return window.__ctx.audio.titulo.rms(); });
  T('volumen de música 0: la portada deja de oírse (RMS < 0,001)', rms0 < 0.001, `RMS=${rms0.toFixed(5)}`);
  const rmsV = await page.evaluate(async () => { window.__ctx.audio.setMusicVolume(0.6); await new Promise((r) => setTimeout(r, 900)); let m = 0; for (let i = 0; i < 5; i++) { m += window.__ctx.audio.titulo.rms(); await new Promise((r) => setTimeout(r, 120)); } return m / 5; });
  T('al restaurar el volumen vuelve a oírse', rmsV > 0.005, `RMS=${rmsV.toFixed(4)}`);
  // iniciar partida
  await page.click('[data-a="nueva"]');
  await page.waitForFunction(() => window.__ctx.state === 'playing', null, { timeout: 60000 });
  await duerme(1500);
  const s2 = await page.evaluate(() => { const t = window.__ctx.audio.titulo; return { estado: t.estado, nivel: t.nivel, sonando: !t.pausada }; });
  T('al pulsar Jugar: la portada entra en fundido de salida (sigue sonando, nivel bajando)', s2.estado === 'saliendo' && s2.nivel < 0.98 && s2.nivel > 0.3 && s2.sonando, JSON.stringify(s2));
  await duerme(7500);
  const s3 = await page.evaluate(() => { const t = window.__ctx.audio.titulo; return { estado: t.estado, nivel: t.nivel, ...t.diag }; });
  T('tras ~9 s: el fundido de salida llegó a silencio (reloj de audio)', s3.nivel < 0.02 && s3.reloj >= s3.finSalida, JSON.stringify(s3));
  // la pausa del <audio> la hace el bucle del juego o un temporizador: con cuadros de varios segundos puede tardar; se espera hasta 60 s
  const tP = Date.now();
  await page.waitForFunction(() => window.__ctx.audio.titulo.estado === 'detenida' && window.__ctx.audio.titulo.pausada, null, { timeout: 60000 }).catch(() => {});
  const s3b = await page.evaluate(() => { const t = window.__ctx.audio.titulo; return { estado: t.estado, pausada: t.pausada }; });
  T('después, la pista queda detenida y en pausa', s3b.estado === 'detenida' && s3b.pausada, `${JSON.stringify(s3b)} (+${Date.now() - tP} ms)`);
  const jug = await page.evaluate(() => ({ st: window.__ctx.state, hud: !!document.querySelector('#ui-root .hud, #ui-root [class*=hud]') }));
  T('la partida arrancó', jug.st === 'playing', JSON.stringify(jug));
  // volver al menú (como si se saliera de la partida)
  await page.evaluate(() => window.__ctx.setState('menu'));
  await page.waitForFunction(() => window.__ctx.audio.titulo.sonando, null, { timeout: 15000 }).catch(() => {});
  await duerme(1200);
  const s4 = await page.evaluate(() => { const t = window.__ctx.audio.titulo; return { sonando: t.sonando, veces: t.veces, tiempo: t.tiempo, velo: !document.querySelector('.velo').classList.contains('hide') }; });
  T('al volver al menú la portada reaparece desde el principio y sin velo', s4.sonando && s4.veces === 2 && s4.tiempo < 5 && !s4.velo, JSON.stringify(s4));
  // empezar de nuevo mientras aún está en fundido de entrada no deja la pista a medias
  await page.evaluate(() => window.__ctx.setState('playing'));
  await duerme(500);
  await page.evaluate(() => window.__ctx.setState('menu'));
  await duerme(1500);
  const s5 = await page.evaluate(() => { const t = window.__ctx.audio.titulo; return { sonando: t.sonando, estado: t.estado }; });
  T('menú → partida → menú rápido: vuelve a sonar', s5.sonando && s5.estado === 'sonando', JSON.stringify(s5));
  await page.close();
}

// ---- gesto de teclado en lugar de clic
if (si('teclado')) {
  const page = await nuevaPagina();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__ctx.audio.titulo.sonando, null, { timeout: 15000 }).catch(() => {});
  const s = await page.evaluate(() => ({ sonando: window.__ctx.audio.titulo.sonando, velo: !document.querySelector('.velo').classList.contains('hide') }));
  T('una tecla también quita el velo y arranca la música', s.sonando && !s.velo, JSON.stringify(s));
  await page.close();
}

// ---- jugar directamente sin pasar por el velo (clic en el botón no accesible: el velo lo cubre; se fuerza como lo haría un script)
if (si('directo')) {
  const page = await nuevaPagina();
  await page.evaluate(() => document.querySelector('[data-a="nueva"]').click());
  await page.waitForFunction(() => window.__ctx.state === 'playing', null, { timeout: 60000 });
  await duerme(1500);
  const e = await page.evaluate(() => window.__ctx.audio.titulo.estado);
  T('empezar sin gesto previo no rompe el juego ni deja la portada colgada', ['saliendo', 'detenida', 'esperando'].includes(e) || e === 'sonando', e);
  await page.close();
}

// ---- ?titulo=0: sin portada
if (si('desactivada|titulo=0')) {
  const page = await nuevaPagina('&titulo=0');
  const e = await page.evaluate(() => window.__ctx.audio.titulo.estado);
  await page.mouse.click(480, 270); await duerme(1200);
  const s = await page.evaluate(() => ({ e: window.__ctx.audio.titulo.estado, s: window.__ctx.audio.titulo.sonando, run: window.__ctx.audio.running }));
  T('?titulo=0: no hay portada y el audio sigue funcionando', e === 'ausente' && s.e === 'ausente' && !s.s && s.run, JSON.stringify(s));
  await page.close();
}

// ---- archivo ausente: el juego sigue
if (si('ausente')) {
  const antes = errores.length;
  const page = await nuevaPagina('', true);
  await page.mouse.click(480, 270); await duerme(2500);
  const s = await page.evaluate(() => ({ e: window.__ctx.audio.titulo.estado, st: window.__ctx.state }));
  T('sin archivo: la portada queda en «error» y el juego sigue en el menú', s.e === 'error' && s.st === 'menu', JSON.stringify(s));
  await page.click('[data-a="nueva"]'); await page.waitForFunction(() => window.__ctx.state === 'playing', null, { timeout: 60000 });
  T('sin archivo: se puede jugar', true);
  // un recurso abortado genera un error de consola de red; se descuenta (es el efecto buscado)
  errores.splice(antes).forEach((e) => { if (!/temita|net::ERR_FAILED|Failed to load resource/.test(e)) errores.push(e); });
  await page.close();
}

} catch (e) { T('la prueba no pudo completarse', false, String(e).split('\n')[0].slice(0, 240)); }
let fallos = 0;
for (const r of results) { if (!r.ok) fallos++; console.log(`${r.ok ? '✔' : '✘'} ${r.nombre}${r.msg ? `  — ${r.msg}` : ''}`); }
console.log(`\n${results.length - fallos}/${results.length} correctas. Errores de página/consola: ${errores.length}`); errores.forEach((e) => console.log('  ', e));
await browser.close().catch(() => {}); server.kill();
process.exit(fallos || errores.length ? 1 : 0);
