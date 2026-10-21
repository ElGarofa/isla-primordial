// Música generativa ambiental: pads modales, notas sueltas y percusión que aparece con el peligro.
import { pad, pluck, drum, rnd, pick } from './synth.js';

const mtof = (n) => 440 * 2 ** ((n - 69) / 12);
// D dórico: i – VI – III – VII con voces abiertas
const PROG = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]];
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79]; // pentatónica menor sobre D

export class Music {
  constructor(K, bus) {
    this.K = K; this.bus = bus;
    this.chord = 0; this.nextChord = 1.5; this.nextNote = 6; this.nextBeat = 0; this.danger = 0; this.t = 0; this.beat = 0;
  }

  update(dt, { night = 0, danger = 0, playing = true }) {
    if (!playing) return;
    const ac = this.K.ac, now = ac.currentTime;
    this.t += dt;
    this.danger += (danger - this.danger) * Math.min(1, dt * 0.5);
    // acordes
    this.nextChord -= dt;
    if (this.nextChord <= 0) {
      const ch = PROG[this.chord++ % PROG.length];
      const shift = night > 0.5 ? -12 : 0;
      pad(this.K, this.bus, now + 0.05, ch.map((n) => mtof(n + shift)), 0.045 + this.danger * 0.02, 13);
      this.nextChord = rnd(9.5, 11.5);
    }
    // melodía suelta
    this.nextNote -= dt;
    if (this.nextNote <= 0) {
      const f = mtof(pick(SCALE) + (night > 0.5 ? -12 : 0));
      pluck(this.K, this.bus, now + 0.05, f, night > 0.5 ? 0.11 : 0.13, night > 0.5 ? 5 : 3.5);
      if (Math.random() < 0.35) pluck(this.K, this.bus, now + 0.35, f * 1.5, 0.07, 3);
      this.nextNote = night > 0.5 ? rnd(8, 16) : rnd(4, 9);
    }
    // percusión de peligro
    if (this.danger > 0.35) {
      this.nextBeat -= dt;
      if (this.nextBeat <= 0) {
        const accent = this.beat++ % 4 === 0;
        drum(this.K, this.bus, now + 0.02, (accent ? 0.5 : 0.28) * Math.min(1, this.danger), accent ? 55 : 70);
        this.nextBeat = 0.72 - this.danger * 0.12;
      }
    }
  }
}
