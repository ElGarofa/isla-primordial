// Mapa del mundo (tecla M): relieve y biomas de la rejilla macro, fronteras de provincia, nombres de provincias y mares, zoom con la rueda,
// arrastre para mover, doble clic para centrar en el jugador y lectura de provincia/bioma/altura bajo el cursor.
// Muestra el mundo entero desde el principio (no hay niebla de exploración todavía).
import { BIOMAS, BIOMA_ID, BIOMA_NOMBRE, BIOMA_COLOR, PROVINCIAS, MARES, RASGOS } from '../world/provincias.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createMapa(ctx, { el, S }) {
  const screen = el(`<div class="panel map">
    <div class="mtitle"><b>Mapa</b><span class="minfo"></span></div>
    <canvas width="760" height="760"></canvas>
    <div class="mleg"></div>
    <div class="legend"><span>Norte ↑ &nbsp; ● Tú &nbsp; ▲ Fogata</span><span>Rueda: zoom · arrastrar: mover · doble clic: centrar en ti</span><span>M para cerrar</span></div>
  </div>`, 'screen dim hide');
  const cv = screen.querySelector('canvas'), info = screen.querySelector('.minfo'), leg = screen.querySelector('.mleg');
  leg.innerHTML = Object.keys(BIOMAS).filter((b) => b !== 'mar').map((b) => `<span><i style="background:rgb(${BIOMA_COLOR[b].join(',')})"></i>${BIOMA_NOMBRE[b]}</span>`).join('');

  let base = null;
  const view = { x: 0, z: 0, span: ctx.world.size };

  function construirBase() {
    const M = ctx.world.macro, n = M.n, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
    const at = (i, j) => M.H[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, h = M.H[k], o = k * 4;
      let r, gg, b;
      if (h < 0) {
        // mar: más oscuro cuanto más hondo
        if (h < -60) [r, gg, b] = [10, 34, 62]; else if (h < -25) [r, gg, b] = [16, 58, 94]; else if (h < -8) [r, gg, b] = [24, 86, 120]; else if (h < -2) [r, gg, b] = [46, 122, 150]; else [r, gg, b] = [96, 166, 176];
      } else {
        const col = BIOMA_COLOR[BIOMA_ID[M.B[k]]] ?? BIOMA_COLOR.pradera;
        const dx = at(i + 1, j) - at(i - 1, j), dz = at(i, j + 1) - at(i, j - 1);
        const sh = clamp(1 + (-dx * 0.55 - dz * 0.35) * 0.014 + h * 0.0004, 0.6, 1.38);
        r = col[0] * sh; gg = col[1] * sh; b = col[2] * sh;
        // frontera de provincia (solo entre dos celdas de tierra)
        const pr = i + 1 < n ? M.P[k + 1] : M.P[k], pb = j + 1 < n ? M.P[k + n] : M.P[k];
        if ((M.P[k] !== pr && pr !== 255) || (M.P[k] !== pb && pb !== 255)) { r *= 0.5; gg *= 0.5; b *= 0.5; }
      }
      d[o] = clamp(r, 0, 255); d[o + 1] = clamp(gg, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    base = c;
  }

  const W = () => cv.width;
  const toXY = (x, z) => [((x - (view.x - view.span / 2)) / view.span) * W(), ((z - (view.z - view.span / 2)) / view.span) * W()];
  const toWorld = (px, py) => [view.x - view.span / 2 + (px / W()) * view.span, view.z - view.span / 2 + (py / W()) * view.span];

  function limitar() {
    const w = ctx.world.size;
    view.span = clamp(view.span, 700, w * 1.0);
    const m = (w - view.span) / 2 + w * 0.04;
    view.x = clamp(view.x, -m, m); view.z = clamp(view.z, -m, m);
  }

  function dibujar() {
    if (!base) construirBase();
    limitar();
    const w = ctx.world, g = cv.getContext('2d'), SZ = W();
    g.fillStyle = '#0c2a42'; g.fillRect(0, 0, SZ, SZ);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // trozo visible de la imagen base (en celdas)
    const cell = w.macro.cell, n = w.macro.n, half = w.macro.half;
    const x0 = view.x - view.span / 2, z0 = view.z - view.span / 2;
    g.drawImage(base, (x0 + half) / cell - 0.5, (z0 + half) / cell - 0.5, view.span / cell, view.span / cell, 0, 0, SZ, SZ);
    void n;
    // cuadrícula cada 2 km
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath();
    for (let v = Math.ceil(x0 / 2000) * 2000; v < x0 + view.span; v += 2000) { const [px] = toXY(v, 0); g.moveTo(px, 0); g.lineTo(px, SZ); }
    for (let v = Math.ceil(z0 / 2000) * 2000; v < z0 + view.span; v += 2000) { const [, py] = toXY(0, v); g.moveTo(0, py); g.lineTo(SZ, py); }
    g.stroke();
    // nombres: mares y provincias
    g.textAlign = 'center'; g.lineJoin = 'round';
    const rotulo = (txt, x, z, px, color, italic, stroke) => {
      let [sx, sy] = toXY(x, z);
      if (sx < -120 || sx > SZ + 120 || sy < -20 || sy > SZ + 20) return;
      g.font = `${italic ? 'italic ' : '700 '}${px}px sans-serif`;
      const tw = g.measureText(txt).width / 2 + 5; // el rótulo no se corta en el borde del mapa
      sx = clamp(sx, tw, SZ - tw);
      g.lineWidth = 3.5; g.strokeStyle = stroke; g.strokeText(txt, sx, sy);
      g.fillStyle = color; g.fillText(txt, sx, sy);
    };
    const f = clamp(w.size / view.span, 1, 3.2);
    for (const m of MARES) rotulo(m.nombre, m.centro[0], m.centro[1], Math.round(12 * Math.min(f, 1.6)), 'rgba(190,225,245,.9)', true, 'rgba(8,30,50,.8)');
    for (const p of PROVINCIAS) rotulo(p.nombre, p.centro[0], p.centro[1], Math.round(11 * Math.min(f, 1.7)), '#fff', false, 'rgba(0,0,0,.75)');
    for (const r of RASGOS) { const [sx, sy] = toXY(r.centro[0], r.centro[1]); g.fillStyle = '#ff7a3a'; g.beginPath(); g.moveTo(sx, sy - 7); g.lineTo(sx + 6, sy + 5); g.lineTo(sx - 6, sy + 5); g.closePath(); g.fill(); rotulo(r.nombre, r.centro[0], r.centro[1] + 520 / f, Math.round(10 * Math.min(f, 1.5)), '#ffd2b0', false, 'rgba(0,0,0,.8)'); }
    // inicio
    { const [sx, sy] = toXY(w.spawn.x, w.spawn.z); g.fillStyle = '#7de0ff'; g.strokeStyle = '#04202b'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 4.5, 0, 7); g.stroke(); g.fill(); }
    // fogatas
    g.fillStyle = '#ffb84a';
    for (const fr of S.fires?.() ?? []) { const [px, py] = toXY(fr.x, fr.z); g.beginPath(); g.moveTo(px, py - 8); g.lineTo(px + 7, py + 6); g.lineTo(px - 7, py + 6); g.closePath(); g.fill(); }
    // jugador
    const p = ctx.player.position, [px, py] = toXY(p.x, p.z);
    g.save(); g.translate(px, py); g.rotate(-ctx.player.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9); g.closePath(); g.stroke(); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 14px sans-serif'; g.textAlign = 'left'; g.fillText('N', SZ / 2 - 4, 18);
    // escala (barra de 1 km o lo que quepa)
    const km = view.span > 6000 ? 2000 : view.span > 2500 ? 1000 : 500, len = (km / view.span) * SZ;
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(16, SZ - 22, len, 3); g.font = '600 11px sans-serif'; g.fillText(`${km >= 1000 ? km / 1000 + ' km' : km + ' m'}`, 16, SZ - 28);
  }

  /** Línea de datos de un punto del mundo (provincia, época, bioma, altura). */
  function lectura(x, z) {
    const w = ctx.world, pr = w.getProvince(x, z), mar = w.getSea(x, z), b = w.getBiome(x, z), h = Math.round(w.getHeight(x, z));
    if (!pr) return `${mar ? mar.nombre : 'Mar abierto'} · ${mar?.era ?? ''} · profundidad ${Math.max(0, -h)} m`;
    return `${pr.nombre} · ${pr.era} · ${BIOMA_NOMBRE[b] ?? b} · ${h} m`;
  }
  function actualizarInfo(x, z) { info.textContent = lectura(x, z); }

  // ------------------------------------------------------------ interacción
  let drag = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W(), ((e.clientY - r.top) / r.height) * W()]; };
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = pos(e), [wx, wz] = toWorld(px, py);
    const k = e.deltaY < 0 ? 0.8 : 1.25;
    view.span = view.span * k;
    limitar();
    // mantiene bajo el cursor el mismo punto del mundo
    view.x = wx - ((px / W()) - 0.5) * view.span; view.z = wz - ((py / W()) - 0.5) * view.span;
    dibujar();
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); const [px, py] = pos(e); drag = { px, py, vx: view.x, vz: view.z }; });
  cv.addEventListener('pointermove', (e) => {
    const [px, py] = pos(e);
    if (drag) { view.x = drag.vx - ((px - drag.px) / W()) * view.span; view.z = drag.vz - ((py - drag.py) / W()) * view.span; dibujar(); }
    const [wx, wz] = toWorld(px, py); actualizarInfo(wx, wz);
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('pointerleave', () => { drag = null; const p = ctx.player.position; actualizarInfo(p.x, p.z); });
  cv.addEventListener('dblclick', () => { const p = ctx.player.position; view.x = p.x; view.z = p.z; view.span = Math.min(view.span, 4000); dibujar(); });

  return {
    screen,
    /** Se llama al abrir el mapa. */
    abrir() {
      const p = ctx.player.position;
      view.span = ctx.world.size; view.x = 0; view.z = 0;
      dibujar(); actualizarInfo(p.x, p.z);
    },
    dibujar,
    view,
    lectura,
  };
}
