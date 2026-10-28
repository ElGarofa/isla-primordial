#!/usr/bin/env node
// Vista previa del mapa macro (bioma + relieve sombreado + fronteras) sin abrir el navegador. Uso: node tools/mundo-preview.mjs [salida.png] [--bio|--prov|--alt]
import { generarMundo } from '../src/world/generador.js';
import { PROVINCIAS, MARES, BIOMA_ID, BIOMA_COLOR, RASGOS } from '../src/world/provincias.js';
import { CONFIG } from '../src/core/config.js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/mundo.png';
const modo = process.argv.includes('--prov') ? 'prov' : process.argv.includes('--alt') ? 'alt' : 'bio';
const t0 = performance.now();
const M = generarMundo({ seed: CONFIG.seed, size: CONFIG.world.size, n: CONFIG.world.macro ?? 768 });
console.log('generado en', ((performance.now() - t0) / 1000).toFixed(2), 's');
const { n, H, B, P, Z } = M;
let tierra = 0; const porProv = new Array(PROVINCIAS.length).fill(0), porBio = {};
for (let k = 0; k < n * n; k++) { if (M.land[k]) { tierra++; porProv[P[k]]++; const b = BIOMA_ID[B[k]]; porBio[b] = (porBio[b] ?? 0) + 1; } }
const km2 = (c) => (c * M.cell * M.cell / 1e6).toFixed(1);
console.log('tierra', km2(tierra), 'km² de', (M.size * M.size / 1e6).toFixed(0), 'km²');
PROVINCIAS.forEach((p, i) => console.log(' ', p.id.padEnd(16), km2(porProv[i]).padStart(6), 'km²'));
console.log('biomas', Object.entries(porBio).map(([b, c]) => `${b} ${km2(c)}`).join(' · '));
const S = n, buf = Buffer.alloc(S * S * 3);
const paleta = PROVINCIAS.map((_, i) => { const h = i / PROVINCIAS.length; const f = (k) => { const t = (k + h * 6) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(1, Math.min(t, 4 - t))))) ; }; return [f(5), f(3), f(1)]; });
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const k = j * S + i, o = k * 3, h = H[k];
  const hl = H[j * S + Math.max(0, i - 1)], hr = H[j * S + Math.min(S - 1, i + 1)], hu = H[Math.max(0, j - 1) * S + i], hd = H[Math.min(S - 1, j + 1) * S + i];
  const sh = Math.max(0.55, Math.min(1.45, 1 + ((hl - hr) * 0.9 + (hu - hd) * 0.6) / M.cell * 2.2));
  let c;
  if (!M.land[k]) { const t = Math.min(1, -h / 120); c = [Math.round(60 - 45 * t), Math.round(150 - 100 * t), Math.round(190 - 80 * t)]; if (modo === 'prov') { const z = Z[k]; c = [40 + 30 * z, 80, 150 - 20 * z]; } }
  else if (modo === 'prov') { const pc = paleta[P[k]]; c = pc.map((v) => v * sh * 0.85); }
  else if (modo === 'alt') { const t = Math.min(1, h / 450); c = [60 + 190 * t, 130 + 100 * t, 60 + 180 * t].map((v) => v * sh); }
  else c = BIOMA_COLOR[BIOMA_ID[B[k]]].map((v) => v * sh);
  if (M.land[k]) { const border = (i > 0 && M.land[k - 1] && P[k - 1] !== P[k]) || (j > 0 && M.land[k - S] && P[k - S] !== P[k]); if (border && modo !== 'alt') c = [255, 255, 255]; }
  buf[o] = Math.max(0, Math.min(255, c[0])); buf[o + 1] = Math.max(0, Math.min(255, c[1])); buf[o + 2] = Math.max(0, Math.min(255, c[2]));
}
writeFileSync('/tmp/mundo.rgb', buf);
const marks = PROVINCIAS.map((p) => ({ t: p.nombre, x: (p.centro[0] + M.half) / M.cell, y: (p.centro[1] + M.half) / M.cell })).concat(MARES.map((m) => ({ t: m.nombre, x: (m.centro[0] + M.half) / M.cell, y: (m.centro[1] + M.half) / M.cell, mar: true })), RASGOS.map((r) => ({ t: r.nombre, x: (r.centro[0] + M.half) / M.cell, y: (r.centro[1] + M.half) / M.cell })));
writeFileSync('/tmp/mundo.json', JSON.stringify({ S, marks, cellKm: M.cell / 1000 }));
execFileSync('python3', ['-c', `
import json
from PIL import Image, ImageDraw
d=json.load(open('/tmp/mundo.json')); S=d['S']
im=Image.frombytes('RGB',(S,S),open('/tmp/mundo.rgb','rb').read())
g=ImageDraw.Draw(im)
step=int(1/d['cellKm'])
for q in range(0,S,step): g.line([(q,0),(q,S)],fill=(255,255,255,40),width=1); g.line([(0,q),(S,q)],fill=(255,255,255,40),width=1)
for m in d['marks']:
    g.text((m['x']-len(m['t'])*3,m['y']),m['t'],fill=(255,255,200) if m.get('mar') else (0,0,0))
im.save('${out}')
`]);
console.log('guardado', out);
