#!/usr/bin/env node
// Captura un GLB estático en varias vistas. Uso: tools/lock.sh node tools/visor-shot.mjs --url /public/models/fauna/generados/carnotaurus.glb --out shots/carno.png [--vistas lado,frente,tres,arriba --w 480]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i < 0 ? d : a[i + 1]; };
const vistas = opt('vistas', 'lado,frente,tres,arriba'), w = Number(opt('w', 480));
const free = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });
const port = await free();
const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let t0 = Date.now(); Date.now() - t0 < 60000;) { try { if ((await fetch(`http://127.0.0.1:${port}/tools/visor/index.html`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let code = 0;
try {
  const n = vistas.split(',').length;
  const page = await browser.newPage({ viewport: { width: w * n, height: w } });
  page.on('pageerror', (e) => { console.error('ERROR página:', e.message); code = 1; });
  await page.goto(`http://127.0.0.1:${port}/tools/visor/index.html?url=${encodeURIComponent(opt('url', ''))}&vistas=${vistas}&w=${w}&flat=${opt('flat', '0')}&foco=${opt('foco', '')}&rig=${encodeURIComponent(opt('rig', ''))}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__visor?.ready, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__visor.error);
  if (err) { console.error('ERROR:', err); code = 1; }
  await page.screenshot({ path: path.resolve(root, opt('out', 'shots/visor.png')) });
  console.log('ok', opt('out', 'shots/visor.png'));
} finally { await browser.close(); server.kill('SIGTERM'); }
process.exit(code);
