// Iconos de objetos dibujados con canvas 2D (vectoriales, sin imágenes externas). iconUrl(id) -> dataURL cacheada.
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
};

export function iconUrl(id) {
  let u = cache.get(id);
  if (!u) {
    try { u = mk(DRAW[id] ?? ((g) => { g.fillStyle = '#888'; g.fillRect(14, 14, 36, 36); })); } catch { u = ''; }
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
