#!/usr/bin/env node
// Capturas del juego con Chromium headless (WebGL2 por software, SwiftShader). Lento pero determinista.
//
// Uso:
//   node tools/shot.mjs --list                          # lista los presets disponibles
//   node tools/shot.mjs --preset integracion_playa_dia  # uno o varios (separados por coma)
//   node tools/shot.mjs --all --out shots/ronda1        # todos los presets
// Opciones: --w 1280 --h 720 --frames 12 --hour 10 --ui (incluye HUD) --renderall --quality high|medium|low --url http://...
// Salida: PNGs + report.json (draw calls, triángulos, errores de consola). Código de salida 1 si hay errores de página.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const W = Number(opt('w', 1280));
const H = Number(opt('h', 720));
const FRAMES = Number(opt('frames', 12));
const outDir = path.resolve(root, opt('out', `shots/${new Date().toISOString().replace(/[:.]/g, '-')}`));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}
async function waitHttp(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`El servidor no respondió: ${url}`);
}

let server = null;
let baseUrl = opt('url');
if (!baseUrl) {
  const port = await freePort();
  server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  baseUrl = `http://127.0.0.1:${port}`;
  await waitHttp(baseUrl);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const consoleLog = [];
const pageErrors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLog.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => pageErrors.push(String(e)));

const q = new URLSearchParams({ debug: '1' });
if (!opt('ui')) q.set('ui', '0');
if (opt('quality')) q.set('quality', opt('quality'));
await page.goto(`${baseUrl}/?${q}`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 });

const all = await page.evaluate(() => window.__game.listPresets());
if (opt('list')) {
  console.log(all.join('\n'));
  await browser.close(); server?.kill();
  process.exit(0);
}
const wanted = opt('all') ? all : String(opt('preset', '')).split(',').filter(Boolean);
if (!wanted.length) { console.error('Indicá --preset <nombre[,nombre]> o --all (o --list).'); await browser.close(); server?.kill(); process.exit(2); }

mkdirSync(outDir, { recursive: true });
const report = { size: [W, H], frames: FRAMES, shots: {}, consoleLog, pageErrors };
process.on('unhandledRejection', (e) => { console.error(String(e)); if (consoleLog.length) console.error('Consola:\n' + consoleLog.slice(0, 20).join('\n')); if (pageErrors.length) console.error('Errores de página:\n' + pageErrors.join('\n')); process.exit(1); });
for (const name of wanted) {
  if (!all.includes(name)) { console.error(`Preset desconocido: ${name}`); continue; }
  const t0 = Date.now();
  await page.evaluate(
    async ({ name, frames, hour, renderall }) => {
      await window.__game.applyPreset(name);
      if (hour != null) window.__game.setHour(hour);
      window.__game.advance(frames, 1 / 30, renderall);
    },
    { name, frames: FRAMES, hour: opt('hour') != null ? Number(opt('hour')) : null, renderall: !!opt('renderall') },
  );
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 300000 });
  const stats = await page.evaluate(() => window.__game.stats());
  report.shots[name] = { file, ms: Date.now() - t0, ...stats };
  console.log(`✔ ${name} -> ${file}  (${stats?.calls ?? '?'} draw calls, ${stats?.triangles ?? '?'} triángulos)`);
}
report.consoleLog = consoleLog;
writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (consoleLog.length) console.log(`\nConsola (${consoleLog.length}):\n` + consoleLog.slice(0, 20).join('\n'));
if (pageErrors.length) console.log(`\nERRORES DE PÁGINA:\n` + pageErrors.join('\n'));
await browser.close();
server?.kill();
process.exit(pageErrors.length ? 1 : 0);
