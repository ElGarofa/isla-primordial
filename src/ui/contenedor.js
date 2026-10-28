// Panel de contenedor (cesta, cofre, vasija): la mochila a la izquierda y el contenedor a la derecha. Clic en una casilla la pasa
// al otro lado entera, Mayús+clic pasa la mitad, también se puede arrastrar entre las dos rejillas. «Guardar todo» deja la barra
// rápida (1–9) en la mochila; «Tomar todo» saca lo que quepa. E, Tab o Esc cierran. Se cierra solo si el jugador se aleja.
import { ITEMS } from '../core/items.js';

export function createContenedorPanel(ctx, h) {
  const { el, showScreen, closeScreens, unlock, lock, snd, iconUrl, barraDur, barraFr, calClase, kg, lt } = h;
  const S = ctx.survival, K = () => ctx.construccion;
  const screen = el('', 'screen dim hide');
  let pieza = null, arrastre = null;

  const casilla = (s, attr, extra = '') => `<div class="slot ${s ? calClase(s) : ''} ${extra}" draggable="${s ? 'true' : 'false'}" ${attr}>${s ? `<img src="${iconUrl(s.item)}" alt="" title="${ITEMS[s.item]?.nombre ?? ''}">${s.cantidad > 1 ? `<span class="c">${s.cantidad}</span>` : ''}${barraDur(s)}${barraFr?.(s) ?? ''}` : ''}</div>`;

  function render() {
    if (!pieza) return;
    const def = pieza.def, cs = pieza.cont.casillas, usadas = cs.filter(Boolean).length;
    let mochila = '';
    for (let i = 0; i < S.slots.length; i++) mochila += casilla(S.slots[i], `data-m="${i}"`, i < 9 ? 'hb' : '');
    let cont = '';
    for (let i = 0; i < cs.length; i++) cont += casilla(cs[i], `data-c="${i}"`);
    const w = S.inventory.peso(), cap = S.inventory.capacidad();
    const conserva = pieza.cont.conserva < 1 ? `<div class="cnota">La comida guardada aquí se estropea ${(1 / pieza.cont.conserva).toFixed(1).replace('.', ',')} veces más despacio.</div>` : '';
    screen.innerHTML = `<div class="panel inv contenedor">
      <div class="left"><h3>MOCHILA</h3><div class="cinfo">Peso <b>${kg(w)}</b> / ${kg(cap.peso)} · volumen <b>${lt(S.inventory.volumen())}</b> / ${lt(cap.volumen)}</div>
        <div class="grid">${mochila}</div>
        <div class="acts"><button class="btn sm" data-a="guardar">Guardar todo (menos la barra 1–9)</button></div></div>
      <div class="right"><h3>${def.nombre.toUpperCase()}</h3><div class="cinfo">${usadas}/${cs.length} casillas ocupadas</div>${conserva}
        <div class="grid cgrid">${cont}</div>
        <div class="acts"><button class="btn sm" data-a="tomar">Tomar todo</button><button class="btn sm" data-a="cerrar">Cerrar</button></div>
        <div class="cayuda">Clic: pasar la casilla al otro lado · Mayús + clic: la mitad · también se puede arrastrar.</div></div></div>`;
  }

  function abrir(p) {
    if (!p?.cont) return;
    pieza = p; K().abierto = p;
    render(); showScreen('contenedor'); unlock(); snd('ui_open');
  }
  function cerrar() {
    if (!pieza) return;
    pieza = null; K()?.cerrarContenedor?.();
    closeScreens(); lock(); snd('ui_close');
  }
  const mitad = (n) => Math.max(1, Math.floor(n / 2));

  screen.addEventListener('click', (e) => {
    if (!pieza) return;
    const m = e.target.closest('[data-m]'), c = e.target.closest('[data-c]');
    if (m) { const i = +m.dataset.m, s = S.slots[i]; if (s && K().guardar(pieza, i, e.shiftKey ? mitad(s.cantidad) : null)) snd('ui_click'); render(); return; }
    if (c) { const i = +c.dataset.c, s = pieza.cont.casillas[i]; if (s && K().sacar(pieza, i, e.shiftKey ? mitad(s.cantidad) : null)) snd('ui_click'); render(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'guardar') { K().guardarTodo(pieza, 9); snd('ui_click'); render(); }
    if (a === 'tomar') { K().sacarTodo(pieza); snd('ui_click'); render(); }
    if (a === 'cerrar' || (!a && e.target === screen)) cerrar();
  });
  screen.addEventListener('dragstart', (e) => {
    const m = e.target.closest('[data-m]'), c = e.target.closest('[data-c]');
    arrastre = m ? { de: 'm', i: +m.dataset.m } : c ? { de: 'c', i: +c.dataset.c } : null;
    if (arrastre) { e.dataTransfer.setData('text/plain', JSON.stringify(arrastre)); e.dataTransfer.effectAllowed = 'move'; }
  });
  screen.addEventListener('dragover', (e) => { const s = e.target.closest('[data-m],[data-c]'); if (s) { e.preventDefault(); s.classList.add('over'); } });
  screen.addEventListener('dragleave', (e) => { e.target.closest?.('.slot')?.classList.remove('over'); });
  screen.addEventListener('drop', (e) => {
    const m = e.target.closest('[data-m]'), c = e.target.closest('[data-c]'); if (!arrastre || (!m && !c)) return;
    e.preventDefault();
    if (arrastre.de === 'm' && c) K().guardar(pieza, arrastre.i, e.shiftKey ? mitad(S.slots[arrastre.i]?.cantidad ?? 1) : null);
    else if (arrastre.de === 'c' && m) K().sacar(pieza, arrastre.i, e.shiftKey ? mitad(pieza.cont.casillas[arrastre.i]?.cantidad ?? 1) : null);
    else if (arrastre.de === 'm' && m) S.inventory.move(arrastre.i, +m.dataset.m);
    else if (arrastre.de === 'c' && c) { const cs = pieza.cont.casillas, a = arrastre.i, b = +c.dataset.c; [cs[a], cs[b]] = [cs[b], cs[a]]; }
    arrastre = null; snd('ui_click'); render();
  });

  ctx.events.on('contenedor:cambio', ({ pieza: p }) => { if (pieza && p === pieza) render(); });
  ctx.events.on('inventory:changed', () => { if (pieza) render(); });
  ctx.events.on('contenedor:cerrar', ({ pieza: p }) => { if (pieza && p === pieza) { pieza = null; closeScreens(); lock(); } });

  return { screen, abrir, cerrar, render, get pieza() { return pieza; } };
}
