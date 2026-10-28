#!/usr/bin/env node
// Captura del visor de manos. Uso: tools/lock.sh node tools/manos-shot.mjs --out shots/manos.png [--vistas jugador,frente,lado,arriba,dorso,puno] [--w 360]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i < 0 ? d : a[i + 1]; };
const vistas = opt('vistas', 'jugador,frente,lado,arriba,dorso,puno'), w = Number(opt('w', 360));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port: p } = s.address(); s.close(() => res(p)); }); });
const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
const matar = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ } };
let code = 0, browser;
try {
  for (let t0 = Date.now(); Date.now() - t0 < 60000;) { try { if ((await fetch(`http://127.0.0.1:${port}/tools/manos/index.html`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: w * vistas.split(',').length, height: w } });
  page.on('pageerror', (e) => { console.error('ERROR página:', e.message); code = 1; });
  await page.goto(`http://127.0.0.1:${port}/tools/manos/index.html?vistas=${vistas}&w=${w}&radio=${opt('radio', '0.019')}`);
  await page.waitForFunction(() => window.__manos?.listo, null, { timeout: 120000 });
  await page.screenshot({ path: path.resolve(root, opt('out', 'shots/manos.png')) });
  console.log('ok', opt('out', 'shots/manos.png'));
} finally { await browser?.close().catch(() => {}); matar(); }
process.exit(code);
