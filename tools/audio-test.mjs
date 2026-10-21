#!/usr/bin/env node
// Verificación objetiva del audio: renderiza cada receta con OfflineAudioContext y reporta métricas (pico, RMS, NaN, clics, variación).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${port}`); if (r.ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 });
const rows = await page.evaluate(async () => {
  const a = window.__game.ctx.audio, out = [];
  for (const n of a.recipes) { const m1 = await a.measure(n), m2 = await a.measure(n); out.push({ ...m1, difiere: Math.abs(m1.rms - m2.rms) > 1e-6 || m1.cruces !== m2.cruces }); }
  return out;
});
console.log('nombre'.padEnd(22), 'dur', 'pico(dB)', 'rms', 'cruces', 'nan', 'inicio', 'fin', 'varía');
let bad = 0;
for (const r of rows) {
  const flags = [];
  if (r.nan) flags.push('NaN'); if (r.pico > 0.98) flags.push('CLIP'); if (r.pico < 0.02) flags.push('SILENCIO'); if (r.inicio > 0.02) flags.push('CLIC-INICIO'); if (r.fin > 0.01) flags.push('CLIC-FIN');
  if (flags.length) bad++;
  console.log(r.nombre.padEnd(22), String(r.duracion).padEnd(4), String(r.picoDb).padEnd(8), String(r.rms).padEnd(7), String(r.cruces).padEnd(6), r.nan, r.inicio, r.fin, r.difiere ? 'sí' : 'no', flags.join(','));
}
console.log(`\n${rows.length} recetas, ${bad} con avisos. Errores de página: ${errors.length}`); errors.forEach((e) => console.log(e));
await browser.close(); server.kill(); process.exit(errors.length ? 1 : 0);
