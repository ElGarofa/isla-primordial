// Color de vértice de las criaturas: dorso/vientre, rayas, manchas, sombreado ambiental pintado y colores por parte (ojo, diente, garra, cuerno, gola, cresta, placa).
import { PART } from './builder.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/** Calcula el color de vértice: dorso/vientre, rayas, sombreado ambiental pintado y colores de partes. */
function colorizer(pal) {
  return (x, y, z, nx, ny, nz, part, out) => {
    let r, g, b;
    if (part === PART.ojo) { [r, g, b] = pal.ojo ?? [0.95, 0.75, 0.1]; }
    else if (part === PART.diente) { [r, g, b] = [0.88, 0.84, 0.72]; }
    else if (part === PART.garra) { [r, g, b] = pal.garra ?? [0.07, 0.06, 0.05]; }
    else if (part === PART.cuerno) { const k = sstep(0, 1, Math.hypot(x * 0.0 + 0, 0)); void k; [r, g, b] = pal.cuerno ?? [0.78, 0.72, 0.58]; const dark = pal.cuernoPunta ? 0 : 0; void dark; }
    else if (part === PART.cresta) { const t = sstep(-1, 1, ny); const c0 = pal.cresta ?? [0.7, 0.3, 0.12], c1 = pal.cresta1 ?? c0; r = mix(c1[0], c0[0], t); g = mix(c1[1], c0[1], t); b = mix(c1[2], c0[2], t); const bd = 0.5 + 0.5 * Math.sin(z * 22); const m = 1 - 0.18 * bd; r *= m; g *= m; b *= m; }
    else if (part === PART.placa) {
      const t = sstep(pal.placaY0 ?? 2, (pal.placaY0 ?? 2) + (pal.placaH ?? 1), y); const c0 = pal.placa0 ?? [0.4, 0.26, 0.16], c1 = pal.placa1 ?? [0.74, 0.36, 0.14];
      r = mix(c0[0], c1[0], t); g = mix(c0[1], c1[1], t); b = mix(c0[2], c1[2], t);
      const vein = 0.5 + 0.5 * Math.sin(y * 31 + z * 7); const m = 1 - 0.16 * vein; r *= m; g *= m; b *= m;
    }
    else if (part === PART.gola) {
      const rad = Math.min(1, Math.hypot(x, y - (pal.golaY ?? 2.2)) / (pal.golaR ?? 0.85));
      const c0 = pal.gola0, c1 = pal.gola1;
      const t = sstep(0.35, 0.95, rad);
      r = mix(c0[0], c1[0], t); g = mix(c0[1], c1[1], t); b = mix(c0[2], c1[2], t);
      const sp = 0.5 + 0.5 * Math.sin(Math.atan2(y - (pal.golaY ?? 2.2), x) * 14);
      const m = 1 - 0.28 * sp * sstep(0.5, 0.9, rad); r *= m; g *= m; b *= m;
    } else {
      const back = sstep(-0.35, 0.55, ny);
      r = mix(pal.vientre[0], pal.dorso[0], back); g = mix(pal.vientre[1], pal.dorso[1], back); b = mix(pal.vientre[2], pal.dorso[2], back);
      if (pal.raya) {
        const w = pal.raya;
        const s = Math.sin(z * w.freq + Math.sin(y * w.warp + x * 3) * 0.9);
        const m = sstep(w.th, w.th + 0.22, s) * sstep(-0.1, 0.45, ny) * (w.amp ?? 0.7);
        r = mix(r, pal.raya.color[0], m); g = mix(g, pal.raya.color[1], m); b = mix(b, pal.raya.color[2], m);
      }
      if (pal.manchas) { const m = sstep(0.62, 0.8, Math.sin(x * 5.1 + z * 2.3) * Math.sin(y * 4.3 - z * 3.1) * 0.5 + 0.5) * sstep(0, 0.5, ny) * 0.5; r = mix(r, pal.manchas[0], m); g = mix(g, pal.manchas[1], m); b = mix(b, pal.manchas[2], m); }
      // sombreado ambiental pintado: bajos y bajo el vientre más oscuros
      const ao = (0.5 + 0.5 * sstep(-1, 0.1, ny)) * (0.78 + 0.22 * sstep(0, (pal.aoY ?? 0.5), y));
      r *= ao; g *= ao; b *= ao;
    }
    out[0] = r; out[1] = g; out[2] = b;
  };
}


export { colorizer, sstep, mix };
