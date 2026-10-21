// Módulo UI: HUD, barra rápida, inventario/fabricación, mapa, menú principal, pausa, muerte y ajustes. Todo el texto en español.
import { ITEMS } from '../core/items.js';
import { CSS } from './style.js';
import { iconUrl, STAT_SVG } from './icons.js';

const SETTINGS_KEY = 'isla-primordial:ajustes:v1';
const TIPOS = { recurso: 'Recurso', comida: 'Comida', bebida: 'Bebida', herramienta: 'Herramienta', arma: 'Arma', colocable: 'Colocable' };
const CAUSAS = { Hambre: 'Murió de inanición', Sed: 'Murió de sed', Ahogamiento: 'Se ahogó', Frío: 'Murió de frío' };
const TUTORIAL = [
  { txt: 'Golpea un árbol con las manos y reúne 3 de <b>madera</b>.', ok: (S) => Math.min(1, S.inventory.count('madera') / 3) },
  { txt: 'Golpea rocas para conseguir 2 <b>piedras</b>.', ok: (S) => Math.min(1, S.inventory.count('piedra') / 2) },
  { txt: 'Recolecta 4 de <b>fibra</b> de arbustos y árboles.', ok: (S) => Math.min(1, S.inventory.count('fibra') / 4) },
  { txt: 'Pulsa <b>Tab</b> y fabrica un <b>hacha de piedra</b>.', ok: (S) => (S.inventory.has('hacha_piedra') ? 1 : 0) },
  { txt: 'Con el hacha en la barra (teclas 1–9) tala árboles: reúne 6 de madera, 4 de piedra y 1 de pedernal para una <b>fogata</b>.', ok: (S) => (S.inventory.has('fogata') ? 1 : (Math.min(1, S.inventory.count('madera') / 6) + Math.min(1, S.inventory.count('piedra') / 4) + Math.min(1, S.inventory.count('pedernal') / 1)) / 3) },
  { txt: 'Selecciona la fogata y pulsa <b>F</b> para colocarla.', ok: (S, st) => (st.fogata ? 1 : 0) },
  { txt: 'Sobrevive: bebe agua (E junto al mar), come bayas y cuidado con las criaturas.', ok: () => 0 },
];

export async function create(ctx) {
  const S = ctx.survival;
  const root = document.getElementById('ui-root');
  const ui = (ctx.ui = { blocksInput: false, notify() {}, notifyItem() {}, showMenu() {}, hideMenu() {} });
  if (ctx.debug.hideUI || !root) return { name: 'ui' };

  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const lock = () => { if (!ctx.debug.enabled) ctx.container.requestPointerLock?.(); };
  const unlock = () => { try { document.exitPointerLock?.(); } catch { /* sin bloqueo */ } };
  const snd = (nombre = 'ui_click') => ctx.events.emit('ui:sound', { nombre });
  const $ = (sel, el = root) => el.querySelector(sel);
  const el = (html, cls = '') => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; return d; };

  // ------------------------------------------------------------------ ajustes
  const defaults = { calidad: ctx.settings.quality ?? 'high', volumen: 0.8, musica: 0.6, sensibilidad: 1, fps: false };
  let cfg = { ...defaults };
  try { cfg = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { /* sin almacenamiento */ }
  function applySettings() {
    ctx.settings.sensibilidad = cfg.sensibilidad; ctx.settings.volumen = cfg.volumen; ctx.settings.musica = cfg.musica;
    if (!new URLSearchParams(location.search).has('quality') && ctx.settings.quality !== cfg.calidad) { ctx.settings.quality = cfg.calidad; ctx.render?.setQuality?.(cfg.calidad); }
    ctx.audio?.setMasterVolume?.(cfg.volumen); ctx.audio?.setMusicVolume?.(cfg.musica);
    fpsBox.classList.toggle('hide', !cfg.fps);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ }
  }

  // ------------------------------------------------------------------ HUD
  const hud = el(`
    <div class="dmg"></div>
    <div class="compass"><div class="track"></div></div><div class="compass-mark" style="left:50%;top:14px;margin-left:0"></div>
    <div class="clock"></div>
    <div class="goal panel"><h4>OBJETIVO</h4><p></p><div class="pg"><i></i></div></div>
    <div class="notifs"></div>
    <div class="cross"></div>
    <div class="target"><div class="tn"></div><div class="ta"></div><div class="tb"><i></i></div></div>
    <div class="hint"></div>
    <div class="slotname"></div>
    <div class="hotbar"></div>
    <div class="vitals">
      ${['vida', 'hambre', 'sed', 'energia', 'oxigeno'].map((k) => `<div class="vit ${k}" data-k="${k}">${STAT_SVG[k]}<div class="bar"><div class="fill"></div></div><div class="val">100</div></div>`).join('')}
      <div class="temp">${STAT_SVG.temp}<span><b>26°C</b> <span class="tl">templado</span></span></div>
    </div>
    <div class="fpsbox"></div>`, 'hud');
  root.append(hud);
  const fpsBox = $('.fpsbox', hud);
  const dmgEl = $('.dmg', hud), crossEl = $('.cross', hud), targetEl = $('.target', hud), hintEl = $('.hint', hud), slotNameEl = $('.slotname', hud);
  const hotbarEl = $('.hotbar', hud), notifs = $('.notifs', hud), goalEl = $('.goal', hud), clockEl = $('.clock', hud);
  const bars = {}; hud.querySelectorAll('.vit').forEach((v) => { bars[v.dataset.k] = { root: v, fill: $('.fill', v), val: $('.val', v), last: -1 }; });
  const tempEl = $('.temp', hud);
  bars.oxigeno.root.classList.add('hide');

  // brújula
  const compassTrack = $('.compass .track', hud);
  const PPD = 3.4;
  {
    let h = '';
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let rep = 0; rep < 3; rep++) for (let d = 0; d < 360; d += 15) {
      const x = (rep * 360 + d) * PPD;
      if (names[d]) h += `<div class="l ${d === 0 ? 'n' : ''}" style="left:${x}px">${names[d]}</div>`;
      else h += `<div class="t" style="left:${x}px"></div>`;
    }
    compassTrack.style.width = `${3 * 360 * PPD}px`; compassTrack.innerHTML = h;
  }

  // barra rápida
  let hotbarDirty = true, lastSel = -1, nameTimer = 0;
  function renderHotbar() {
    hotbarDirty = false;
    let h = '';
    for (let i = 0; i < 9; i++) {
      const s = S.slots[i];
      h += `<div class="slot ${i === S.selected ? 'sel' : ''}"><span class="n">${i + 1}</span>${s ? `<img src="${iconUrl(s.item)}" alt="">${s.cantidad > 1 ? `<span class="c">${s.cantidad}</span>` : ''}` : ''}</div>`;
    }
    hotbarEl.innerHTML = h;
    const sel = S.slots[S.selected];
    if (S.selected !== lastSel) { lastSel = S.selected; if (sel) { slotNameEl.textContent = ITEMS[sel.item].nombre; slotNameEl.classList.add('on'); nameTimer = 1.8; } }
    let hint = '';
    if (sel) {
      const it = ITEMS[sel.item];
      if (it.tipo === 'comida') hint = `<span class="key">F</span>Comer ${it.nombre.toLowerCase()}`;
      else if (it.tipo === 'bebida') hint = `<span class="key">F</span>Beber`;
      else if (it.tipo === 'colocable') hint = `<span class="key">F</span>Colocar ${it.nombre.toLowerCase()}`;
    }
    if (hintEl.dataset.h !== hint) { hintEl.dataset.h = hint; hintEl.innerHTML = hint; }
  }
  ctx.events.on('inventory:changed', () => { hotbarDirty = true; if (openPanel === 'inventario') renderInventory(); });

  // objetivo / tutorial
  const tutState = { fogata: false };
  ctx.events.on('fogata:colocada', () => { tutState.fogata = true; });
  let goalDone = 0;
  function updateGoal(dt) {
    const step = S.tutorial?.step ?? 0;
    if (step >= TUTORIAL.length) { goalDone += dt; goalEl.classList.toggle('hide', true); return; }
    const t = TUTORIAL[step];
    const p = t.ok(S, tutState);
    $('p', goalEl).innerHTML = t.txt;
    $('.pg i', goalEl).style.width = `${Math.round(p * 100)}%`;
    if (p >= 1 && step < TUTORIAL.length - 1) { S.tutorial.step++; snd('craft'); }
    goalEl.classList.toggle('hide', ctx.state === 'menu');
  }

  // notificaciones
  let lastItem = null;
  function notify(texto, tipo = 'info') {
    const n = el(texto, `nt ${tipo}`);
    notifs.append(n); while (notifs.children.length > 6) notifs.firstChild.remove();
    setTimeout(() => n.classList.add('out'), 2800); setTimeout(() => n.remove(), 3400);
  }
  ui.notify = notify;
  ctx.events.on('item:added', ({ item, cantidad }) => {
    const now = performance.now();
    if (lastItem && lastItem.item === item && now - lastItem.t < 1600 && lastItem.el.isConnected) {
      lastItem.n += cantidad; lastItem.t = now;
      lastItem.el.innerHTML = `<img src="${iconUrl(item)}" alt="">+${lastItem.n} ${ITEMS[item].nombre}`;
      clearTimeout(lastItem.to1); clearTimeout(lastItem.to2);
      lastItem.to1 = setTimeout(() => lastItem.el.classList.add('out'), 2800); lastItem.to2 = setTimeout(() => lastItem.el.remove(), 3400);
      return;
    }
    const n = el(`<img src="${iconUrl(item)}" alt="">+${cantidad} ${ITEMS[item].nombre}`, 'nt item');
    notifs.append(n); while (notifs.children.length > 6) notifs.firstChild.remove();
    lastItem = { item, n: cantidad, t: now, el: n, to1: setTimeout(() => n.classList.add('out'), 2800), to2: setTimeout(() => n.remove(), 3400) };
  });

  // objetivo apuntado
  ctx.events.on('player:target', (t) => {
    if (!t) { targetEl.classList.remove('on'); crossEl.classList.remove('on'); return; }
    $('.tn', targetEl).textContent = t.nombre ?? '';
    const gestos = ['Talar', 'Picar', 'Atacar'];
    const accion = t.accion ?? '';
    $('.ta', targetEl).innerHTML = accion ? `<span class="key">${gestos.includes(accion) ? 'Clic' : 'E'}</span>${accion}` : '';
    const tb = $('.tb', targetEl);
    if (t.vida != null && t.vida < 100) { tb.style.display = ''; $('i', tb).style.width = `${Math.max(0, t.vida)}%`; } else tb.style.display = 'none';
    targetEl.classList.add('on'); crossEl.classList.add('on');
  });

  // daño
  ctx.events.on('player:damage', () => { dmgEl.classList.add('flash'); requestAnimationFrame(() => requestAnimationFrame(() => dmgEl.classList.remove('flash'))); });

  // ------------------------------------------------------------------ pantallas
  let openPanel = null; // 'inventario' | 'mapa' | 'ajustes' | ...
  const screens = {};
  let prevScreen = null;
  function refreshBlock() { ui.blocksInput = ctx.state !== 'playing' || !!openPanel; }
  function showScreen(name) {
    if (name === 'ajustes') syncSettingsUI();
    for (const [k, v] of Object.entries(screens)) v.classList.toggle('hide', k !== name);
    openPanel = name && name !== 'menu' && name !== 'pausa' && name !== 'muerte' ? name : null;
    refreshBlock();
  }
  function closeScreens() { for (const v of Object.values(screens)) v.classList.add('hide'); openPanel = null; refreshBlock(); }

  // ---- menú principal
  screens.menu = el(`
    <div class="col">
      <h1 class="logo">ISLA<br>PRIMORDIAL<span>SUPERVIVENCIA</span></h1>
      <p class="tag">Naufragas en una isla donde el tiempo se detuvo. Recolecta, fabrica, construye tu fuego y sobrevive a las criaturas que la dominan.</p>
      <button class="btn primary" data-a="continuar">Continuar<small>Retoma tu última partida</small></button>
      <button class="btn" data-a="nueva">Nueva partida</button>
      <button class="btn" data-a="ajustes">Ajustes</button>
      <button class="btn" data-a="controles">Controles</button>
    </div><div class="ver">v1.0 · Three.js · generado por código</div>`, 'screen menu hide');
  screens.menu.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    snd();
    if (a === 'continuar') startGame(true);
    if (a === 'nueva') startGame(false);
    if (a === 'ajustes') { prevScreen = 'menu'; showScreen('ajustes'); }
    if (a === 'controles') { prevScreen = 'menu'; showScreen('controles'); }
  });
  function startGame(load) {
    ctx.audio?.resume?.();
    if (load) { if (!S.load()) S.newGame(); } else { S.clearSave(); S.newGame(); }
    closeScreens();
    ctx.setState('playing');
  }

  // ---- pausa
  screens.pausa = el(`<div class="panel modal"><h2>PAUSA</h2><div class="sub">El mundo está detenido.</div>
    <button class="btn primary" data-a="seguir">Continuar</button>
    <button class="btn" data-a="guardar">Guardar partida</button>
    <button class="btn" data-a="ajustes">Ajustes</button>
    <button class="btn" data-a="controles">Controles</button>
    <button class="btn" data-a="salir">Guardar y salir al menú</button></div>`, 'screen dim hide');
  screens.pausa.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; snd();
    if (a === 'seguir') resume();
    if (a === 'guardar') S.save();
    if (a === 'ajustes') { prevScreen = 'pausa'; showScreen('ajustes'); }
    if (a === 'controles') { prevScreen = 'pausa'; showScreen('controles'); }
    if (a === 'salir') { S.save(true); location.reload(); }
  });
  function resume() { closeScreens(); ctx.setState('playing'); lock(); }

  // ---- ajustes
  screens.ajustes = el(`<div class="panel modal"><h2>AJUSTES</h2><div class="sub">Se guardan automáticamente.</div>
    <div class="row"><label>Calidad gráfica</label><select data-k="calidad"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="ultra">Ultra</option></select></div>
    <div class="row"><label>Volumen general</label><input type="range" min="0" max="1" step="0.05" data-k="volumen"><span class="v"></span></div>
    <div class="row"><label>Volumen de música</label><input type="range" min="0" max="1" step="0.05" data-k="musica"><span class="v"></span></div>
    <div class="row"><label>Sensibilidad del ratón</label><input type="range" min="0.3" max="2.5" step="0.05" data-k="sensibilidad"><span class="v"></span></div>
    <div class="row"><label>Mostrar FPS</label><input type="checkbox" data-k="fps"></div>
    <div style="margin-top:22px"><button class="btn sm" data-a="volver">Volver</button></div></div>`, 'screen dim hide');
  function syncSettingsUI() {
    screens.ajustes.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!cfg[k]; else inp.value = cfg[k];
      const v = inp.parentElement.querySelector('.v'); if (v) v.textContent = Number(cfg[k]).toFixed(2).replace(/\.?0+$/, '');
    });
  }
  screens.ajustes.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    cfg[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    const v = e.target.parentElement.querySelector('.v'); if (v) v.textContent = Number(cfg[k]).toFixed(2).replace(/\.?0+$/, '');
    applySettings();
  });
  screens.ajustes.addEventListener('click', (e) => { if (e.target.closest('[data-a="volver"]')) { snd(); showScreen(prevScreen ?? 'pausa'); } });

  // ---- controles
  screens.controles = el(`<div class="panel modal"><h2>CONTROLES</h2><div class="sub">Todo se maneja con teclado y ratón.</div><div class="keys">
    <span><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></span><span>Moverse</span>
    <span><span class="key">Shift</span></span><span>Correr</span>
    <span><span class="key">Ctrl</span></span><span>Agacharse</span>
    <span><span class="key">Espacio</span></span><span>Saltar / nadar hacia arriba</span>
    <span><span class="key">Clic izq.</span></span><span>Golpear, talar, picar, atacar</span>
    <span><span class="key">E</span></span><span>Interactuar, recoger, beber</span>
    <span><span class="key">1–9</span> / rueda</span><span>Elegir objeto de la barra</span>
    <span><span class="key">F</span></span><span>Usar objeto: comer, beber, colocar fogata</span>
    <span><span class="key">Tab</span></span><span>Inventario y fabricación</span>
    <span><span class="key">M</span></span><span>Mapa</span>
    <span><span class="key">Esc</span></span><span>Pausa</span></div>
    <div style="margin-top:22px"><button class="btn sm" data-a="volver">Volver</button></div></div>`, 'screen dim hide');
  screens.controles.addEventListener('click', (e) => { if (e.target.closest('[data-a="volver"]')) { snd(); showScreen(prevScreen ?? 'pausa'); } });

  // ---- muerte
  screens.muerte = el(`<h1>HAS MUERTO</h1><p class="cause"></p><button class="btn" data-a="otra">Reaparecer</button>`, 'screen death hide');
  screens.muerte.addEventListener('click', (e) => { if (!e.target.closest('[data-a]')) return; snd(); S.respawn(); lock(); });
  let lastCause = '';
  ctx.events.on('player:died', ({ causa }) => { lastCause = causa; $('.cause', screens.muerte).textContent = CAUSAS[causa] ?? (causa ? `Causa: ${causa}` : 'Tu historia termina aquí.'); });

  // ---- inventario
  screens.inventario = el('', 'screen dim hide');
  let invSel = 0, dragFrom = -1;
  function itemDetail(i) {
    const s = S.slots[i];
    if (!s) return '<div class="dd">Casilla vacía. Arrastra objetos para organizarlos; las 9 primeras forman tu barra rápida.</div>';
    const it = ITEMS[s.item];
    const fx = [];
    if (it.comida) fx.push(`+${it.comida} hambre`); if (it.sed) fx.push(`+${it.sed} sed`); if (it.vida) fx.push(`${it.vida > 0 ? '+' : ''}${it.vida} vida`);
    if (it.dano) fx.push(`${it.dano} de daño`); if (it.talar) fx.push('tala árboles'); if (it.picar) fx.push('rompe rocas'); if (it.alcance) fx.push(`alcance ${it.alcance} m`);
    const usable = it.tipo === 'comida' || it.tipo === 'bebida' || it.tipo === 'colocable';
    const tool = it.tipo === 'herramienta' || it.tipo === 'arma';
    return `<div class="dt">${TIPOS[it.tipo] ?? it.tipo}</div><div class="dn">${it.nombre}${s.cantidad > 1 ? ` ×${s.cantidad}` : ''}</div>
      <div class="dd">${it.descripcion}${fx.length ? `<br><span style="color:var(--acc2)">${fx.join(' · ')}</span>` : ''}</div>
      <div class="acts">${usable ? `<button class="btn sm" data-a="usar">${it.tipo === 'comida' ? 'Comer' : it.tipo === 'bebida' ? 'Beber' : 'Colocar'}</button>` : ''}${tool ? `<button class="btn sm" data-a="equipar">Equipar</button>` : ''}<button class="btn sm" data-a="soltar">Soltar</button></div>`;
  }
  function renderInventory() {
    const st = S.stats;
    let grid = '';
    for (let i = 0; i < S.slots.length; i++) {
      const s = S.slots[i];
      grid += `<div class="slot ${i < 9 ? 'hb' : ''} ${i === invSel ? 'sel' : ''}" draggable="true" data-i="${i}">${i < 9 ? `<span class="n">${i + 1}</span>` : ''}${s ? `<img src="${iconUrl(s.item)}" alt="">${s.cantidad > 1 ? `<span class="c">${s.cantidad}</span>` : ''}` : ''}</div>`;
    }
    const recs = S.recipes.map((r) => S.recipeInfo(r)).sort((a, b) => Number(b.posible) - Number(a.posible));
    const recHtml = recs.map((r) => {
      const costs = Object.entries(r.costo).map(([id, n]) => { const have = S.inventory.count(id); return `<span class="${have >= n ? '' : 'no'}">${ITEMS[id].nombre} ${Math.min(have, 999)}/${n}</span>`; }).join('');
      return `<div class="rec ${r.posible ? 'ok' : ''}"><img src="${iconUrl(r.id)}" alt=""><div><div class="rn">${r.nombre}${r.cantidad > 1 ? ` ×${r.cantidad}` : ''}</div><div class="rc">${costs}</div>${r.estacion && !r.estacionOk ? '<div class="st">Requiere una fogata encendida cerca</div>' : ''}</div><button class="btn sm" data-craft="${r.id}" ${r.posible ? '' : 'disabled'}>Fabricar</button></div>`;
    }).join('');
    screens.inventario.innerHTML = `<div class="panel inv">
      <div class="left"><h3>MOCHILA</h3>
        <div class="statline"><span>Vida <b>${Math.round(st.vida)}</b></span><span>Hambre <b>${Math.round(st.hambre)}</b></span><span>Sed <b>${Math.round(st.sed)}</b></span><span>Energía <b>${Math.round(st.energia)}</b></span><span>Temp. <b>${Math.round(st.temperatura)}°C</b></span></div>
        <div class="grid">${grid}</div><div class="detail">${itemDetail(invSel)}</div></div>
      <div class="right"><h3>FABRICACIÓN</h3><div class="recipes">${recHtml}</div></div></div>`;
  }
  screens.inventario.addEventListener('click', (e) => {
    const slot = e.target.closest('.slot[data-i]');
    if (slot) { invSel = +slot.dataset.i; snd(); renderInventory(); return; }
    const c = e.target.closest('[data-craft]');
    if (c) { S.craft(c.dataset.craft); renderInventory(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) { if (e.target === screens.inventario) toggleInventory(false); return; }
    snd();
    if (a === 'usar') S.consume(invSel);
    if (a === 'equipar') { if (invSel < 9) S.select(invSel); else { S.inventory.move(invSel, S.selected); invSel = S.selected; S.select(S.selected); } }
    if (a === 'soltar') { S.inventory.drop(invSel); }
    renderInventory();
  });
  screens.inventario.addEventListener('dblclick', (e) => { const slot = e.target.closest('.slot[data-i]'); if (slot) { S.consume(+slot.dataset.i); renderInventory(); } });
  screens.inventario.addEventListener('contextmenu', (e) => { e.preventDefault(); const slot = e.target.closest('.slot[data-i]'); if (slot) { S.consume(+slot.dataset.i); renderInventory(); } });
  screens.inventario.addEventListener('dragstart', (e) => { const s = e.target.closest('.slot[data-i]'); if (!s) return; dragFrom = +s.dataset.i; e.dataTransfer.setData('text/plain', String(dragFrom)); e.dataTransfer.effectAllowed = 'move'; });
  screens.inventario.addEventListener('dragover', (e) => { const s = e.target.closest('.slot[data-i]'); if (s) { e.preventDefault(); s.classList.add('over'); } });
  screens.inventario.addEventListener('dragleave', (e) => { e.target.closest?.('.slot')?.classList.remove('over'); });
  screens.inventario.addEventListener('drop', (e) => { const s = e.target.closest('.slot[data-i]'); if (!s) return; e.preventDefault(); S.inventory.move(dragFrom, +s.dataset.i); invSel = +s.dataset.i; renderInventory(); snd(); });

  function toggleInventory(force) {
    const open = force ?? openPanel !== 'inventario';
    if (open) {
      if (ctx.state !== 'playing') return;
      renderInventory(); showScreen('inventario'); unlock(); snd('ui_open');
    } else { closeScreens(); lock(); snd('ui_close'); }
  }

  // ---- mapa
  screens.mapa = el(`<div class="panel map"><canvas width="640" height="640"></canvas><div class="legend"><span>Norte ↑</span><span>● Tú &nbsp; ▲ Fogata</span><span>M para cerrar</span></div></div>`, 'screen dim hide');
  let mapBase = null;
  function buildMapBase() {
    const N = 320, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    const half = ctx.world.size * 0.56, step = (half * 2) / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -half + (i + 0.5) * step, z = -half + (j + 0.5) * step;
      const h = ctx.world.getHeight(x, z);
      const hx = ctx.world.getHeight(x + step, z) - h, hz = ctx.world.getHeight(x, z + step) - h;
      const shade = Math.max(0.55, Math.min(1.35, 1 + (-hx * 0.9 - hz * 0.6) * 0.18));
      let r, gC, b;
      if (h < -25) [r, gC, b] = [12, 40, 70]; else if (h < -4) [r, gC, b] = [22, 78, 110]; else if (h < 0) [r, gC, b] = [48, 124, 150];
      else if (h < 2.2) [r, gC, b] = [214, 196, 140]; else if (h < 40) [r, gC, b] = [58, 118, 56]; else if (h < 70) [r, gC, b] = [92, 108, 62];
      else if (h < 125) [r, gC, b] = [122, 116, 104]; else [r, gC, b] = [236, 240, 244];
      const k = h < 0 ? 1 : shade, o = (j * N + i) * 4;
      img.data[o] = Math.min(255, r * k); img.data[o + 1] = Math.min(255, gC * k); img.data[o + 2] = Math.min(255, b * k); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    mapBase = { c, half };
  }
  function drawMap() {
    if (!mapBase) buildMapBase();
    const cv = $('canvas', screens.mapa), g = cv.getContext('2d'), W = cv.width;
    g.imageSmoothingEnabled = true; g.drawImage(mapBase.c, 0, 0, W, W);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo((i * W) / 8, 0); g.lineTo((i * W) / 8, W); g.moveTo(0, (i * W) / 8); g.lineTo(W, (i * W) / 8); g.stroke(); }
    const toXY = (x, z) => [((x + mapBase.half) / (mapBase.half * 2)) * W, ((z + mapBase.half) / (mapBase.half * 2)) * W];
    g.fillStyle = '#ffb84a';
    for (const f of S.fires?.() ?? []) { const [px, py] = toXY(f.x, f.z); g.beginPath(); g.moveTo(px, py - 8); g.lineTo(px + 7, py + 6); g.lineTo(px - 7, py + 6); g.closePath(); g.fill(); }
    const p = ctx.player.position, [px, py] = toXY(p.x, p.z);
    g.save(); g.translate(px, py); g.rotate(-ctx.player.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9); g.closePath(); g.stroke(); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '600 14px sans-serif'; g.fillText('N', W / 2 - 4, 18);
  }
  function toggleMap(force) {
    const open = force ?? openPanel !== 'mapa';
    if (open) { if (ctx.state !== 'playing') return; drawMap(); showScreen('mapa'); unlock(); snd('ui_open'); }
    else { closeScreens(); lock(); snd('ui_close'); }
  }

  for (const s of Object.values(screens)) root.append(s);

  // ------------------------------------------------------------------ entrada y estados
  let lastPause = 0;
  ctx.events.on('input:action', ({ action, pressed }) => {
    if (!pressed) return;
    if (action === 'pausa') {
      const now = performance.now(); if (now - lastPause < 300) return; lastPause = now;
      if (ctx.state === 'dead' || ctx.state === 'menu' || ctx.state === 'loading') return;
      if (openPanel === 'inventario' || openPanel === 'mapa') { closeScreens(); return; }
      if (ctx.state === 'playing') { ctx.setState('paused'); showScreen('pausa'); }
      else if (ctx.state === 'paused') { if (openPanel === 'ajustes' || openPanel === 'controles') showScreen('pausa'); else resume(); }
    }
    if (action === 'inventario') { if (ctx.state === 'playing') toggleInventory(); }
    if (action === 'mapa') { if (ctx.state === 'playing') toggleMap(); }
  });
  ctx.events.on('state', ({ state }) => {
    hud.classList.toggle('on', state === 'playing' || state === 'paused' || state === 'dead');
    if (state === 'menu') {
      screens.menu.querySelector('[data-a="continuar"]').classList.toggle('hide', !S.hasSave());
      screens.menu.querySelector('[data-a="nueva"]').textContent = S.hasSave() ? 'Nueva partida' : 'Jugar';
      showScreen('menu');
    }
    if (state === 'dead') { showScreen('muerte'); void lastCause; }
    if (state === 'playing' && (openPanel === 'muerte' || !openPanel)) closeScreens();
    refreshBlock();
  });
  ui.showMenu = () => { ctx.setState('menu'); };
  ui.hideMenu = () => closeScreens();
  ctx.events.on('player:respawn', () => closeScreens());
  window.addEventListener('keydown', (e) => { if (e.code === 'Tab') e.preventDefault(); });
  window.addEventListener('contextmenu', (e) => { if (ctx.state === 'playing') e.preventDefault(); });

  applySettings(); syncSettingsUI();

  // estado inicial (el evento 'state' ya pudo emitirse antes de crear la UI)
  const st0 = ctx.state;
  if (st0 === 'menu' || st0 === 'loading') { /* lo gestiona el evento 'state' */ }
  hud.classList.toggle('on', st0 === 'playing');

  // ------------------------------------------------------------------ bucle
  let clockT = 0, fpsAcc = 0, fpsN = 0, lowSed = 0;
  const lastTxt = { temp: '' };
  return {
    name: 'ui',
    update(dt) {
      // barras
      const st = S.stats;
      for (const k of ['vida', 'hambre', 'sed', 'energia', 'oxigeno']) {
        const b = bars[k], v = Math.round(st[k]);
        if (v !== b.last) { b.last = v; b.fill.style.width = `${v}%`; b.val.textContent = v; b.root.classList.toggle('low', v < 20 && k !== 'oxigeno'); }
      }
      bars.oxigeno.root.classList.toggle('hide', st.oxigeno >= 99.5);
      const tt = Math.round(st.temperatura);
      const label = tt < 8 ? 'helado' : tt < 15 ? 'frío' : tt < 30 ? 'templado' : tt < 37 ? 'caluroso' : 'sofocante';
      const tx = `${tt}|${label}`;
      if (tx !== lastTxt.temp) { lastTxt.temp = tx; $('b', tempEl).textContent = `${tt}°C`; $('.tl', tempEl).textContent = label; tempEl.style.color = tt < 10 ? '#7fc3ff' : tt > 36 ? '#ff9a6a' : ''; }
      dmgEl.classList.toggle('low', st.vida < 28 && ctx.state === 'playing');
      lowSed += dt; void lowSed;
      // barra rápida
      if (hotbarDirty || S.selected !== lastSel) renderHotbar();
      if (nameTimer > 0) { nameTimer -= dt; if (nameTimer <= 0) slotNameEl.classList.remove('on'); }
      // brújula
      const heading = ((-ctx.player.yaw * 180) / Math.PI % 360 + 360) % 360;
      compassTrack.style.transform = `translateX(${210 - (heading + 360) * PPD}px)`;
      // reloj
      clockT -= ctx.time.realDt; if (clockT <= 0) {
        clockT = 0.5;
        const h = ctx.time.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
        const dia = Math.floor(ctx.time.elapsed / ctx.config.time.dayLengthSec) + 1;
        clockEl.innerHTML = `<b>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</b> &nbsp;·&nbsp; DÍA ${dia}`;
      }
      updateGoal(ctx.time.realDt);
      if (cfg.fps) { fpsAcc += ctx.time.realDt; fpsN++; if (fpsAcc > 0.5) { fpsBox.textContent = `${Math.round(fpsN / fpsAcc)} FPS`; fpsAcc = 0; fpsN = 0; } }
    },
  };
}
