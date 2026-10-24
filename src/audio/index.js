// Módulo AUDIO: motor WebAudio con espacialización 3D, ambiente por bioma/hora/clima, efectos y música, todo sintetizado.
import { makeNoise, makeKit, RECIPES, TRIM, rnd } from './synth.js';
import { Music } from './music.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const BIG = new Set(['rugido_braquiosaurio', 'rugido_tyrannosaurus', 'llamada_parasaurolophus']);
const VOZ = (n) => n.startsWith('rugido') || n.startsWith('llamada');
const REVERB = { trueno: 0.75, talar_caida: 0.35, muerte: 0.5, buho: 0.5, pajaro: 0.35, gaviota: 0.25, rana: 0.2 };

export async function create(ctx) {
  let ac = null, K = null, nb = null;
  let master, sfx, amb, mus, reverbIn, reverbOut, lowpass, comp;
  let music = null, ambience = null;
  let voices = 0;
  let started = false;

  // ------------------------------------------------------------------ arranque perezoso (política de autoplay)
  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC({ latencyHint: 'interactive' });
      nb = makeNoise(ac); K = makeKit(ac, nb);
      master = ac.createGain(); master.gain.value = clamp(ctx.settings.volumen ?? 0.8, 0, 1);
      comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.22;
      lowpass = ac.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.5;
      lowpass.connect(comp); comp.connect(master); master.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.85; sfx.connect(lowpass);
      amb = ac.createGain(); amb.gain.value = 0.7; amb.connect(lowpass);
      mus = ac.createGain(); mus.gain.value = 0.55 * clamp(ctx.settings.musica ?? 0.6, 0, 1); mus.connect(lowpass);
      // reverb generada: cola exponencial de ruido suavizado
      const len = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.45 * t); d[i] = lp * Math.pow(1 - t, 2.6) * 1.8; } }
      const conv = ac.createConvolver(); conv.buffer = ir;
      reverbIn = ac.createGain(); reverbIn.gain.value = 1; reverbOut = ac.createGain(); reverbOut.gain.value = 0.55;
      reverbIn.connect(conv); conv.connect(reverbOut); reverbOut.connect(lowpass);
      ambience = new Ambience();
      music = new Music(K, (() => { const g = ac.createGain(); g.gain.value = 1; g.connect(mus); const s = ac.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(reverbIn); return g; })());
      return true;
    } catch { ac = null; return false; }
  }
  const resume = () => { if (!ensure()) return; if (ac.state === 'suspended') ac.resume().catch(() => {}); started = true; };
  for (const e of ['pointerdown', 'keydown', 'click']) window.addEventListener(e, resume, { passive: true });

  // ------------------------------------------------------------------ voces y espacialización
  const _f = new ctx.camera.position.constructor(), _u = new ctx.camera.position.constructor();
  function spatial(position, o = {}) {
    const p = ac.createPanner();
    p.panningModel = o.hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = o.ref ?? 4; p.rolloffFactor = o.rolloff ?? 1.2; p.maxDistance = 900;
    if (p.positionX) { p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z; } else p.setPosition(position.x, position.y, position.z);
    p.connect(sfx);
    return p;
  }
  function play(nombre, position = null, opts = {}) {
    if (!ensure() || ac.state !== 'running' || ctx.state === 'loading') return false;
    const rec = RECIPES[nombre];
    if (!rec || voices > 36) return false;
    const big = BIG.has(nombre);
    const bus = ac.createGain(); bus.gain.value = (opts.volumen ?? 1) * (TRIM[nombre] ?? 1);
    let node = bus, target = sfx;
    if (position) { const pn = spatial(position, { ref: big ? 30 : VOZ(nombre) ? 10 : nombre === 'talar_caida' ? 12 : 4, rolloff: big ? 0.8 : 1.2, hrtf: VOZ(nombre) || nombre === 'golpe_madera' }); bus.connect(pn); target = pn; } else bus.connect(sfx);
    void node; void target;
    const wet = REVERB[nombre] ?? (VOZ(nombre) ? 0.35 : 0.1);
    const send = ac.createGain(); send.gain.value = wet * (ambience?.reverbBoost ?? 1); bus.connect(send); send.connect(reverbIn);
    const dur = rec(K, bus, ac.currentTime + 0.01, { v: opts.v ?? 1, p: opts.tono, ...opts });
    voices++; setTimeout(() => { voices--; try { bus.disconnect(); send.disconnect(); } catch { /* ya desconectado */ } }, (dur + 0.4) * 1000);
    return true;
  }

  // ------------------------------------------------------------------ ambiente continuo
  class Ambience {
    constructor() {
      this.reverbBoost = 1; this.t = 0; this.scan = 0; this.shore = 0; this.biome = 'playa'; this.alt = 0; this.under = false; this.fireD = 99;
      this.birdT = 3; this.owlT = 12; this.frogT = 5; this.gullT = 6; this.popT = 0; this.chirpT = 0; this.nightK = 0;
      const t0 = ac.currentTime;
      const loop = (type, rate = 1) => { const s = ac.createBufferSource(); s.buffer = nb[type]; s.loop = true; s.playbackRate.value = rate; s.start(t0, Math.random() * 2); return s; };
      const mk = (src, nodes, vol = 0) => { const g = ac.createGain(); g.gain.value = vol; let n = src; for (const x of nodes) { n.connect(x); n = x; } n.connect(g); g.connect(amb); return g; };
      const F = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
      // viento
      this.windLP = F('lowpass', 500, 0.6); this.windG = mk(loop('pink'), [this.windLP]);
      this.whistleBP = F('bandpass', 900, 7); this.whistleG = mk(loop('white'), [this.whistleBP]);
      // oleaje: base grave modulada por una LFO lenta + siseo agudo
      this.seaLP = F('lowpass', 520, 0.5); this.seaG = mk(loop('brown'), [this.seaLP]);
      this.seaHP = F('highpass', 2200, 0.5); this.seaHG = mk(loop('white', 0.8), [this.seaHP]);
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.11; const lg = ac.createGain(); lg.gain.value = 0.0; lfo.connect(lg); lg.connect(this.seaG.gain); lfo.start(t0); this.seaLfoG = lg;
      const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.11; lfo2.type = 'sine'; const lg2 = ac.createGain(); lg2.gain.value = 0; lfo2.connect(lg2); lg2.connect(this.seaHG.gain); lfo2.start(t0 + 0.9); this.seaLfoH = lg2;
      // selva (lecho de follaje) e insectos
      this.bedBP = F('bandpass', 3400, 0.5); this.bedG = mk(loop('pink'), [this.bedBP]);
      this.cic = ac.createOscillator(); this.cic.frequency.value = 4700; const am = ac.createGain(); am.gain.value = 0.5; const amo = ac.createOscillator(); amo.frequency.value = 33; const amg = ac.createGain(); amg.gain.value = 0.5;
      amo.connect(amg); amg.connect(am.gain); this.cic.connect(am); this.cicG = ac.createGain(); this.cicG.gain.value = 0; am.connect(this.cicG); this.cicG.connect(amb); this.cic.start(t0); amo.start(t0);
      this.cri = ac.createOscillator(); this.cri.frequency.value = 4300; this.criGate = ac.createGain(); this.criGate.gain.value = 0; this.criG = ac.createGain(); this.criG.gain.value = 0;
      this.cri.connect(this.criGate); this.criGate.connect(this.criG); this.criG.connect(amb); this.cri.start(t0);
      // lluvia
      this.rainBP = F('bandpass', 5200, 0.4); this.rainG = mk(loop('white'), [this.rainBP]);
      this.rain2LP = F('lowpass', 2400, 0.5); this.rain2G = mk(loop('pink', 1.2), [this.rain2LP]);
      // fuego cercano
      this.fireLP = F('lowpass', 260, 0.7); this.fireG = mk(loop('brown'), [this.fireLP]);
    }

    scanWorld() {
      const p = ctx.player.position, w = ctx.world;
      let s = 0;
      for (const r of [6, 22, 60, 130]) for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (w.getHeight(x, z) < w.seaLevel - 0.2) s += 1 / (1 + r * 0.04);
      }
      this.shore = clamp(s / 9, 0, 1);
      this.biome = w.getBiome?.(p.x, p.z) ?? 'selva';
      this.alt = p.y;
      const fires = ctx.survival?.fires?.() ?? [];
      let d = 99; for (const f of fires) if (f.lit) d = Math.min(d, Math.hypot(f.x - p.x, f.z - p.z));
      this.fireD = d;
    }

    tick(dt) {
      this.t += dt;
      const now = ac.currentTime, W = ctx.time.weather, night = ctx.time.nightFactor, s = (p, v, tc = 0.8) => p.setTargetAtTime(v, now, tc);
      this.scan -= dt; if (this.scan <= 0) { this.scan = 0.5; this.scanWorld(); }
      const cam = ctx.camera.position;
      const under = cam.y < ctx.world.seaLevel - 0.05; this.under = under;
      const dim = under ? 0.12 : 1;
      const forest = this.biome === 'selva' ? 1 : this.biome === 'pradera' || this.biome === 'pantano' ? 0.6 : this.biome === 'playa' ? 0.15 : 0.1;
      const windV = clamp(0.06 + W.windStrength * 0.34 + W.storm * 0.3 + clamp(this.alt / 220, 0, 1) * 0.16, 0, 0.9) * (1 - 0.35 * forest);
      s(this.windG.gain, windV * 0.7 * dim); s(this.windLP.frequency, 300 + W.windStrength * 1500 + W.storm * 700);
      s(this.whistleG.gain, clamp(W.windStrength - 0.45, 0, 1) * 0.08 * dim); s(this.whistleBP.frequency, 700 + Math.sin(this.t * 0.4) * 250 + W.windStrength * 400);
      const sea = clamp(this.shore * 1.15 + (this.biome === 'playa' ? 0.25 : 0), 0, 1);
      s(this.seaG.gain, 0.2 * sea * dim); s(this.seaHG.gain, 0.034 * sea * dim); this.seaLfoG.gain.setTargetAtTime(0.12 * sea * dim, now, 1); this.seaLfoH.gain.setTargetAtTime(0.03 * sea * dim, now, 1);
      s(this.bedG.gain, 0.05 * forest * (1 - night * 0.5) * dim * (1 - W.rain * 0.4));
      const day = 1 - night;
      s(this.cicG.gain, (this.biome === 'selva' || this.biome === 'pradera') && !under ? 0.018 * day * forest * (1 - W.rain) * (0.6 + 0.4 * Math.sin(this.t * 0.13)) : 0, 2);
      s(this.criG.gain, (this.biome !== 'montana' && this.biome !== 'nieve') && !under ? 0.03 * night * (0.3 + forest * 0.7) * (1 - W.rain) : 0, 2);
      this.chirpT -= dt; if (this.chirpT <= 0 && night > 0.4) { // grillos: trenes de pulsos
        this.chirpT = rnd(0.5, 0.75); const g = this.criGate.gain; g.cancelScheduledValues(now);
        for (let i = 0; i < 3; i++) { g.setValueAtTime(0.0001, now + i * 0.085); g.linearRampToValueAtTime(1, now + i * 0.085 + 0.012); g.linearRampToValueAtTime(0.0001, now + i * 0.085 + 0.06); }
      }
      s(this.rainG.gain, W.rain * 0.16 * dim, 1.5); s(this.rain2G.gain, W.rain * 0.2 * dim, 1.5);
      const fireV = this.fireD < 30 ? 0.35 / (1 + this.fireD * 0.5) : 0; s(this.fireG.gain, fireV * dim, 0.5);
      if (fireV > 0.01) { this.popT -= dt; if (this.popT <= 0) { this.popT = rnd(0.03, 0.22); const v = fireV * rnd(0.3, 1); const bus = sfx; const t = now + 0.01; K.burst(bus, t, { type: 'white', f: rnd(1800, 6500), q: rnd(1, 4), a: 0.0008, d: rnd(0.008, 0.03), peak: v * 0.9 }); if (Math.random() < 0.15) K.burst(bus, t, { type: 'pink', f: 600, ft: 'lowpass', a: 0.001, d: 0.05, peak: v * 0.8 }); } }
      // bajo el agua
      lowpass.frequency.setTargetAtTime(under ? 420 : 20000, now, 0.12);
      this.reverbBoost = under ? 2 : forest > 0.8 ? 1.4 : 1;
      // eventos de ambiente puntuales
      const around = (rMin, rMax, hMin, hMax) => { const a = Math.random() * 6.283, r = rnd(rMin, rMax); return { x: cam.x + Math.cos(a) * r, y: cam.y + rnd(hMin, hMax), z: cam.z + Math.sin(a) * r }; };
      if (!under && ctx.state === 'playing') {
        this.birdT -= dt; if (this.birdT <= 0) { this.birdT = rnd(2.5, 8) / (0.3 + forest); if (day > 0.5 && W.rain < 0.4 && forest > 0.2) play('pajaro', around(12, 65, 4, 16), { v: rnd(0.5, 1) }); }
        this.gullT -= dt; if (this.gullT <= 0) { this.gullT = rnd(8, 20); if (day > 0.4 && this.shore > 0.25 && W.rain < 0.6) play('gaviota', around(30, 120, 10, 30), { v: 0.8 }); }
        this.owlT -= dt; if (this.owlT <= 0) { this.owlT = rnd(16, 38); if (night > 0.6 && forest > 0.3) play('buho', around(40, 90, 3, 12), { v: 0.9 }); }
        this.frogT -= dt; if (this.frogT <= 0) { this.frogT = rnd(3, 9); if (night > 0.5 && (this.biome === 'pantano' || (this.biome === 'selva' && W.wetness > 0.2) || this.shore > 0.1) && W.rain < 0.8) play('rana', around(8, 40, -1, 1), { v: rnd(0.5, 1) }); }
      }
    }
  }

  // ------------------------------------------------------------------ eventos del juego
  const surfaceMap = { arena: 'paso_arena', hierba: 'paso_hierba', roca: 'paso_roca', agua: 'paso_agua', nieve: 'paso_nieve', barro: 'paso_barro' };
  ctx.events.on('player:footstep', ({ surface, speed }) => play(surfaceMap[surface] ?? 'paso_hierba', null, { v: clamp(0.32 + (speed ?? 3) / 9, 0.3, 1.15) }));
  ctx.events.on('player:jump', () => play('salto'));
  ctx.events.on('player:land', ({ speed }) => { if ((speed ?? 0) > 3) play('aterrizaje', null, { v: clamp(speed / 14, 0.25, 1.2) }); });
  ctx.events.on('player:attack', ({ tool }) => play('swing', null, { v: tool ? 0.9 : 0.5 }));
  ctx.events.on('flora:hit', ({ tipo, position }) => {
    if (tipo === 'arbol') play('golpe_madera', position ?? null);
    else if (tipo === 'roca') play('golpe_roca', position ?? null);
    else play('paso_hierba', position ?? null, { v: 1.2 });
  });
  ctx.events.on('flora:felled', ({ position }) => play('talar_caida', position ?? null, { v: 1 }));
  ctx.events.on('creature:hit', ({ position }) => play('golpe_carne', position ?? null));
  ctx.events.on('creature:roar', ({ especie, position, llamada }) => { const n = llamada && RECIPES[`llamada_${especie}`] ? `llamada_${especie}` : `rugido_${especie}`; play(n, position ?? null); });
  ctx.events.on('creature:killed', ({ especie, position }) => { play('golpe_carne', position ?? null, { v: 1.2 }); if (RECIPES[`rugido_${especie}`] && Math.random() < 0.6) play(`rugido_${especie}`, position ?? null, { tono: 0.75, v: 0.8 }); });
  ctx.events.on('weather:lightning', ({ intensity, position }) => {
    const cam = ctx.camera.position, d = position ? Math.hypot(position.x - cam.x, position.z - cam.z) : 600;
    setTimeout(() => play('trueno', null, { v: clamp((intensity ?? 0.8) * (1.15 - d / 2600), 0.15, 1.2) }), Math.min(7000, (d / 340) * 1000));
  });
  ctx.events.on('ui:sound', ({ nombre }) => play(nombre));

  // ------------------------------------------------------------------ API pública
  ctx.audio = {
    play, resume,
    setMasterVolume(v) { ctx.settings.volumen = v; if (master) master.gain.setTargetAtTime(clamp(v, 0, 1), ac.currentTime, 0.05); },
    setMusicVolume(v) { ctx.settings.musica = v; if (mus) mus.gain.setTargetAtTime(0.55 * clamp(v, 0, 1), ac.currentTime, 0.1); },
    setSfxVolume(v) { if (sfx) sfx.gain.setTargetAtTime(clamp(v, 0, 1), ac.currentTime, 0.05); },
    setListener() { /* el oyente sigue a ctx.camera en update() */ },
    get recipes() { return Object.keys(RECIPES); },
    get running() { return !!ac && ac.state === 'running'; },
    /** Renderiza una receta con OfflineAudioContext y devuelve métricas objetivas (para pruebas). */
    async measure(nombre, opts = {}) {
      const rec = RECIPES[nombre]; if (!rec) return null;
      const sr = 44100, off = new OfflineAudioContext(2, sr * 7, sr);
      const nbo = makeNoise(off), Ko = makeKit(off, nbo);
      const g = off.createGain(); g.gain.value = TRIM[nombre] ?? 1; g.connect(off.destination);
      const dur = rec(Ko, g, 0.05, { v: 1, ...opts });
      const buf = await off.startRendering();
      const d = buf.getChannelData(0), n = Math.min(d.length, Math.floor((dur + 0.3) * sr));
      let peak = 0, sum = 0, bad = 0, zc = 0, prev = 0, hf = 0, lf = 0;
      for (let i = 0; i < n; i++) { const x = d[i]; if (!Number.isFinite(x)) { bad++; continue; } const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; if (i && (x >= 0) !== (prev >= 0)) zc++; const df = x - prev; hf += df * df; lf += x * x; prev = x; }
      const rms = Math.sqrt(sum / n);
      // clic al inicio/fin: primeras y últimas muestras
      const head = Math.abs(d[Math.floor(0.05 * sr) - 1] ?? 0), tail = Math.abs(d[Math.max(0, n - 2)] ?? 0);
      return { nombre, duracion: +dur.toFixed(2), pico: +peak.toFixed(3), picoDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1), rms: +rms.toFixed(4), cruces: zc, centroideAprox: Math.round((zc / 2) / (n / sr)), nan: bad, brillo: +(hf / (lf + 1e-12)).toFixed(3), inicio: +head.toFixed(5), fin: +tail.toFixed(5) };
    },
  };

  // ------------------------------------------------------------------ bucle
  const fwd = new ctx.camera.position.constructor();
  return {
    name: 'audio',
    update(dt) {
      if (!ac || ac.state !== 'running') return;
      // oyente 3D
      const c = ctx.camera, L = ac.listener, now = ac.currentTime;
      c.getWorldDirection(fwd); _u.set(0, 1, 0).applyQuaternion(c.quaternion); _f.copy(fwd);
      if (L.positionX) {
        L.positionX.setValueAtTime(c.position.x, now); L.positionY.setValueAtTime(c.position.y, now); L.positionZ.setValueAtTime(c.position.z, now);
        L.forwardX.setValueAtTime(_f.x, now); L.forwardY.setValueAtTime(_f.y, now); L.forwardZ.setValueAtTime(_f.z, now);
        L.upX.setValueAtTime(_u.x, now); L.upY.setValueAtTime(_u.y, now); L.upZ.setValueAtTime(_u.z, now);
      } else { L.setPosition(c.position.x, c.position.y, c.position.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
      if (!started) return;
      const step = Math.min(dt || ctx.time.realDt, 0.1);
      ambience.tick(step);
      // la música baja en menús/pausa y sube con el peligro
      const playing = ctx.state === 'playing' || ctx.state === 'menu';
      let danger = 0;
      if (ctx.state === 'playing') {
        const near = ctx.fauna?.getNear?.(ctx.player.position, 34, []) ?? [];
        for (const cr of near) if (cr.especie === 'raptor' && !cr.muerta) danger = Math.max(danger, 1 - Math.hypot(cr.position.x - ctx.player.position.x, cr.position.z - ctx.player.position.z) / 34);
        if ((ctx.survival?.stats?.vida ?? 100) < 28) danger = Math.max(danger, 0.7);
      }
      music.update(step, { night: ctx.time.nightFactor, danger, playing });
    },
  };
}
