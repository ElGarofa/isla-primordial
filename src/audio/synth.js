// Recetas de síntesis (WebAudio puro, sin samples). Cada receta recibe un "kit" ligado a un contexto (tiempo real u OfflineAudioContext)
// y devuelve su duración en segundos. Se pueden renderizar offline para verificarlas con métricas.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Buffers de ruido (blanco, rosa, marrón) de 3 s, estéreo desfasado para evitar patrones. */
export function makeNoise(ac) {
  const len = Math.floor(ac.sampleRate * 3);
  const mk = (kind) => {
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.6;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      }
      // cierre sin clic al repetir en bucle
      const f = 256; for (let i = 0; i < f; i++) { const k = i / f; d[len - f + i] = d[len - f + i] * (1 - k) + d[i] * k; }
    }
    return b;
  };
  return { white: mk('white'), pink: mk('pink'), brown: mk('brown') };
}

export function makeKit(ac, nb) {
  const K = {
    ac, nb,
    gain(v = 1) { const g = ac.createGain(); g.gain.value = v; return g; },
    noise(type, t0, dur, rate = 1) {
      const s = ac.createBufferSource(); s.buffer = nb[type]; s.loop = true; s.playbackRate.value = rate;
      s.start(t0, Math.random() * 2.2); s.stop(t0 + dur + 0.05); return s;
    },
    osc(type, f, t0, dur) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t0 + dur + 0.05); return o; },
    filt(type, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
    /** Envolvente: ataque lineal, caída exponencial hasta ~0. */
    env(param, t0, peak, a, d, floor = 0.0001) {
      param.setValueAtTime(0.0001, t0); param.linearRampToValueAtTime(Math.max(peak, 0.0002), t0 + Math.max(0.001, a));
      param.exponentialRampToValueAtTime(Math.max(floor, 0.0001), t0 + a + Math.max(0.005, d));
    },
    chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; },
    shaper(k = 20) {
      const w = ac.createWaveShaper(), c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
      w.curve = c; w.oversample = '2x'; return w;
    },
    /** Resonador modal: un seno con caída exponencial (golpes de madera/roca/metal). */
    mode(out, f, t0, peak, dec) { const o = K.osc('sine', f, t0, dec * 4); const g = K.gain(0); K.env(g.gain, t0, peak, 0.002, dec); o.connect(g); g.connect(out); },
    /** Ráfaga de ruido filtrada y con envolvente. */
    burst(out, t0, { type = 'white', f = 2000, q = 1, ft = 'bandpass', a = 0.002, d = 0.05, peak = 0.5, rate = 1 } = {}) {
      const n = K.noise(type, t0, a + d + 0.05, rate), fl = K.filt(ft, f, q), g = K.gain(0);
      K.env(g.gain, t0, peak, a, d); n.connect(fl); fl.connect(g); g.connect(out);
    },
    /** Subida/bajada de tono de un oscilador con automatización exponencial. */
    glide(o, t0, pts) { o.frequency.setValueAtTime(pts[0][1], t0 + pts[0][0]); for (let i = 1; i < pts.length; i++) o.frequency.exponentialRampToValueAtTime(Math.max(1, pts[i][1]), t0 + pts[i][0]); },
  };
  return K;
}

/** Recetas: (K, out, t0, o) -> duración. `o.v` volumen 0..1, `o.p` pitch multiplicador, `o.speed` etc. */
export const RECIPES = {
  paso_hierba(K, out, t, o) {
    const v = o.v ?? 1, p = o.p ?? rnd(0.85, 1.2);
    K.burst(out, t, { type: 'pink', f: 1700 * p, q: 0.6, a: 0.004, d: 0.13, peak: 0.55 * v });
    K.burst(out, t + 0.01, { type: 'white', f: 5200 * p, q: 1.6, a: 0.002, d: 0.045, peak: 0.16 * v });
    K.burst(out, t, { type: 'brown', f: 220, q: 0.7, ft: 'lowpass', a: 0.003, d: 0.07, peak: 0.34 * v });
    return 0.26;
  },
  paso_arena(K, out, t, o) {
    const v = o.v ?? 1, p = o.p ?? rnd(0.85, 1.15);
    K.burst(out, t, { type: 'pink', f: 2200 * p, q: 0.5, ft: 'lowpass', a: 0.01, d: 0.16, peak: 0.5 * v });
    for (let i = 0; i < 9; i++) K.burst(out, t + rnd(0, 0.15), { type: 'white', f: rnd(3000, 7500), q: 1.2, a: 0.001, d: 0.012, peak: rnd(0.05, 0.14) * v });
    K.burst(out, t, { type: 'brown', f: 160, q: 0.7, ft: 'lowpass', a: 0.004, d: 0.08, peak: 0.3 * v });
    return 0.3;
  },
  paso_roca(K, out, t, o) {
    const v = o.v ?? 1, p = o.p ?? rnd(0.9, 1.15);
    K.burst(out, t, { type: 'white', f: 3400 * p, q: 2.5, a: 0.001, d: 0.02, peak: 0.45 * v });
    K.mode(out, 105 * p, t, 0.5 * v, 0.07); K.mode(out, 1250 * p, t, 0.14 * v, 0.05);
    K.burst(out, t, { type: 'pink', f: 900, q: 0.8, a: 0.002, d: 0.06, peak: 0.25 * v });
    return 0.22;
  },
  paso_agua(K, out, t, o) {
    const v = o.v ?? 1;
    const n = K.noise('white', t, 0.4), f = K.filt('bandpass', 700, 1.1), g = K.gain(0);
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.2); K.env(g.gain, t, 0.5 * v, 0.01, 0.3);
    K.chain(n, f, g, out);
    for (let i = 0; i < 4; i++) { const tt = t + rnd(0.02, 0.28), f0 = rnd(380, 900), os = K.osc('sine', f0, tt, 0.1), gg = K.gain(0); K.glide(os, tt, [[0, f0], [0.06, f0 * 2.1]]); K.env(gg.gain, tt, 0.16 * v, 0.005, 0.06); K.chain(os, gg, out); }
    K.burst(out, t, { type: 'brown', f: 300, ft: 'lowpass', a: 0.004, d: 0.14, peak: 0.3 * v });
    return 0.45;
  },
  paso_nieve(K, out, t, o) {
    const v = o.v ?? 1;
    for (let i = 0; i < 16; i++) K.burst(out, t + rnd(0, 0.19), { type: 'white', f: rnd(3500, 9000), q: 1, ft: 'highpass', a: 0.001, d: 0.012, peak: rnd(0.04, 0.12) * v });
    K.burst(out, t, { type: 'pink', f: 1400, q: 0.5, a: 0.01, d: 0.14, peak: 0.28 * v });
    return 0.3;
  },
  paso_barro(K, out, t, o) {
    const v = o.v ?? 1;
    const n = K.noise('pink', t, 0.35), f = K.filt('lowpass', 500, 2), g = K.gain(0);
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.1); f.frequency.exponentialRampToValueAtTime(250, t + 0.28);
    K.env(g.gain, t, 0.7 * v, 0.02, 0.28); K.chain(n, f, g, out);
    return 0.38;
  },
  salto(K, out, t, o) { const v = o.v ?? 1; K.burst(out, t, { type: 'pink', f: 700, q: 0.8, a: 0.03, d: 0.14, peak: 0.28 * v }); return 0.25; },
  aterrizaje(K, out, t, o) {
    const v = o.v ?? 1;
    const os = K.osc('sine', 95, t, 0.3), g = K.gain(0); K.glide(os, t, [[0, 95], [0.18, 38]]); K.env(g.gain, t, 0.9 * v, 0.004, 0.2); K.chain(os, g, out);
    K.burst(out, t, { type: 'pink', f: 900, ft: 'lowpass', q: 0.7, a: 0.003, d: 0.12, peak: 0.45 * v });
    K.burst(out, t, { type: 'white', f: 3000, q: 1, a: 0.001, d: 0.03, peak: 0.12 * v });
    return 0.35;
  },
  swing(K, out, t, o) {
    const v = o.v ?? 0.8;
    const n = K.noise('pink', t, 0.3), f = K.filt('bandpass', 450, 1.1), g = K.gain(0);
    f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(1900, t + 0.09); f.frequency.exponentialRampToValueAtTime(600, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    K.chain(n, f, g, out); return 0.28;
  },
  golpe_madera(K, out, t, o) {
    const v = o.v ?? 1, p = o.p ?? rnd(0.88, 1.14), f0 = 230 * p;
    K.burst(out, t, { type: 'white', f: 900, q: 0.8, ft: 'highpass', a: 0.001, d: 0.012, peak: 0.55 * v });
    K.mode(out, f0, t, 0.55 * v, 0.14); K.mode(out, f0 * 2.76, t, 0.3 * v, 0.08); K.mode(out, f0 * 5.4, t, 0.14 * v, 0.045); K.mode(out, 62 * p, t, 0.5 * v, 0.09);
    K.burst(out, t, { type: 'pink', f: 1500 * p, q: 1.4, a: 0.002, d: 0.05, peak: 0.28 * v });
    return 0.42;
  },
  golpe_roca(K, out, t, o) {
    const v = o.v ?? 1, p = o.p ?? rnd(0.9, 1.12);
    K.burst(out, t, { type: 'white', f: 2400, q: 0.7, ft: 'highpass', a: 0.0008, d: 0.02, peak: 0.7 * v });
    K.mode(out, 880 * p, t, 0.3 * v, 0.09); K.mode(out, 1530 * p, t, 0.24 * v, 0.06); K.mode(out, 2410 * p, t, 0.14 * v, 0.04); K.mode(out, 78 * p, t, 0.55 * v, 0.1);
    for (let i = 0; i < 3; i++) K.burst(out, t + rnd(0.02, 0.1), { type: 'white', f: rnd(2500, 6000), q: 2, a: 0.001, d: 0.015, peak: 0.1 * v });
    return 0.4;
  },
  golpe_carne(K, out, t, o) {
    const v = o.v ?? 1, os = K.osc('sine', 130, t, 0.2), g = K.gain(0);
    K.glide(os, t, [[0, 130], [0.07, 55]]); K.env(g.gain, t, 0.8 * v, 0.003, 0.09); K.chain(os, g, out);
    K.burst(out, t, { type: 'pink', f: 1100, ft: 'lowpass', q: 0.8, a: 0.002, d: 0.09, peak: 0.45 * v });
    K.burst(out, t + 0.02, { type: 'white', f: 600, q: 4, a: 0.01, d: 0.06, peak: 0.12 * v });
    return 0.3;
  },
  talar_caida(K, out, t, o) {
    const v = o.v ?? 1;
    // crujido de fibras
    const sw = K.osc('sawtooth', 160, t, 1.4), bp = K.filt('bandpass', 300, 3), g = K.gain(0), lf = K.osc('sine', 9, t, 1.4), lg = K.gain(40);
    sw.frequency.setValueAtTime(190, t); sw.frequency.exponentialRampToValueAtTime(95, t + 1.2); lf.connect(lg); lg.connect(sw.frequency);
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(180, t + 1.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25 * v, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35); K.chain(sw, bp, g, out);
    for (let i = 0; i < 7; i++) K.burst(out, t + rnd(0, 1.1), { type: 'white', f: rnd(900, 2600), q: 1.5, a: 0.001, d: 0.03, peak: rnd(0.2, 0.5) * v });
    // follaje
    const n = K.noise('pink', t + 0.5, 1.8), f = K.filt('bandpass', 2600, 0.5), gn = K.gain(0);
    gn.gain.setValueAtTime(0.0001, t + 0.5); gn.gain.linearRampToValueAtTime(0.4 * v, t + 1.5); gn.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); K.chain(n, f, gn, out);
    // impacto
    const tt = t + 1.9, os = K.osc('sine', 62, tt, 0.8), go = K.gain(0); K.glide(os, tt, [[0, 62], [0.5, 30]]); K.env(go.gain, tt, 1.0 * v, 0.004, 0.55); K.chain(os, go, out);
    K.burst(out, tt, { type: 'brown', f: 400, ft: 'lowpass', a: 0.004, d: 0.6, peak: 0.8 * v });
    K.burst(out, tt, { type: 'pink', f: 1800, a: 0.002, d: 0.14, peak: 0.4 * v });
    return 3;
  },
  recoger(K, out, t, o) {
    const v = o.v ?? 1;
    for (const [dt, f] of [[0, 660], [0.07, 990]]) { const os = K.osc('sine', f, t + dt, 0.2), g = K.gain(0); K.env(g.gain, t + dt, 0.28 * v, 0.004, 0.12); K.chain(os, g, out); }
    K.burst(out, t, { type: 'white', f: 7000, q: 2, a: 0.001, d: 0.025, peak: 0.08 * v });
    return 0.3;
  },
  craft(K, out, t, o) {
    const v = o.v ?? 1;
    for (let i = 0; i < 3; i++) { const tt = t + i * 0.15; K.burst(out, tt, { type: 'white', f: 1800, q: 1.2, ft: 'highpass', a: 0.001, d: 0.015, peak: 0.4 * v }); K.mode(out, 420 * (1 + i * 0.05), tt, 0.35 * v, 0.07); K.mode(out, 1160, tt, 0.15 * v, 0.04); }
    const t2 = t + 0.5; for (const [f, a] of [[1318, 0.22], [2637, 0.1], [3951, 0.05]]) K.mode(out, f, t2, a * v, 0.5);
    return 1.1;
  },
  comer(K, out, t, o) {
    const v = o.v ?? 1;
    for (let i = 0; i < 4; i++) { const tt = t + i * 0.17 + rnd(0, 0.03); K.burst(out, tt, { type: 'white', f: rnd(1500, 3200), q: 1.1, ft: 'highpass', a: 0.002, d: 0.04, peak: 0.3 * v }); K.burst(out, tt, { type: 'pink', f: 380, ft: 'lowpass', a: 0.004, d: 0.06, peak: 0.35 * v }); }
    return 0.8;
  },
  beber(K, out, t, o) {
    const v = o.v ?? 1;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.26, os = K.osc('sine', 320, tt, 0.25), g = K.gain(0);
      K.glide(os, tt, [[0, 260], [0.09, 150], [0.2, 210]]); K.env(g.gain, tt, 0.35 * v, 0.02, 0.2); K.chain(os, g, out);
      K.burst(out, tt, { type: 'pink', f: 500, ft: 'lowpass', q: 1.2, a: 0.02, d: 0.18, peak: 0.25 * v });
    }
    for (let i = 0; i < 5; i++) { const tt = t + rnd(0, 0.7), f0 = rnd(500, 1100), os = K.osc('sine', f0, tt, 0.08), g = K.gain(0); K.glide(os, tt, [[0, f0], [0.05, f0 * 1.8]]); K.env(g.gain, tt, 0.07 * v, 0.003, 0.05); K.chain(os, g, out); }
    return 1;
  },
  dano(K, out, t, o) {
    const v = o.v ?? 1;
    const os = K.osc('sine', 85, t, 0.35), g = K.gain(0); K.glide(os, t, [[0, 90], [0.2, 40]]); K.env(g.gain, t, 0.85 * v, 0.004, 0.22); K.chain(os, g, out);
    const sq = K.osc('sawtooth', 240, t, 0.3), lp = K.filt('lowpass', 900, 1), g2 = K.gain(0); K.glide(sq, t, [[0, 240], [0.22, 120]]); K.env(g2.gain, t, 0.3 * v, 0.01, 0.2); K.chain(sq, lp, g2, out);
    K.burst(out, t, { type: 'pink', f: 1400, q: 0.9, a: 0.002, d: 0.08, peak: 0.4 * v });
    return 0.45;
  },
  muerte(K, out, t, o) {
    const v = o.v ?? 1;
    const os = K.osc('sine', 110, t, 2.6), g = K.gain(0); K.glide(os, t, [[0, 110], [2.2, 32]]); K.env(g.gain, t, 0.7 * v, 0.05, 2.3); K.chain(os, g, out);
    const sw = K.osc('sawtooth', 220, t, 2.6), lp = K.filt('lowpass', 500, 1), g2 = K.gain(0); K.glide(sw, t, [[0, 220], [2.2, 60]]); K.env(g2.gain, t, 0.25 * v, 0.05, 2.2); K.chain(sw, lp, g2, out);
    K.burst(out, t, { type: 'brown', f: 300, ft: 'lowpass', a: 0.01, d: 1.5, peak: 0.6 * v });
    return 2.8;
  },
  ui_click(K, out, t, o) { const v = o.v ?? 1, os = K.osc('sine', 900, t, 0.1), g = K.gain(0); K.env(g.gain, t, 0.18 * v, 0.002, 0.045); K.chain(os, g, out); K.burst(out, t, { type: 'white', f: 5000, q: 2, a: 0.001, d: 0.01, peak: 0.08 * v }); return 0.1; },
  ui_open(K, out, t, o) { const v = o.v ?? 1; for (const [d, f] of [[0, 420], [0.06, 630]]) { const os = K.osc('triangle', f, t + d, 0.2), g = K.gain(0); K.env(g.gain, t + d, 0.16 * v, 0.006, 0.14); K.chain(os, g, out); } K.burst(out, t, { type: 'pink', f: 1200, q: 0.6, a: 0.04, d: 0.12, peak: 0.07 * v }); return 0.3; },
  ui_close(K, out, t, o) { const v = o.v ?? 1; for (const [d, f] of [[0, 630], [0.06, 420]]) { const os = K.osc('triangle', f, t + d, 0.2), g = K.gain(0); K.env(g.gain, t + d, 0.14 * v, 0.006, 0.12); K.chain(os, g, out); } return 0.28; },
  ui_error(K, out, t, o) { const v = o.v ?? 1; for (const d of [0, 0.12]) { const os = K.osc('square', 170, t + d, 0.1), lp = K.filt('lowpass', 700, 0.7), g = K.gain(0); K.env(g.gain, t + d, 0.14 * v, 0.004, 0.08); K.chain(os, lp, g, out); } return 0.3; },
  fogata_encender(K, out, t, o) {
    const v = o.v ?? 1;
    for (const d of [0, 0.14, 0.27]) { K.burst(out, t + d, { type: 'white', f: 4500, q: 1.5, ft: 'highpass', a: 0.0008, d: 0.02, peak: 0.4 * v }); K.mode(out, 1900, t + d, 0.1 * v, 0.03); }
    const n = K.noise('pink', t + 0.4, 1.4), f = K.filt('lowpass', 400, 0.8), g = K.gain(0);
    f.frequency.setValueAtTime(300, t + 0.4); f.frequency.exponentialRampToValueAtTime(1800, t + 0.9); f.frequency.exponentialRampToValueAtTime(700, t + 1.7);
    g.gain.setValueAtTime(0.0001, t + 0.4); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); K.chain(n, f, g, out);
    for (let i = 0; i < 10; i++) K.burst(out, t + 0.5 + rnd(0, 1.2), { type: 'white', f: rnd(2500, 7000), q: 2, a: 0.001, d: 0.012, peak: rnd(0.05, 0.2) * v });
    return 2;
  },
  trueno(K, out, t, o) {
    const v = o.v ?? 1;
    K.burst(out, t, { type: 'white', f: 1600, q: 0.5, ft: 'highpass', a: 0.002, d: 0.14, peak: 0.45 * v });
    const n = K.noise('brown', t, 5.5), f = K.filt('lowpass', 900, 0.9), g = K.gain(0), lf = K.osc('sine', 6.5, t, 5.5), lg = K.gain(0.35);
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(110, t + 4.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.1 * v, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.2);
    lf.connect(lg); lg.connect(g.gain); K.chain(n, f, g, out);
    const os = K.osc('sine', 48, t + 0.1, 3), go = K.gain(0); K.glide(os, t + 0.1, [[0, 55], [2.6, 28]]); K.env(go.gain, t + 0.1, 0.8 * v, 0.2, 2.4); K.chain(os, go, out);
    return 5.5;
  },

  // ---------------------------------------------------------------- criaturas (voz = fuente armónica + formantes + aliento)
  rugido_raptor(K, out, t, o) {
    const v = o.v ?? 1, D = 0.85, p = o.p ?? rnd(0.92, 1.1);
    const os = K.osc('sawtooth', 600, t, D), os2 = K.osc('square', 1200, t, D), vib = K.osc('sine', 38, t, D), vg = K.gain(60), g = K.gain(0), sh = K.shaper(14);
    const pts = [[0, 520 * p], [0.12, 1250 * p], [0.45, 1600 * p], [D, 420 * p]]; K.glide(os, t, pts); K.glide(os2, t, pts.map(([a, f]) => [a, f * 2]));
    vib.connect(vg); vg.connect(os.frequency); vg.connect(os2.frequency);
    const f1 = K.filt('bandpass', 1900, 5), f2 = K.filt('bandpass', 3300, 6), mix = K.gain(1), og2 = K.gain(0.35);
    os.connect(sh); os2.connect(og2); og2.connect(sh); sh.connect(f1); sh.connect(f2); f1.connect(mix); f2.connect(mix);
    K.env(g.gain, t, 0.5 * v, 0.03, D - 0.05); mix.connect(g); g.connect(out);
    K.burst(out, t, { type: 'white', f: 3200, q: 0.8, ft: 'highpass', a: 0.04, d: D - 0.1, peak: 0.16 * v });
    return D + 0.1;
  },
  rugido_triceratops(K, out, t, o) {
    const v = o.v ?? 1, D = 1.5, p = o.p ?? rnd(0.95, 1.05);
    const os = K.osc('sawtooth', 90, t, D), os2 = K.osc('triangle', 45, t, D), vib = K.osc('sine', 5.5, t, D), vg = K.gain(8), g = K.gain(0), sh = K.shaper(6);
    K.glide(os, t, [[0, 80 * p], [0.35, 135 * p], [1.0, 105 * p], [D, 62 * p]]); K.glide(os2, t, [[0, 40 * p], [0.35, 67 * p], [1.0, 52 * p], [D, 31 * p]]);
    vib.connect(vg); vg.connect(os.frequency);
    const f1 = K.filt('bandpass', 420, 3), f2 = K.filt('bandpass', 950, 4), mix = K.gain(1);
    os.connect(sh); sh.connect(f1); sh.connect(f2); f1.connect(mix); f2.connect(mix); os2.connect(mix);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7 * v, t + 0.18); g.gain.linearRampToValueAtTime(0.5 * v, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + D); mix.connect(g); g.connect(out);
    K.burst(out, t, { type: 'brown', f: 500, ft: 'lowpass', a: 0.1, d: D - 0.3, peak: 0.3 * v });
    return D + 0.1;
  },
  rugido_braquiosaurio(K, out, t, o) {
    const v = o.v ?? 1, D = 3.4, p = o.p ?? rnd(0.96, 1.04);
    const os = K.osc('sawtooth', 38, t, D), os2 = K.osc('sine', 19, t, D), os3 = K.osc('triangle', 76, t, D), am = K.osc('sine', 2.6, t, D), ag = K.gain(0.25), g = K.gain(0);
    for (const [o2, m] of [[os, 1], [os2, 0.5], [os3, 2]]) K.glide(o2, t, [[0, 34 * p * m], [0.9, 52 * p * m], [2.0, 44 * p * m], [D, 28 * p * m]]);
    const f1 = K.filt('bandpass', 120, 2.2), f2 = K.filt('bandpass', 260, 3), mix = K.gain(1), sh = K.shaper(3);
    os.connect(sh); sh.connect(f1); sh.connect(f2); f1.connect(mix); f2.connect(mix); os2.connect(mix); os3.connect(f2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.8 * v, t + 0.8); g.gain.linearRampToValueAtTime(0.6 * v, t + 2.1); g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    am.connect(ag); ag.connect(g.gain); mix.connect(g); g.connect(out);
    K.burst(out, t, { type: 'brown', f: 200, ft: 'lowpass', a: 0.5, d: D - 0.6, peak: 0.5 * v });
    return D + 0.2;
  },
  rugido_compsognatus(K, out, t, o) {
    const v = o.v ?? 1, p = o.p ?? rnd(0.9, 1.15), n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.1, os = K.osc('sine', 3000, tt, 0.09), vb = K.osc('sine', 60, tt, 0.09), vg = K.gain(300), g = K.gain(0);
      K.glide(os, tt, [[0, 2400 * p], [0.045, 4100 * p], [0.08, 3000 * p]]); vb.connect(vg); vg.connect(os.frequency); K.env(g.gain, tt, 0.16 * v, 0.004, 0.07); K.chain(os, g, out);
    }
    return 0.25 + n * 0.1;
  },
  rugido_pteranodon(K, out, t, o) {
    const v = o.v ?? 1, D = 1.0, p = o.p ?? rnd(0.9, 1.1);
    const os = K.osc('sawtooth', 1800, t, D), vib = K.osc('sine', 17, t, D), vg = K.gain(120), g = K.gain(0), f = K.filt('bandpass', 2900, 3.5);
    K.glide(os, t, [[0, 1500 * p], [0.25, 3300 * p], [0.6, 2600 * p], [D, 1300 * p]]); vib.connect(vg); vg.connect(os.frequency);
    K.env(g.gain, t, 0.36 * v, 0.06, D - 0.08); K.chain(os, f, g, out);
    K.burst(out, t, { type: 'white', f: 4200, q: 1, ft: 'highpass', a: 0.05, d: D - 0.2, peak: 0.07 * v });
    return D + 0.1;
  },

  // ---------------------------------------------------------------- ambiente puntual
  pajaro(K, out, t, o) {
    const v = o.v ?? 1, n = 2 + ((Math.random() * 4) | 0), base = o.base ?? rnd(2200, 4200);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.05, 0.13), os = K.osc('sine', base, tt, d), vb = K.osc('sine', rnd(25, 60), tt, d), vg = K.gain(rnd(80, 260)), g = K.gain(0), dir = Math.random() < 0.5 ? 1 : -1;
      K.glide(os, tt, [[0, base * (dir > 0 ? 0.8 : 1.25)], [d, base * (dir > 0 ? 1.3 : 0.75)]]); vb.connect(vg); vg.connect(os.frequency);
      K.env(g.gain, tt, 0.14 * v, 0.008, d); K.chain(os, g, out); tt += d + rnd(0.04, 0.12);
    }
    return tt - t + 0.1;
  },
  gaviota(K, out, t, o) {
    const v = o.v ?? 1, n = 2 + ((Math.random() * 2) | 0); let tt = t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.28, 0.45), os = K.osc('sawtooth', 1100, tt, d), f = K.filt('bandpass', 1800, 2.2), g = K.gain(0);
      K.glide(os, tt, [[0, 900], [d * 0.25, 1700], [d, 800]]); K.env(g.gain, tt, 0.18 * v, 0.03, d); K.chain(os, f, g, out); tt += d + rnd(0.08, 0.2);
    }
    return tt - t + 0.2;
  },
  buho(K, out, t, o) {
    const v = o.v ?? 1;
    for (const [d, f] of [[0, 400], [0.5, 360], [1.1, 400], [1.6, 330]]) { const os = K.osc('sine', f, t + d, 0.5), g = K.gain(0); K.glide(os, t + d, [[0, f * 1.05], [0.3, f * 0.94]]); K.env(g.gain, t + d, 0.28 * v, 0.06, 0.38); K.chain(os, g, out); }
    return 2.3;
  },
  rana(K, out, t, o) {
    const v = o.v ?? 1, n = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) { const tt = t + i * 0.09, os = K.osc('square', 520, tt, 0.07), lp = K.filt('lowpass', 1200, 2), g = K.gain(0); K.glide(os, tt, [[0, 480], [0.05, 720]]); K.env(g.gain, tt, 0.09 * v, 0.004, 0.05); K.chain(os, lp, g, out); }
    return 0.4 + n * 0.09;
  },
};

/** Notas de música: pluck suave (seno + triángulo octava) y pad (varias voces desafinadas con filtro). */
export function pluck(K, out, t, f, v = 0.2, dur = 3) {
  const a = K.osc('sine', f, t, dur), b = K.osc('triangle', f * 2, t, dur), ga = K.gain(0), gb = K.gain(0);
  K.env(ga.gain, t, v, 0.015, dur); K.env(gb.gain, t, v * 0.22, 0.015, dur * 0.4); K.chain(a, ga, out); K.chain(b, gb, out);
}
export function pad(K, out, t, freqs, v = 0.05, dur = 9) {
  const lp = K.filt('lowpass', 800, 0.6), g = K.gain(0); lp.connect(g); g.connect(out);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35); g.gain.linearRampToValueAtTime(v * 0.8, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(420, t + dur);
  for (const f of freqs) for (const det of [-7, 0, 6]) { const o = K.osc(det === 0 ? 'triangle' : 'sawtooth', f, t, dur); o.detune.value = det; const og = K.gain(det === 0 ? 0.6 : 0.22); K.chain(o, og, lp); }
}
export function drum(K, out, t, v = 0.5, f = 62) {
  const os = K.osc('sine', f * 1.8, t, 0.4), g = K.gain(0); K.glide(os, t, [[0, f * 1.8], [0.12, f * 0.7]]); K.env(g.gain, t, v, 0.004, 0.32); K.chain(os, g, out);
  K.burst(out, t, { type: 'pink', f: 260, q: 0.7, ft: 'lowpass', a: 0.002, d: 0.12, peak: v * 0.5 });
}

/** Atenuación por receta para que ninguna sature antes del compresor. */
export const TRIM = { golpe_madera: 0.7, golpe_roca: 0.72, talar_caida: 0.7, muerte: 0.62, trueno: 0.55, rugido_triceratops: 0.36, rugido_braquiosaurio: 0.25, rugido_raptor: 0.9, aterrizaje: 0.9 };

export { rnd, pick };
