#!/usr/bin/env node
// Capturas de la galería de especies (hoja de contacto) con Chromium headless. Uso:
//   tools/lock.sh node tools/galeria-shot.mjs --fam bipedos --out docs/capturas/especies/bipedos [--cols 4 --cell 360 --lote 12 --vista lado|frente|tres|arriba --escala comun]
//   tools/lock.sh node tools/galeria-shot.mjs --ids tarbosaurus,allosaurus --out /tmp/x
// Escribe una hoja PNG por lote y imprime estadísticas (triángulos, NaN, errores). Código de salida 1 si hay errores.
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
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const out = path.resolve(root, opt('out', 'shots/galeria'));
mkdirSync(out, { recursive: true });
const lote = Number(opt('lote', 12)), cols = Number(opt('cols', 4)), cell = Number(opt('cell', 360)), cellH = Number(opt('cellh', cell));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });
const waitHttp = async (url) => { const t0 = Date.now(); while (Date.now() - t0 < 60000) { try { const r = await fetch(url); if (r.ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error('sin servidor'); };
const port = await freePort();
const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await waitHttp(`http://127.0.0.1:${port}/tools/galeria/index.html`);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let fallos = 0;
try {
  // lista de ids: se pide al propio navegador (la galería conoce SPECIES y las familias)
  const page0 = await browser.newPage();
  const fam = opt('fam'), idsOpt = opt('ids');
  await page0.goto(`http://127.0.0.1:${port}/tools/galeria/index.html?ids=${idsOpt && idsOpt !== true ? idsOpt : ''}&fam=${fam && fam !== true ? fam : ''}&cols=1&cell=64`, { waitUntil: 'load' });
  await page0.waitForFunction(() => window.__galeria?.ready, null, { timeout: 120000 });
  const todos = await page0.evaluate(() => window.__galeria.ids);
  await page0.close();
  const stats = {};
  for (let i = 0, n = 1; i < todos.length; i += lote, n++) {
    const ids = todos.slice(i, i + lote);
    const page = await browser.newPage({ viewport: { width: cols * cell, height: Math.ceil(ids.length / cols) * cellH } });
    page.on('pageerror', (e) => { console.error('ERROR página:', e.message); fallos++; });
    const extra = ['vista', 'escala'].map((k) => (opt(k) ? `&${k}=${opt(k)}` : '')).join('');
    await page.goto(`http://127.0.0.1:${port}/tools/galeria/index.html?ids=${ids.join(',')}&cols=${cols}&cell=${cell}&cellh=${cellH}${extra}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__galeria?.ready, null, { timeout: 180000 });
    const g = await page.evaluate(() => window.__galeria);
    Object.assign(stats, g.stats);
    if (g.errores.length) { fallos += g.errores.length; console.error(g.errores.join('\n')); }
    const file = path.join(out, `hoja_${String(n).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    console.log(`hoja ${n}: ${ids.join(', ')} → ${path.relative(root, file)}`);
    await page.close();
  }
  writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 1));
  const tris = Object.values(stats).map((s) => s.tris), bad = Object.values(stats).reduce((a, s) => a + s.bad, 0);
  console.log(`especies: ${todos.length} · triángulos ${Math.min(...tris)}–${Math.max(...tris)} · vértices no finitos: ${bad}`);
  if (bad) fallos++;
} finally { await browser.close(); server.kill('SIGTERM'); }
process.exit(fallos ? 1 : 0);
