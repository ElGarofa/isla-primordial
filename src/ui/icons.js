// Iconos de objetos dibujados con canvas 2D (vectoriales, sin imágenes externas). iconUrl(id) -> dataURL cacheada.
import { ITEMS } from '../core/items.js';
const cache = new Map();

function mk(draw, S = 96) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.scale(S / 64, S / 64);
  draw(g);
  return c.toDataURL('image/png');
}
const grad = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
const shadow = (g, c = 'rgba(0,0,0,.45)', b = 4) => { g.shadowColor = c; g.shadowBlur = b; g.shadowOffsetY = 2; };
const noShadow = (g) => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; };

function handle(g, x0, y0, x1, y1, w = 4.2) {
  g.strokeStyle = grad(g, x0, y0, x1, y1, [[0, '#6b4524'], [1, '#9a6b3a']]); g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = 'rgba(255,220,170,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 1, y0 - 1); g.lineTo(x1 + 1, y1 - 1); g.stroke();
}
function stone(g, pts, c0 = '#b9b6ae', c1 = '#6d6a64') {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.fillStyle = grad(g, 0, 10, 0, 54, [[0, c0], [1, c1]]); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.2; g.stroke();
}


// Ayudantes de dibujo para las familias de herramientas, lanzas y flechas
function cuchillo(g, hoja, diente) {
  shadow(g); handle(g, 12, 56, 30, 36, 5.2); noShadow(g);
  g.fillStyle = grad(g, 30, 40, 54, 8, [[0, hoja[1]], [1, hoja[0]]]);
  g.beginPath();
  if (diente) { g.moveTo(26, 40); g.bezierCurveTo(28, 22, 40, 10, 54, 6); g.bezierCurveTo(52, 22, 46, 36, 34, 44); }
  else { g.moveTo(26, 40); g.lineTo(34, 30); g.lineTo(54, 8); g.bezierCurveTo(56, 22, 48, 36, 34, 44); }
  g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.2; g.stroke();
  g.strokeStyle = '#a58e50'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(26, 42); g.lineTo(34, 48); g.moveTo(23, 46); g.lineTo(30, 52); g.stroke();
}
function lanzaGen(g, c, k) {
  shadow(g); handle(g, 8, 58, 46, 14, 3.4); noShadow(g);
  g.save(); g.translate(50, 10); g.rotate(0.84); g.scale(k, k);
  g.fillStyle = grad(g, -5, -14, 5, 8, [[0, c[0]], [1, c[1]]]); g.beginPath(); g.moveTo(-5, 8); g.quadraticCurveTo(-6, -4, 0, -16); g.quadraticCurveTo(6, -4, 5, 8); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(40,28,10,.55)'; g.lineWidth = 1.2; g.stroke(); g.restore();
  g.strokeStyle = '#d9c88a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(38, 24); g.lineTo(44, 30); g.moveTo(35, 27); g.lineTo(41, 33); g.stroke();
}
function flechaGen(g, punta) {
  shadow(g); g.strokeStyle = grad(g, 8, 56, 50, 14, [[0, '#6e4a26'], [1, '#b58a52']]); g.lineWidth = 3; g.beginPath(); g.moveTo(8, 56); g.lineTo(48, 16); g.stroke(); noShadow(g);
  g.fillStyle = '#e9dfc6'; g.strokeStyle = 'rgba(60,50,30,.5)'; g.lineWidth = 0.9;
  for (const o of [0, 5]) { g.beginPath(); g.moveTo(10 + o, 54 - o); g.lineTo(2 + o, 52 - o); g.lineTo(8 + o, 46 - o); g.closePath(); g.fill(); g.stroke(); }
  g.save(); g.translate(50, 14); g.rotate(0.785);
  if (punta) { g.fillStyle = grad(g, -5, -12, 5, 4, [[0, punta[0]], [1, punta[1]]]); g.beginPath(); g.moveTo(-5, 4); g.lineTo(0, -14); g.lineTo(5, 4); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke(); }
  else { g.fillStyle = '#7a5a30'; g.beginPath(); g.moveTo(-2.6, 3); g.lineTo(0, -10); g.lineTo(2.6, 3); g.closePath(); g.fill(); }
  g.restore();
}


/** Montura: 0 ligera, 1 de transporte (respaldo), 2 reforzada (armazón de hueso y madera). */
function silla(g, nivel) {
  shadow(g);
  g.fillStyle = grad(g, 8, 20, 56, 52, [[0, nivel === 2 ? '#8a5e38' : '#a8794a'], [1, '#4a2f16']]);
  g.beginPath(); g.moveTo(6, 40); g.quadraticCurveTo(10, 26, 32, 26); g.quadraticCurveTo(54, 26, 58, 40); g.lineTo(54, 46); g.quadraticCurveTo(32, 40, 10, 46); g.closePath(); g.fill();
  noShadow(g); g.strokeStyle = 'rgba(30,16,6,.65)'; g.lineWidth = 1.4; g.stroke();
  if (nivel >= 1) { g.fillStyle = '#6b4524'; g.beginPath(); g.roundRect(8, 12, 12, 20, 4); g.fill(); g.stroke(); }
  if (nivel === 2) { g.strokeStyle = '#efe6cf'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 30); g.lineTo(14, 52); g.moveTo(50, 30); g.lineTo(50, 52); g.moveTo(14, 52); g.lineTo(50, 52); g.stroke(); }
  g.strokeStyle = '#d9c28a'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(20, 44); g.lineTo(18, 58); g.moveTo(44, 44); g.lineTo(46, 58); g.stroke();
}

const DRAW = {
  madera(g) {
    shadow(g);
    for (const [x, y, a] of [[30, 38, -0.35], [34, 26, -0.28]]) {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = grad(g, 0, -8, 0, 8, [[0, '#a3703c'], [1, '#5e3d1f']]); g.beginPath(); g.roundRect(-20, -7, 40, 14, 6); g.fill();
      g.strokeStyle = 'rgba(40,22,8,.5)'; g.lineWidth = 1; for (let i = -14; i < 16; i += 6) { g.beginPath(); g.moveTo(i, -6); g.lineTo(i + 2, 6); g.stroke(); }
      g.fillStyle = '#d9b27a'; g.beginPath(); g.ellipse(20, 0, 3.6, 7, 0, 0, 7); g.fill();
      g.strokeStyle = '#8a5a2c'; g.beginPath(); g.ellipse(20, 0, 1.8, 4, 0, 0, 7); g.stroke();
      g.restore();
    }
    noShadow(g);
  },
  piedra(g) {
    shadow(g);
    stone(g, [[12, 42], [18, 26], [32, 18], [48, 24], [54, 40], [44, 50], [24, 51]]);
    noShadow(g);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(20, 28); g.lineTo(32, 21); g.lineTo(40, 26); g.lineTo(28, 33); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(28, 33); g.lineTo(30, 49); g.moveTo(40, 26); g.lineTo(47, 41); g.stroke();
  },
  fibra(g) {
    shadow(g);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 2 ? '#b8c46a' : '#8aa04a'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(16 + i * 3.6, 52); g.bezierCurveTo(20 + i * 3, 36, 8 + i * 5, 26, 14 + i * 4.5, 10); g.stroke();
    }
    noShadow(g);
    g.strokeStyle = '#6b4f2a'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(14, 38); g.lineTo(50, 36); g.stroke();
  },
  pedernal(g) {
    shadow(g);
    stone(g, [[14, 40], [24, 14], [40, 10], [52, 30], [44, 50], [24, 52]], '#4a4d56', '#1e2026');
    noShadow(g);
    g.fillStyle = 'rgba(180,190,210,.35)'; g.beginPath(); g.moveTo(24, 14); g.lineTo(40, 10); g.lineTo(34, 26); g.fill();
    g.fillStyle = '#ffd37a'; g.beginPath(); g.arc(46, 16, 2.2, 0, 7); g.fill();
  },
  baya(g) {
    shadow(g);
    for (const [x, y, r] of [[22, 40, 9], [38, 40, 9], [30, 28, 9]]) {
      g.fillStyle = grad(g, x - r, y - r, x + r, y + r, [[0, '#ff6b5a'], [1, '#9b1f2c']]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x - 3, y - 3, 2.4, 0, 7); g.fill();
    }
    noShadow(g);
    g.fillStyle = '#4a8c3a'; g.beginPath(); g.ellipse(34, 16, 9, 4, -0.6, 0, 7); g.fill();
  },
  carne_cruda(g) {
    shadow(g);
    g.fillStyle = grad(g, 10, 14, 54, 50, [[0, '#d9505a'], [1, '#8c2431']]);
    g.beginPath(); g.moveTo(10, 34); g.bezierCurveTo(8, 16, 34, 10, 48, 18); g.bezierCurveTo(60, 28, 52, 48, 34, 50); g.bezierCurveTo(18, 52, 10, 44, 10, 34); g.fill();
    noShadow(g);
    g.fillStyle = 'rgba(255,210,210,.55)'; g.beginPath(); g.ellipse(26, 26, 8, 3.4, -0.4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,230,230,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(22, 38); g.quadraticCurveTo(34, 30, 46, 36); g.stroke();
  },
  carne_cocida(g) {
    shadow(g);
    g.fillStyle = grad(g, 10, 14, 54, 50, [[0, '#b0703c'], [1, '#52301a']]);
    g.beginPath(); g.moveTo(10, 34); g.bezierCurveTo(8, 16, 34, 10, 48, 18); g.bezierCurveTo(60, 28, 52, 48, 34, 50); g.bezierCurveTo(18, 52, 10, 44, 10, 34); g.fill();
    noShadow(g);
    g.strokeStyle = 'rgba(30,14,4,.6)'; g.lineWidth = 2.2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(18 + i * 8, 22 + i * 2); g.lineTo(30 + i * 8, 38 + i * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,220,170,.35)'; g.beginPath(); g.ellipse(26, 26, 8, 3, -0.4, 0, 7); g.fill();
  },
  cuero(g) {
    shadow(g);
    g.fillStyle = grad(g, 8, 8, 56, 56, [[0, '#c79a63'], [1, '#7a5430']]);
    g.beginPath(); g.moveTo(14, 12); g.lineTo(26, 16); g.lineTo(38, 12); g.lineTo(50, 18); g.lineTo(46, 30); g.lineTo(54, 44); g.lineTo(40, 52); g.lineTo(28, 48); g.lineTo(14, 52); g.lineTo(18, 36); g.lineTo(10, 24); g.closePath(); g.fill();
    noShadow(g);
    g.strokeStyle = 'rgba(60,34,12,.45)'; g.lineWidth = 1.4; g.setLineDash([3, 2.5]); g.stroke(); g.setLineDash([]);
  },
  hueso(g) {
    shadow(g);
    g.save(); g.translate(32, 32); g.rotate(-0.7);
    g.fillStyle = grad(g, 0, -6, 0, 6, [[0, '#f3ecd8'], [1, '#bdb190']]);
    g.beginPath(); g.roundRect(-18, -4.5, 36, 9, 4); g.fill();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { g.beginPath(); g.arc(sx * 19, sy * 4.4, 5.2, 0, 7); g.fill(); }
    g.restore(); noShadow(g);
  },
  agua(g) {
    shadow(g);
    g.fillStyle = grad(g, 20, 8, 44, 56, [[0, '#7fd0ff'], [1, '#1f69b8']]);
    g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(46, 26, 52, 34, 52, 42); g.bezierCurveTo(52, 52, 43, 58, 32, 58); g.bezierCurveTo(21, 58, 12, 52, 12, 42); g.bezierCurveTo(12, 34, 18, 26, 32, 8); g.fill();
    noShadow(g);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(24, 40, 3.4, 7, 0.4, 0, 7); g.fill();
  },
  hacha_piedra(g) {
    shadow(g); handle(g, 14, 54, 44, 14); noShadow(g);
    g.save(); g.translate(42, 16); g.rotate(0.6);
    stone(g, [[-14, -10], [8, -12], [14, 0], [8, 12], [-14, 8]]);
    g.restore();
    g.strokeStyle = '#6b4f2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(37, 22); g.lineTo(44, 18); g.stroke();
  },
  pico_piedra(g) {
    shadow(g); handle(g, 14, 54, 44, 14); noShadow(g);
    g.save(); g.translate(40, 16); g.rotate(0.6);
    g.fillStyle = grad(g, -18, 0, 18, 0, [[0, '#8c8a84'], [0.5, '#c5c2ba'], [1, '#8c8a84']]);
    g.beginPath(); g.moveTo(-22, 8); g.quadraticCurveTo(0, -12, 22, 8); g.lineTo(18, 9); g.quadraticCurveTo(0, -4, -18, 9); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  },
  lanza(g) {
    shadow(g); handle(g, 8, 58, 48, 12, 3.4); noShadow(g);
    g.save(); g.translate(50, 10); g.rotate(0.84);
    stone(g, [[-5, 8], [0, -14], [5, 8]], '#d3d0c8', '#7a776f');
    g.restore();
    g.strokeStyle = '#7a8c4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 22); g.lineTo(46, 28); g.stroke();
  },
  antorcha(g) {
    shadow(g); handle(g, 22, 58, 36, 28, 5.6); noShadow(g);
    const gr = g.createRadialGradient(38, 20, 2, 38, 20, 16);
    gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.5, 'rgba(255,150,40,.85)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(38, 20, 16, 0, 7); g.fill();
    g.fillStyle = '#ffb84a'; g.beginPath(); g.moveTo(38, 6); g.bezierCurveTo(48, 18, 46, 28, 38, 30); g.bezierCurveTo(30, 28, 28, 18, 38, 6); g.fill();
    g.fillStyle = '#fff2b0'; g.beginPath(); g.moveTo(38, 16); g.bezierCurveTo(42, 22, 41, 27, 38, 28); g.bezierCurveTo(35, 27, 34, 22, 38, 16); g.fill();
  },
  cantimplora(g) {
    shadow(g);
    g.fillStyle = grad(g, 16, 14, 48, 58, [[0, '#a27a46'], [1, '#5c3e1e']]);
    g.beginPath(); g.moveTo(24, 16); g.bezierCurveTo(10, 24, 10, 56, 32, 58); g.bezierCurveTo(54, 56, 54, 24, 40, 16); g.closePath(); g.fill();
    noShadow(g);
    g.fillStyle = '#3b2a14'; g.fillRect(25, 6, 14, 12);
    g.fillStyle = '#c9a15d'; g.fillRect(23, 4, 18, 5);
    g.strokeStyle = 'rgba(30,18,6,.6)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(32, 38, 12, 14, 0, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,230,190,.25)'; g.beginPath(); g.ellipse(25, 32, 3, 8, 0.2, 0, 7); g.fill();
  },
  fogata(g) {
    shadow(g);
    for (const a of [-0.5, 0.5]) { g.save(); g.translate(32, 50); g.rotate(a); g.fillStyle = grad(g, 0, -4, 0, 4, [[0, '#8a5a2c'], [1, '#4a2e14']]); g.beginPath(); g.roundRect(-20, -4, 40, 8, 4); g.fill(); g.restore(); }
    noShadow(g);
    g.fillStyle = '#7d7a72'; for (const x of [12, 22, 42, 52]) { g.beginPath(); g.arc(x, 54, 5, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 22);
    gr.addColorStop(0, 'rgba(255,230,140,.9)'); gr.addColorStop(1, 'rgba(255,100,30,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill();
    g.fillStyle = '#ff9a2e'; g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(46, 26, 46, 42, 32, 46); g.bezierCurveTo(18, 42, 18, 26, 32, 8); g.fill();
    g.fillStyle = '#ffe08a'; g.beginPath(); g.moveTo(32, 24); g.bezierCurveTo(38, 32, 37, 40, 32, 43); g.bezierCurveTo(27, 40, 26, 32, 32, 24); g.fill();
  },

  // ---- objetos de la ampliación (familias A–F). Dibujos compactos de 64×64 con el mismo lenguaje que los anteriores.
  rama(g) { shadow(g); g.strokeStyle = grad(g, 10, 54, 54, 10, [[0, '#6e4a26'], [1, '#b08a58']]); g.lineWidth = 5; g.beginPath(); g.moveTo(10, 54); g.lineTo(52, 12); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(30, 34); g.lineTo(42, 40); g.moveTo(38, 26); g.lineTo(40, 14); g.stroke(); noShadow(g); },
  corteza(g) { shadow(g); g.fillStyle = grad(g, 10, 10, 54, 54, [[0, '#8a5e36'], [1, '#4a2e18']]); g.beginPath(); g.moveTo(14, 18); g.quadraticCurveTo(32, 6, 50, 18); g.lineTo(46, 50); g.quadraticCurveTo(32, 58, 18, 50); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(30,16,6,.55)'; g.lineWidth = 1.2; for (const x of [22, 30, 38, 44]) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x + 2, 52); g.stroke(); } },
  resina(g) { shadow(g); g.fillStyle = grad(g, 18, 12, 46, 54, [[0, '#ffd774'], [1, '#b87415']]); g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(44, 24, 50, 32, 50, 40); g.bezierCurveTo(50, 50, 42, 56, 32, 56); g.bezierCurveTo(22, 56, 14, 50, 14, 40); g.bezierCurveTo(14, 32, 20, 24, 32, 8); g.fill(); noShadow(g); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(25, 38, 3, 8, 0.3, 0, 7); g.fill(); },
  liana(g) { shadow(g); g.strokeStyle = '#4f7a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(12, 14); g.bezierCurveTo(52, 8, 8, 34, 50, 34); g.bezierCurveTo(60, 36, 30, 56, 14, 50); g.stroke(); noShadow(g); g.fillStyle = '#6fae4c'; for (const [x, y] of [[40, 14], [18, 28], [44, 40], [24, 52]]) { g.beginPath(); g.ellipse(x, y, 5, 3, 0.6, 0, 7); g.fill(); } },
  hoja_grande(g) { shadow(g); g.fillStyle = grad(g, 10, 54, 54, 10, [[0, '#2f6e2c'], [1, '#6bbd4a']]); g.beginPath(); g.moveTo(10, 54); g.bezierCurveTo(6, 22, 32, 6, 56, 8); g.bezierCurveTo(58, 34, 40, 56, 10, 54); g.fill(); noShadow(g); g.strokeStyle = 'rgba(10,50,10,.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(10, 54); g.lineTo(50, 14); g.stroke(); for (const t of [0.3, 0.5, 0.7]) { const x = 10 + 40 * t, y = 54 - 40 * t; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 6); g.moveTo(x, y); g.lineTo(x - 6, y - 8); g.stroke(); } },
  grasa(g) { shadow(g); g.fillStyle = grad(g, 12, 14, 52, 52, [[0, '#fff3cc'], [1, '#c9b27a']]); g.beginPath(); g.moveTo(14, 36); g.bezierCurveTo(10, 18, 30, 12, 40, 18); g.bezierCurveTo(56, 22, 56, 46, 40, 52); g.bezierCurveTo(26, 58, 12, 52, 14, 36); g.fill(); noShadow(g); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(26, 28, 6, 3, -0.4, 0, 7); g.fill(); },
  tendon(g) { shadow(g); g.strokeStyle = '#e4d2ae'; g.lineWidth = 2.4; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(14 + i * 2, 54); g.bezierCurveTo(24 + i * 3, 38, 40 - i * 3, 28, 50 + i, 10); g.stroke(); } g.strokeStyle = '#a58a5e'; g.lineWidth = 3; g.beginPath(); g.moveTo(12, 44); g.lineTo(26, 52); g.moveTo(40, 22); g.lineTo(54, 30); g.stroke(); noShadow(g); },
  pluma(g) { shadow(g); g.fillStyle = grad(g, 10, 54, 54, 10, [[0, '#8e826a'], [1, '#e9dfc6']]); g.beginPath(); g.moveTo(12, 54); g.bezierCurveTo(8, 28, 30, 8, 54, 8); g.bezierCurveTo(54, 32, 36, 52, 12, 54); g.fill(); noShadow(g); g.strokeStyle = '#4b4332'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(8, 58); g.lineTo(46, 18); g.stroke(); g.strokeStyle = 'rgba(70,60,40,.4)'; g.lineWidth = 1; for (const t of [0.25, 0.45, 0.65]) { const x = 8 + 38 * t, y = 58 - 40 * t; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + 2); g.stroke(); } },
  diente(g) { shadow(g); g.fillStyle = grad(g, 20, 8, 44, 56, [[0, '#fffaf0'], [1, '#c9bb96']]); g.beginPath(); g.moveTo(22, 12); g.bezierCurveTo(32, 6, 44, 10, 46, 14); g.bezierCurveTo(44, 34, 38, 46, 34, 58); g.bezierCurveTo(28, 46, 22, 32, 22, 12); g.fill(); noShadow(g); g.strokeStyle = 'rgba(80,60,30,.45)'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#b79a6a'; g.fillRect(22, 10, 24, 6); },
  cuerno(g) { shadow(g); g.fillStyle = grad(g, 14, 54, 50, 8, [[0, '#8f7c52'], [1, '#e6d7b0']]); g.beginPath(); g.moveTo(14, 56); g.bezierCurveTo(10, 30, 30, 14, 52, 6); g.bezierCurveTo(40, 22, 36, 38, 32, 56); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(70,52,24,.5)'; g.lineWidth = 1.2; for (const t of [0.2, 0.4, 0.6]) { g.beginPath(); g.moveTo(14 + 18 * t, 56 - 30 * t); g.lineTo(24 + 14 * t, 56 - 32 * t); g.stroke(); } },
  osteodermo(g) { shadow(g); g.fillStyle = grad(g, 12, 10, 52, 54, [[0, '#cdbd90'], [1, '#6e6244']]); g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.5; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * 23, 32 + Math.sin(a) * 23); } g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(40,30,10,.55)'; g.lineWidth = 1.4; g.stroke(); g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(32, 32, 9, 0, 7); g.fill(); },
  cuerda(g) { shadow(g); g.strokeStyle = '#a58e50'; g.lineWidth = 6; for (const r of [20, 14, 8]) { g.beginPath(); g.ellipse(32, 34, r, r * 0.8, 0, 0, 7); g.stroke(); } noShadow(g); g.strokeStyle = '#d9c88a'; g.lineWidth = 1.4; g.setLineDash([3, 4]); for (const r of [20, 14, 8]) { g.beginPath(); g.ellipse(32, 34, r, r * 0.8, 0, 0, 7); g.stroke(); } g.setLineDash([]); g.strokeStyle = '#a58e50'; g.lineWidth = 5; g.beginPath(); g.moveTo(50, 40); g.quadraticCurveTo(58, 52, 44, 56); g.stroke(); },
  vendaje(g) { shadow(g); g.fillStyle = grad(g, 10, 20, 54, 48, [[0, '#f4f0e0'], [1, '#bdb8a0']]); g.beginPath(); g.roundRect(10, 20, 44, 26, 12); g.fill(); noShadow(g); g.strokeStyle = 'rgba(90,80,50,.5)'; g.lineWidth = 1.2; for (const x of [20, 28, 36, 44]) { g.beginPath(); g.moveTo(x, 21); g.lineTo(x - 3, 45); g.stroke(); } g.fillStyle = '#7ab06a'; g.beginPath(); g.ellipse(32, 33, 6, 3, 0, 0, 7); g.fill(); g.fillStyle = '#c9544b'; g.fillRect(28, 28, 8, 2.4); g.fillRect(30.8, 25.4, 2.4, 8); },
  guijarro(g) { shadow(g); g.fillStyle = grad(g, 14, 16, 50, 50, [[0, '#cfcbc2'], [1, '#6a675f']]); g.beginPath(); g.ellipse(32, 34, 17, 14, -0.3, 0, 7); g.fill(); noShadow(g); g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(26, 28, 6, 3, -0.5, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(32, 34, 17, 14, -0.3, 0, 7); g.stroke(); },

  // herramientas y armas
  cuchillo_piedra(g) { cuchillo(g, ['#d6d2c8', '#78746c'], false); },
  cuchillo_hueso(g) { cuchillo(g, ['#fbf4e0', '#b7ab8a'], false); },
  cuchillo_diente(g) { cuchillo(g, ['#fffaf0', '#c9bb96'], true); },
  punzon_hueso(g) { shadow(g); handle(g, 10, 56, 26, 40, 5); g.fillStyle = grad(g, 26, 40, 54, 8, [[0, '#d9cfb0'], [1, '#fffaf0']]); g.beginPath(); g.moveTo(22, 44); g.lineTo(30, 36); g.lineTo(56, 6); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(60,44,20,.5)'; g.lineWidth = 1; g.stroke(); },
  martillo_piedra(g) { shadow(g); handle(g, 12, 56, 42, 20, 4.4); noShadow(g); g.save(); g.translate(44, 18); g.rotate(0.6); stone(g, [[-14, -9], [12, -11], [14, 9], [-12, 11]]); g.restore(); g.strokeStyle = '#a58e50'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(36, 28); g.lineTo(44, 34); g.moveTo(34, 32); g.lineTo(42, 38); g.stroke(); },
  garrote(g) { shadow(g); g.fillStyle = grad(g, 8, 56, 52, 10, [[0, '#4e3217'], [1, '#a2733f']]); g.beginPath(); g.moveTo(8, 54); g.lineTo(14, 58); g.lineTo(54, 20); g.bezierCurveTo(58, 12, 50, 6, 44, 10); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(30,16,6,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(24, 46); g.lineTo(28, 50); g.moveTo(34, 38); g.lineTo(38, 42); g.stroke(); },
  maza_piedra(g) { shadow(g); handle(g, 10, 56, 42, 22, 5); noShadow(g); g.save(); g.translate(46, 18); g.rotate(0.5); stone(g, [[-12, -14], [12, -12], [16, 4], [6, 16], [-12, 12], [-16, -2]]); g.restore(); g.strokeStyle = '#a58e50'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(34, 32); g.lineTo(44, 38); g.moveTo(32, 36); g.lineTo(42, 42); g.stroke(); },
  lanza_hueso(g) { lanzaGen(g, ['#fffaf0', '#b9ad8c'], 1); },
  lanza_cuerno(g) { lanzaGen(g, ['#f0e2bb', '#8c7a50'], 1.2); },
  jabalina(g) { shadow(g); handle(g, 12, 56, 46, 18, 3); noShadow(g); g.save(); g.translate(50, 12); g.rotate(0.84); stone(g, [[-4, 7], [0, -12], [4, 7]], '#d3d0c8', '#7a776f'); g.restore(); g.fillStyle = '#cf5a3b'; for (const [x, y] of [[12, 56], [16, 52]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7, y - 1); g.lineTo(x - 2, y + 6); g.closePath(); g.fill(); } },
  arco(g) { shadow(g); g.strokeStyle = grad(g, 12, 8, 24, 56, [[0, '#7a5328'], [1, '#c79a5c']]); g.lineWidth = 5; g.beginPath(); g.moveTo(16, 6); g.bezierCurveTo(56, 18, 56, 46, 16, 58); g.stroke(); noShadow(g); g.strokeStyle = '#efe6c8'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(16, 6); g.lineTo(16, 58); g.stroke(); g.strokeStyle = '#5a3c1b'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 28); g.lineTo(20, 36); g.stroke(); },
  honda(g) { shadow(g); g.strokeStyle = '#8a5a2c'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(10, 54); g.quadraticCurveTo(14, 30, 32, 30); g.moveTo(54, 54); g.quadraticCurveTo(50, 30, 32, 30); g.stroke(); g.fillStyle = '#b07a42'; g.beginPath(); g.ellipse(32, 30, 11, 7, 0, 0, 7); g.fill(); noShadow(g); g.fillStyle = grad(g, 26, 22, 38, 36, [[0, '#d0ccc2'], [1, '#6e6b63']]); g.beginPath(); g.arc(32, 30, 5, 0, 7); g.fill(); },
  flecha_madera(g) { flechaGen(g, null); },
  flecha_piedra(g) { flechaGen(g, ['#cbc7bd', '#6a675f']); },
  flecha_hueso(g) { flechaGen(g, ['#fffaf0', '#c3b896']); },

  // ropa
  capucha_cuero(g) { shadow(g); g.fillStyle = grad(g, 10, 8, 54, 56, [[0, '#b0804c'], [1, '#5e3d1e']]); g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(54, 8, 58, 40, 52, 56); g.lineTo(12, 56); g.bezierCurveTo(6, 40, 10, 8, 32, 6); g.fill(); noShadow(g); g.fillStyle = 'rgba(10,6,2,.8)'; g.beginPath(); g.ellipse(32, 36, 12, 14, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(240,210,160,.4)'; g.setLineDash([2, 3]); g.lineWidth = 1.2; g.beginPath(); g.ellipse(32, 36, 14, 16, 0, 0, 7); g.stroke(); g.setLineDash([]); },
  casco_hueso(g) { shadow(g); g.fillStyle = grad(g, 10, 8, 54, 50, [[0, '#fffaf0'], [1, '#b8aa86']]); g.beginPath(); g.moveTo(10, 40); g.bezierCurveTo(6, 8, 58, 8, 54, 40); g.lineTo(46, 52); g.lineTo(18, 52); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(60,44,20,.55)'; g.lineWidth = 1.4; g.stroke(); g.fillStyle = 'rgba(30,20,8,.85)'; g.beginPath(); g.ellipse(22, 36, 5, 6, 0, 0, 7); g.ellipse(42, 36, 5, 6, 0, 0, 7); g.fill(); g.strokeStyle = '#6b4a28'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 46); g.lineTo(50, 46); g.stroke(); },
  chaleco_cuero(g) { shadow(g); g.fillStyle = grad(g, 8, 8, 56, 58, [[0, '#b0804c'], [1, '#5e3d1e']]); g.beginPath(); g.moveTo(18, 8); g.lineTo(28, 12); g.lineTo(32, 20); g.lineTo(36, 12); g.lineTo(46, 8); g.lineTo(58, 18); g.lineTo(50, 28); g.lineTo(50, 58); g.lineTo(14, 58); g.lineTo(14, 28); g.lineTo(6, 18); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(30,16,6,.6)'; g.lineWidth = 1.4; g.stroke(); g.strokeStyle = '#e8d6a8'; g.lineWidth = 1.4; for (let y = 24; y < 56; y += 6) { g.beginPath(); g.moveTo(29, y); g.lineTo(35, y + 3); g.moveTo(35, y); g.lineTo(29, y + 3); g.stroke(); } },
  peto_osteodermo(g) { shadow(g); g.fillStyle = grad(g, 8, 8, 56, 58, [[0, '#8a6a42'], [1, '#41301c']]); g.beginPath(); g.moveTo(18, 8); g.lineTo(28, 12); g.lineTo(32, 20); g.lineTo(36, 12); g.lineTo(46, 8); g.lineTo(58, 18); g.lineTo(50, 28); g.lineTo(50, 58); g.lineTo(14, 58); g.lineTo(14, 28); g.lineTo(6, 18); g.closePath(); g.fill(); noShadow(g); for (const [x, y] of [[22, 30], [32, 30], [42, 30], [27, 40], [37, 40], [22, 50], [32, 50], [42, 50], [32, 20]]) { g.fillStyle = grad(g, x - 5, y - 5, x + 5, y + 5, [[0, '#e0d3ae'], [1, '#8c7e58']]); g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * 5.4, y + Math.sin(a) * 5.4); } g.closePath(); g.fill(); g.strokeStyle = 'rgba(40,28,10,.6)'; g.lineWidth = 0.9; g.stroke(); } },
  pantalon_cuero(g) { shadow(g); g.fillStyle = grad(g, 10, 6, 54, 58, [[0, '#a8794a'], [1, '#583a1d']]); g.beginPath(); g.moveTo(16, 6); g.lineTo(48, 6); g.lineTo(52, 58); g.lineTo(36, 58); g.lineTo(32, 26); g.lineTo(28, 58); g.lineTo(12, 58); g.closePath(); g.fill(); noShadow(g); g.fillStyle = '#6b4a28'; g.fillRect(16, 6, 32, 6); g.strokeStyle = 'rgba(30,16,6,.6)'; g.lineWidth = 1.2; g.stroke(); g.strokeStyle = '#e8d6a8'; g.lineWidth = 1.2; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(32, 26); g.lineTo(32, 12); g.stroke(); g.setLineDash([]); },
  sandalias_cuero(g) { shadow(g); for (const dx of [0, 22]) { g.fillStyle = grad(g, 8, 10, 30, 58, [[0, '#b0804c'], [1, '#5e3d1e']]); g.beginPath(); g.ellipse(18 + dx * 0.9, 36, 8, 20, 0.1, 0, 7); g.fill(); g.strokeStyle = '#e8d6a8'; g.lineWidth = 2; g.beginPath(); g.moveTo(11 + dx * 0.9, 30); g.lineTo(25 + dx * 0.9, 30); g.moveTo(11 + dx * 0.9, 40); g.lineTo(25 + dx * 0.9, 40); g.stroke(); } noShadow(g); },
  capa_piel(g) { shadow(g); g.fillStyle = grad(g, 8, 8, 56, 58, [[0, '#9b8460'], [1, '#4f3d24']]); g.beginPath(); g.moveTo(22, 8); g.quadraticCurveTo(32, 14, 42, 8); g.lineTo(58, 56); g.quadraticCurveTo(32, 62, 6, 56); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(30,20,8,.55)'; g.lineWidth = 1.4; g.stroke(); g.fillStyle = '#d8c79c'; for (const [x, y] of [[14, 52], [22, 56], [32, 58], [42, 56], [50, 52]]) { g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x, y + 5); g.lineTo(x + 4, y - 2); g.closePath(); g.fill(); } g.fillStyle = '#6b4a28'; g.beginPath(); g.arc(32, 14, 3.4, 0, 7); g.fill(); },
  mochila_cuero(g) { shadow(g); g.fillStyle = grad(g, 12, 10, 52, 58, [[0, '#b0804c'], [1, '#5a3a1c']]); g.beginPath(); g.roundRect(14, 14, 36, 44, 10); g.fill(); noShadow(g); g.strokeStyle = 'rgba(30,16,6,.6)'; g.lineWidth = 1.4; g.stroke(); g.fillStyle = '#7a5430'; g.beginPath(); g.roundRect(14, 14, 36, 18, [10, 10, 4, 4]); g.fill(); g.stroke(); g.fillStyle = '#e8d6a8'; g.fillRect(29, 28, 6, 8); g.strokeStyle = '#6b4a28'; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 14); g.bezierCurveTo(22, 4, 42, 4, 42, 14); g.stroke(); g.fillStyle = '#7a5430'; g.beginPath(); g.roundRect(20, 42, 24, 12, 4); g.fill(); g.stroke(); },

  // equipo de criaturas
  cabestro(g) { shadow(g); g.strokeStyle = '#c9b36a'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(14, 18); g.quadraticCurveTo(32, 4, 50, 18); g.lineTo(50, 40); g.quadraticCurveTo(32, 54, 14, 40); g.closePath(); g.stroke(); g.strokeStyle = '#8a5a32'; g.lineWidth = 5; g.beginPath(); g.moveTo(22, 40); g.quadraticCurveTo(32, 46, 42, 40); g.stroke(); g.strokeStyle = '#c9b36a'; g.lineWidth = 3; g.beginPath(); g.moveTo(50, 24); g.quadraticCurveTo(58, 40, 52, 58); g.stroke(); noShadow(g); },
  collar_id(g) { shadow(g); g.strokeStyle = grad(g, 8, 10, 56, 54, [[0, '#b0804c'], [1, '#5a3a1c']]); g.lineWidth = 6; g.beginPath(); g.ellipse(32, 30, 20, 16, 0, 0, 7); g.stroke(); noShadow(g); g.fillStyle = '#efe6cf'; g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(32, 47, 5, 7, 0, 0, 7); g.fill(); g.stroke(); },
  arnes_cuero(g) { shadow(g); g.strokeStyle = grad(g, 8, 8, 56, 56, [[0, '#a8794a'], [1, '#583a1d']]); g.lineWidth = 7; g.beginPath(); g.moveTo(10, 16); g.lineTo(54, 48); g.moveTo(54, 16); g.lineTo(10, 48); g.stroke(); g.lineWidth = 6; g.beginPath(); g.ellipse(32, 32, 20, 24, 0, 0, 7); g.stroke(); noShadow(g); g.fillStyle = '#d9c28a'; for (const [x, y] of [[32, 32], [14, 20], [50, 20], [14, 44], [50, 44]]) { g.beginPath(); g.arc(x, y, 2.3, 0, 7); g.fill(); } },
  alforjas(g) { shadow(g); for (const dx of [0, 1]) { g.fillStyle = grad(g, 8, 14, 30, 58, [[0, '#a8794a'], [1, '#583a1d']]); g.beginPath(); g.roundRect(dx ? 36 : 6, 22, 22, 34, 6); g.fill(); g.strokeStyle = 'rgba(30,16,6,.6)'; g.lineWidth = 1.3; g.stroke(); } noShadow(g); g.strokeStyle = '#7d5530'; g.lineWidth = 5; g.beginPath(); g.moveTo(14, 24); g.quadraticCurveTo(32, 8, 50, 24); g.stroke(); g.fillStyle = '#d9c28a'; g.fillRect(14, 34, 6, 4); g.fillRect(44, 34, 6, 4); },
  bolsa_carga(g) { shadow(g); g.fillStyle = grad(g, 14, 16, 50, 58, [[0, '#b0804c'], [1, '#5a3a1c']]); g.beginPath(); g.moveTo(20, 20); g.lineTo(44, 20); g.quadraticCurveTo(56, 34, 50, 54); g.lineTo(14, 54); g.quadraticCurveTo(8, 34, 20, 20); g.fill(); noShadow(g); g.strokeStyle = 'rgba(30,16,6,.6)'; g.lineWidth = 1.3; g.stroke(); g.strokeStyle = '#d9c28a'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 20); g.quadraticCurveTo(32, 8, 44, 20); g.stroke(); },
  montura_ligera(g) { silla(g, 0); },
  montura_transporte(g) { silla(g, 1); },
  montura_reforzada(g) { silla(g, 2); },
  proteccion_animal(g) { shadow(g); g.fillStyle = grad(g, 8, 10, 56, 56, [[0, '#a89a78'], [1, '#4f4632']]); g.beginPath(); g.moveTo(8, 22); g.quadraticCurveTo(32, 4, 56, 22); g.lineTo(52, 50); g.quadraticCurveTo(32, 60, 12, 50); g.closePath(); g.fill(); noShadow(g); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.3; g.stroke(); g.fillStyle = 'rgba(255,250,230,.55)'; for (const [x, y] of [[20, 26], [32, 22], [44, 26], [26, 38], [38, 38], [32, 48]]) { g.beginPath(); g.ellipse(x, y, 6, 5, 0, 0, 7); g.fill(); g.stroke(); } },
};

/** Icono de reserva (un objeto sin dibujo propio): forma según su tipo y color de su ficha. */
function generico(id) {
  const it = ITEMS[id], col = it?.color ?? '#9a9a9a';
  return (g) => {
    shadow(g);
    g.fillStyle = grad(g, 12, 10, 52, 54, [[0, col], [1, 'rgba(0,0,0,.55)']]);
    if (it?.tipo === 'ropa') { g.beginPath(); g.roundRect(14, 12, 36, 42, 10); g.fill(); }
    else if (it?.tipo === 'herramienta' || it?.tipo === 'arma') { g.save(); g.translate(32, 32); g.rotate(-0.8); g.beginPath(); g.roundRect(-4, -26, 8, 52, 3); g.fill(); g.restore(); }
    else { g.beginPath(); g.ellipse(32, 34, 18, 15, -0.3, 0, 7); g.fill(); }
    noShadow(g); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.2; g.stroke();
  };
}

export function iconUrl(id) {
  let u = cache.get(id);
  if (!u) {
    try { u = mk(DRAW[id] ?? generico(id)); } catch { u = ''; }
    cache.set(id, u);
  }
  return u;
}

/** Iconos SVG pequeños de las estadísticas. */
export const STAT_SVG = {
  vida: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 5.800-8 11-8 11z" fill="currentColor"/></svg>',
  hambre: '<svg viewBox="0 0 24 24"><path d="M14.500 3.500c3 0 5.500 2.500 5.500 5.500 0 2-1 3.600-2.500 4.600l-.7 5.600a1.800 1.800 0 0 1-3.100 1L9 15.500l-3 .5a2 2 0 0 1-2.200-2.700L5 10.500C6 6.500 10 3.500 14.500 3.500z" fill="currentColor"/></svg>',
  sed: '<svg viewBox="0 0 24 24"><path d="M12 2.500c3.500 4.500 6 7.800 6 11.200A6 6 0 0 1 6 13.700C6 10.300 8.500 7 12 2.500z" fill="currentColor"/></svg>',
  energia: '<svg viewBox="0 0 24 24"><path d="M13.500 2L5 13.500h5.500L9.500 22 19 10h-5.800z" fill="currentColor"/></svg>',
  oxigeno: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="4.200" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.500" cy="8" r="2.800" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  temp: '<svg viewBox="0 0 24 24"><path d="M10 14.200V5a2 2 0 0 1 4 0v9.200a4 4 0 1 1-4 0z" fill="currentColor"/></svg>',
};
