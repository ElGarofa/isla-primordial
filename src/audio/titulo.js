// MÚSICA DE PORTADA: «temita», pista aportada por el usuario (public/audio/temita.mp3, convertida desde un WAV de 3:09).
// No se sintetiza: se reproduce un <audio> por streaming (no se decodifica entero en memoria) enrutado por WebAudio, así que obedece
// el volumen general y el de música de Ajustes. Estados: detenida → sonando → saliendo → detenida; `esperando` si el navegador
// rechazó la reproducción (se reintenta en el siguiente gesto) y `error` si el archivo no carga (el juego sigue con la música generativa).
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class MusicaTitulo {
  /** Crea el <audio> y empieza a descargarlo YA (se llama al cargar el juego, antes del primer gesto: así la pista está lista al hacer clic). */
  static precargar(url) {
    const el = new Audio();
    el.preload = 'auto'; el.loop = true; el.src = url;
    el.__error = false; el.addEventListener('error', () => { el.__error = true; });
    return el;
  }

  /** @param ac AudioContext · @param destino nodo de salida · @param el elemento creado con `precargar` */
  constructor(ac, destino, el) {
    this.ac = ac; this.destino = destino; this.estado = el.__error ? 'error' : 'detenida'; this.tFin = 0; this.vecesIniciada = 0;
    this.el = el;
    el.addEventListener('error', () => { this.estado = 'error'; });
    this.g = ac.createGain(); this.g.gain.value = 0;
    this.fuente = ac.createMediaElementSource(el); this.fuente.connect(this.g); this.g.connect(destino);
  }

  get activa() { return this.estado === 'sonando' || this.estado === 'saliendo'; }
  get nivel() { return this.g.gain.value; }

  /** Empieza (o recupera, si se estaba apagando) con un fundido de entrada. Devuelve false si no hay archivo utilizable. */
  entrar(fundido = 2.5) {
    if (this.estado === 'error') return false;
    const g = this.g.gain, t = this.ac.currentTime;
    clearTimeout(this.tFin);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1, t + fundido);
    if (this.estado === 'detenida' || this.estado === 'esperando') { try { this.el.currentTime = 0; } catch { /* aún sin metadatos: arranca de 0 igualmente */ } this.vecesIniciada++; }
    this.estado = 'sonando';
    const p = this.el.play();
    if (p?.catch) p.catch(() => { if (this.estado === 'sonando') this.estado = 'esperando'; });
    return true;
  }

  /** Fundido de salida y parada. No hace nada si no está sonando. */
  salir(fundido = 7) {
    if (this.estado !== 'sonando') return;
    const g = this.g.gain, t = this.ac.currentTime;
    this.estado = 'saliendo'; this.finSalida = t + clamp(fundido, 0.05, 60);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, this.finSalida);
    clearTimeout(this.tFin);
    this.tFin = setTimeout(() => { if (this.estado === 'saliendo') { this.el.pause(); this.estado = 'detenida'; } }, fundido * 1000 + 120);
  }

  /** Cada cuadro (audio/index.js): termina la salida según el reloj del audio, no solo con el temporizador (que se retrasa si el hilo principal va cargado). */
  vigilar() {
    if (this.estado === 'saliendo' && this.ac.currentTime >= (this.finSalida ?? 0)) { clearTimeout(this.tFin); this.el.pause(); this.estado = 'detenida'; }
  }

  /** RMS de lo que sale ahora mismo por la salida de la portada, YA con el volumen de música aplicado (0..1). Crea el analizador la primera vez; se usa en las pruebas para comprobar que el sonido pasa de verdad por el grafo. */
  medir() {
    if (!this.an) { this.an = this.ac.createAnalyser(); this.an.fftSize = 2048; this.destino.connect(this.an); this.buf = new Float32Array(this.an.fftSize); }
    this.an.getFloatTimeDomainData(this.buf);
    let s2 = 0; for (let i = 0; i < this.buf.length; i++) s2 += this.buf[i] * this.buf[i];
    return Math.sqrt(s2 / this.buf.length);
  }

  /** Corte inmediato (pruebas y cierre). */
  parar() { clearTimeout(this.tFin); this.g.gain.cancelScheduledValues(this.ac.currentTime); this.g.gain.value = 0; this.el.pause(); if (this.estado !== 'error') this.estado = 'detenida'; }
}
