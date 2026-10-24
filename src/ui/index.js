// Módulo UI: HUD, barra rápida, inventario/fabricación, mapa, menú principal, pausa, muerte y ajustes. Todo el texto en español.
import { ITEMS, TIPOS as TIPOS_ITEM, RANURAS, RANURA_NOMBRE, CALIDADES, HABILIDADES, NIVEL_XP } from '../core/items.js';
import { CSS } from './style.js';
import { iconUrl, STAT_SVG } from './icons.js';
import { createAnimalPanel } from './animal.js';

const SETTINGS_KEY = 'isla-primordial:ajustes:v1';
const TIPOS = TIPOS_ITEM;
const HERR = { corta: 'algo que corte', perfora: 'un punzón', talar: 'un hacha', picar: 'un pico', martillar: 'un martillo' };
const FILTROS = [['todo', 'Todo'], ['herramienta', 'Herramientas'], ['arma', 'Armas'], ['municion', 'Munición'], ['ropa', 'Ropa'], ['aparejo', 'Equipo animal'], ['otros', 'Otros']];
const NOMBRE_CAL = ['Tosca', 'Normal', 'Buena', 'Excelente'];
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
    <div class="compass"><div class="track"></div><div class="pins"></div></div><div class="compass-mark" style="left:50%;top:14px;margin-left:0"></div>
    <div class="alerts"></div>
    <div class="clock"></div>
    <div class="goal panel"><h4>OBJETIVO</h4><p></p><div class="pg"><i></i></div></div>
    <div class="notifs"></div>
    <div class="cross"></div>
    <div class="target"><div class="tn"></div><div class="tr"></div><div class="ta"></div><div class="tb"><i></i></div></div>
    <div class="ride"></div>
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
  const rideEl = $('.ride', hud);
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

  // alertas de fauna: marcas en la brújula + lista con flecha relativa, distancia aproximada y confianza
  const pinsEl = $('.compass .pins', hud), alertsEl = $('.alerts', hud);
  const alertas = []; // { key, tipo, rumbo, dist, conf, t, chip, pin, arr }
  const ALERT_TXT = { jugador: 'Te han detectado', amenaza: 'Amenaza', llamada: 'Llamada de alerta', advertencia: 'Advertencia' };
  const ALERT_ICO = { jugador: '👁', amenaza: '⚠', llamada: '♪', advertencia: '!' };
  const ALERT_TTL = { jugador: 7, amenaza: 7, llamada: 5, advertencia: 4 };
  ctx.events.on('fauna:alerta', (a) => {
    if (ctx.state !== 'playing') return;
    const key = `${a.especie}|${a.tipo}`;
    let al = alertas.find((x) => x.key === key);
    if (!al) {
      al = { key, chip: el('', `al ${a.tipo}`), pin: el(ALERT_ICO[a.tipo] ?? '!', `pin ${a.tipo}`), arr: null };
      al.chip.innerHTML = '<i class="arr">▲</i><span class="tx"></span><span class="dd"></span><span class="cf"></span>';
      al.arr = $('.arr', al.chip);
      alertsEl.append(al.chip); pinsEl.append(al.pin); alertas.push(al);
      while (alertas.length > 4) { const o = alertas.shift(); o.chip.remove(); o.pin.remove(); }
    }
    al.tipo = a.tipo; al.rumbo = a.rumbo; al.dist = a.dist; al.conf = a.conf; al.t = ALERT_TTL[a.tipo] ?? 5;
    const causa = a.causa ? ` · ${a.causa}` : '';
    $('.tx', al.chip).innerHTML = `<b>${a.nombre ?? a.especie}</b> ${ALERT_TXT[a.tipo] ?? ''}${causa}`;
    $('.dd', al.chip).textContent = `~${Math.max(5, Math.round(a.dist / 5) * 5)} m`;
    const pips = a.conf > 0.66 ? 3 : a.conf > 0.33 ? 2 : 1;
    $('.cf', al.chip).textContent = '●'.repeat(pips) + '○'.repeat(3 - pips);
    al.chip.classList.remove('out'); al.chip.classList.remove('flash'); void al.chip.offsetWidth; al.chip.classList.add('flash');
    if (a.tipo === 'jugador' || a.tipo === 'amenaza') snd('ui_click');
  });
  function updateAlertas(dt, heading) {
    for (let i = alertas.length - 1; i >= 0; i--) {
      const al = alertas[i];
      al.t -= dt;
      if (al.t <= 0 || ctx.state !== 'playing') { al.chip.remove(); al.pin.remove(); alertas.splice(i, 1); continue; }
      let rel = ((al.rumbo - heading) % 360 + 540) % 360 - 180;
      al.arr.style.transform = `rotate(${rel.toFixed(0)}deg)`;
      const x = 210 + rel * PPD, vis = Math.abs(rel * PPD) < 200;
      al.pin.style.transform = `translateX(${x.toFixed(1)}px) translateX(-50%)`;
      al.pin.style.opacity = vis ? String(Math.min(1, 0.35 + al.conf * 0.65) * Math.min(1, al.t / 1.2)) : '0';
      al.chip.classList.toggle('out', al.t < 0.8);
    }
  }

  // objetos con estado: barra de durabilidad y borde de calidad
  const durFrac = (s) => (s?.dur != null ? Math.max(0, Math.min(1, s.dur / Math.max(1, S.durMaxDe(s.item, s.cal ?? 1, s.rep ?? 0)))) : null);
  const barraDur = (s) => { const f = durFrac(s); return f == null ? '' : `<i class="db ${f < 0.15 ? 'bad' : f < 0.4 ? 'low' : ''}" style="width:${Math.round(f * 100)}%"></i>`; };
  const calClase = (s) => (s.dur != null ? `q${s.cal ?? 1}` : '');

  // barra rápida
  let hotbarDirty = true, lastSel = -1, nameTimer = 0;
  function renderHotbar() {
    hotbarDirty = false;
    let h = '';
    for (let i = 0; i < 9; i++) {
      const s = S.slots[i];
      h += `<div class="slot ${i === S.selected ? 'sel' : ''} ${s ? calClase(s) : ''}"><span class="n">${i + 1}</span>${s ? `<img src="${iconUrl(s.item)}" alt="">${s.cantidad > 1 ? `<span class="c">${s.cantidad}</span>` : ''}${barraDur(s)}` : ''}</div>`;
    }
    hotbarEl.innerHTML = h;
    const sel = S.slots[S.selected];
    if (S.selected !== lastSel) { lastSel = S.selected; if (sel) { slotNameEl.textContent = ITEMS[sel.item].nombre; slotNameEl.classList.add('on'); nameTimer = 1.8; } }
    let hint = '';
    if (sel) {
      const it = ITEMS[sel.item];
      if (it.tipo === 'comida') hint = `<span class="key">F</span>${it.verbo ?? 'Comer'} ${it.nombre.toLowerCase()}`;
      else if (it.tipo === 'bebida') hint = `<span class="key">F</span>Beber`;
      else if (it.tipo === 'colocable') hint = `<span class="key">F</span>Colocar ${it.nombre.toLowerCase()}`;
      else if (it.tipo === 'ropa') hint = `<span class="key">F</span>Vestir ${it.nombre.toLowerCase()}`;
      else if (it.distancia && it.municion && S.municion(it.municion) < 0) hint = `<span style="color:var(--bad)">Sin ${it.municion === 'flecha' ? 'flechas' : 'guijarros'}</span>`;
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

  // aprendizaje y oficios
  ctx.events.on('saber:aprendido', ({ nombre }) => { notify(`Aprendiste a fabricar: ${nombre}`, 'ok'); snd('ui_open'); if (openPanel === 'inventario') renderInventory(); });
  ctx.events.on('saber:nivel', ({ nombre, nivel }) => { notify(`${nombre}: nivel ${nivel}`, 'ok'); });
  ctx.events.on('crafted', ({ item, cal, cantidad }) => { if (ITEMS[item]?.dur && cal !== 1) notify(`Fabricaste ${ITEMS[item].nombre} (${NOMBRE_CAL[cal]})`, cal > 1 ? 'ok' : 'warn'); });

  // objetivo apuntado
  ctx.events.on('player:target', (t) => {
    if (!t) { targetEl.classList.remove('on'); crossEl.classList.remove('on'); return; }
    $('.tn', targetEl).textContent = t.nombre ?? '';
    const gestos = ['Talar', 'Picar', 'Atacar'];
    const accion = t.accion ?? '';
    const rl = t.rel;
    // criaturas con trato posible: nivel de relación, habituación/confianza y la acción de la tecla E
    $('.tr', targetEl).innerHTML = rl ? `<span class="nv n${rl.nivel}">Nivel ${rl.nivel} · ${rl.nivelNombre}</span>${rl.max > 0 && !rl.propio ? `<span class="mt">Habituación ${Math.round(Math.min(1, rl.hab) * 100)} %${rl.hab >= 1 ? ` · Confianza ${Math.round(rl.conf * 100)} %` : ''}</span>` : ''}` : '';
    $('.ta', targetEl).innerHTML = (accion ? `<span class="key">${gestos.includes(accion) ? 'Clic' : 'E'}</span>${accion}` : '') + (rl?.accionE ? ` &nbsp; <span class="key">E</span>${rl.accionE}` : '') + (rl?.montable ? ' &nbsp; <span class="key">G</span>Montar' : '');
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
    <span><span class="key">E</span></span><span>Interactuar, recoger, beber; con un animal: ofrecer comida, cabestro o abrir su panel</span>
    <span><span class="key">G</span></span><span>Montar / desmontar un animal domesticado con montura</span>
    <span><span class="key">Mayús</span> montado</span><span>Galope (W trote, S frena, A/D desvían)</span>
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
  let invSel = 0, dragFrom = -1, recFiltro = 'todo', soloPosibles = false, verPistas = false;
  const kg = (n) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} kg`;
  const lt = (n) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} L`;
  const stackDe = (sel) => (typeof sel === 'string' ? S.equipo[sel.slice(3)] : S.slots[sel]);

  function itemDetail(sel) {
    const s = stackDe(sel);
    if (!s) return '<div class="dd">Casilla vacía. Arrastra objetos para organizarlos; las 9 primeras forman tu barra rápida.</div>';
    const it = ITEMS[s.item], puesto = typeof sel === 'string';
    const fx = [];
    if (it.comida) fx.push(`+${it.comida} hambre`); if (it.sed) fx.push(`+${it.sed} sed`); if (it.vida) fx.push(`${it.vida > 0 ? '+' : ''}${it.vida} vida`);
    const q = CALIDADES[s.cal ?? 1].mult;
    if (it.dano && it.tipo !== 'municion') fx.push(`${Math.round(it.dano * (it.dur ? q : 1))} de daño`); if (it.tipo === 'municion') fx.push(`${it.dano} de daño al impacto`);
    if (it.talar) fx.push('tala árboles'); if (it.picar) fx.push('rompe rocas'); if (it.alcance && !it.distancia) fx.push(`alcance ${it.alcance} m`);
    if (it.etiquetas?.includes('corta')) fx.push('corta y despieza');
    if (it.penetra) fx.push(`penetra ${Math.round(it.penetra * 100)} % de coraza`); if (it.aturde) fx.push(`aturde ${Math.round(it.aturde * 100)} %`);
    if (it.distancia) fx.push(it.municion ? `dispara ${it.municion === 'flecha' ? 'flechas' : 'guijarros'}` : 'se arroja');
    if (it.armadura) fx.push(`armadura ${Math.round(it.armadura * q * 10) / 10}`); if (it.abrigo) fx.push(`abrigo +${Math.round(it.abrigo * q * 10) / 10}`);
    if (it.ranura) fx.push(`ranura: ${RANURA_NOMBRE[it.ranura]}`); if (it.ruido && it.ruido !== 1) fx.push(it.ruido > 1 ? 'hace ruido al moverte' : 'te vuelve silencioso');
    if (it.aparejo) { const a = it.aparejo; fx.push(`equipo animal: ${a.ranura}`); if (a.monta) fx.push(`montura ${a.monta}`); if (a.carga) fx.push(`carga ${a.carga.peso} kg / ${a.carga.vol} L`); if (a.armadura) fx.push(`−${Math.round(a.armadura * 100)} % de daño al animal`); if (a.manejo) fx.push('se coloca ofreciéndole comida a un animal confiado y pulsando E'); else fx.push('se coloca desde el panel de un animal domesticado (E sobre él)'); }
    if (it.impermeable) fx.push('impermeable'); if (it.capacidad) fx.push(`+${it.capacidad} kg y +${it.volumen} L de carga`);
    const f = durFrac(s), estado = f != null ? S.estadoDe(s) : null;
    const durHtml = f != null ? `<div class="durl"><span>${estado}${(s.rep ?? 0) ? ` · remendado ×${s.rep}` : ''}</span><span class="bar"><i class="${f < 0.15 ? 'bad' : f < 0.4 ? 'low' : ''}" style="width:${Math.round(f * 100)}%"></i></span><span>${Math.max(0, Math.round(s.dur))}/${S.durMaxDe(s.item, s.cal ?? 1, s.rep ?? 0)}</span></div>` : '';
    const peso = `<div class="pv">${kg(it.peso)} · ${lt(it.vol)} por unidad${s.cantidad > 1 ? ` (${kg(it.peso * s.cantidad)} en total)` : ''}</div>`;
    const usable = it.tipo === 'comida' || it.tipo === 'bebida' || it.tipo === 'colocable';
    const tool = it.tipo === 'herramienta' || it.tipo === 'arma';
    const calHtml = it.dur ? ` <span class="cal q${s.cal ?? 1}">${NOMBRE_CAL[s.cal ?? 1]}</span>` : '';
    let rep = '';
    if (!puesto && f != null && it.reparar) {
      const falta = Object.entries(it.reparar).map(([m, n]) => { const have = S.inventory.count(m); return `<span class="${have >= n ? '' : 'no'}">${ITEMS[m].nombre} ${Math.min(have, 99)}/${n}</span>`; }).join('');
      const max = (s.rep ?? 0) >= 4;
      rep = `<div class="repl">Reparar: ${falta}${max ? ' <span class="no">demasiado remendado</span>' : ''}</div>`;
    }
    const acts = puesto
      ? `<button class="btn sm" data-a="quitar">Quitar</button>`
      : `${usable ? `<button class="btn sm" data-a="usar">${it.tipo === 'comida' ? (it.verbo ?? 'Comer') : it.tipo === 'bebida' ? 'Beber' : 'Colocar'}</button>` : ''}${it.tipo === 'ropa' ? `<button class="btn sm" data-a="vestir">Vestir</button>` : ''}${tool ? `<button class="btn sm" data-a="equipar">Equipar</button>` : ''}${f != null && it.reparar ? `<button class="btn sm" data-a="reparar" ${f > 0.95 || (s.rep ?? 0) >= 4 ? 'disabled' : ''}>Reparar</button>` : ''}<button class="btn sm" data-a="soltar">Soltar</button>`;
    return `<div class="dt">${TIPOS[it.tipo] ?? it.tipo}${puesto ? ' · puesto' : ''}</div><div class="dn">${it.nombre}${s.cantidad > 1 ? ` ×${s.cantidad}` : ''}${calHtml}</div>
      <div class="dd">${it.descripcion}${fx.length ? `<br><span style="color:var(--acc2)">${fx.join(' · ')}</span>` : ''}</div>${durHtml}${peso}${rep}
      <div class="acts">${acts}</div>`;
  }

  function cargaHtml() {
    const w = S.inventory.peso(), v = S.inventory.volumen(), cap = S.inventory.capacidad();
    const pw = w / cap.peso, pv = v / cap.volumen;
    const cls = (r) => (r > 1 ? 'bad' : r > 0.85 ? 'low' : '');
    return `<div class="carga"><div><span>Peso <b>${kg(w)}</b> / ${kg(cap.peso)}${pw > 1 ? ' · vas lento' : ''}</span><span class="bar"><i class="${cls(pw)}" style="width:${Math.min(100, Math.round(pw * 100))}%"></i></span></div>
      <div><span>Volumen <b>${lt(v)}</b> / ${lt(cap.volumen)}</span><span class="bar"><i class="${cls(pv)}" style="width:${Math.min(100, Math.round(pv * 100))}%"></i></span></div></div>`;
  }
  function equipoHtml() {
    return `<div class="equipo">${RANURAS.map((r) => {
      const e = S.equipo[r];
      return `<div class="eq"><div class="slot ${e ? calClase(e) : ''} ${invSel === `eq:${r}` ? 'sel' : ''}" data-eq="${r}" title="${e ? ITEMS[e.item].nombre : RANURA_NOMBRE[r]}">${e ? `<img src="${iconUrl(e.item)}" alt="">${barraDur(e)}` : `<span class="ph">${RANURA_NOMBRE[r].slice(0, 3)}</span>`}</div><span>${RANURA_NOMBRE[r]}</span></div>`;
    }).join('')}<div class="eqs"><span>Armadura <b>${Math.round(S.armadura() * 10) / 10}</b></span><span>Abrigo <b>+${Math.round(S.abrigo() * 10) / 10}</b></span></div></div>`;
  }
  function oficiosHtml() {
    return `<div class="oficios">${Object.entries(HABILIDADES).map(([k, h]) => {
      const xp = S.saber.xp[k], n = S.saber.nivel(k), a = NIVEL_XP[n], b = NIVEL_XP[n + 1];
      const pct = b == null ? 100 : Math.round(((xp - a) / (b - a)) * 100);
      return `<div class="of" title="${h.desc}"><span>${h.nombre.split(' y ')[0]} <b>${n}</b></span><span class="bar"><i style="width:${pct}%"></i></span></div>`;
    }).join('')}</div>`;
  }
  const catDe = (r) => { const t = ITEMS[r.id].tipo; return t === 'herramienta' || t === 'arma' || t === 'municion' || t === 'ropa' || t === 'aparejo' ? t : 'otros'; };

  function recetaHtml(r) {
    const costs = Object.entries(r.costo).map(([id, n]) => { const have = S.inventory.count(id); return `<span class="${have >= n ? '' : 'no'}">${ITEMS[id].nombre} ${Math.min(have, 999)}/${n}</span>`; }).join('');
    const reqs = [];
    if (r.herramienta) reqs.push(`<span class="${r.herramientaOk ? '' : 'no'}">${r.herramientaOk ? '✓' : '✗'} ${(HERR[r.herramienta] ?? r.herramienta).replace(/^./, (m) => m.toUpperCase())}</span>`);
    if (r.hab.nivel > 0) reqs.push(`<span class="${r.nivelOk ? '' : 'no'}">${r.nivelOk ? '✓' : '✗'} ${HABILIDADES[r.hab.tipo].nombre.split(' y ')[0]} nivel ${r.hab.nivel}</span>`);
    if (r.estacion) reqs.push(`<span class="${r.estacionOk ? '' : 'no'}">${r.estacionOk ? '✓' : '✗'} Fogata encendida cerca</span>`);
    const it = ITEMS[r.id];
    const sub = [it.dano ? `${it.dano} daño` : '', it.armadura ? `armadura ${it.armadura}` : '', it.abrigo ? `abrigo +${it.abrigo}` : ''].filter(Boolean).join(' · ');
    return `<div class="rec ${r.posible ? 'ok' : ''}"><img src="${iconUrl(r.id)}" alt=""><div><div class="rn">${r.nombre}${r.cantidad > 1 ? ` ×${r.cantidad}` : ''}${r.variante ? ` <small>(${r.variante})</small>` : ''}</div>${sub ? `<div class="rs">${sub}</div>` : ''}<div class="rc">${costs}</div>${reqs.length ? `<div class="rq">${reqs.join('')}</div>` : ''}</div><button class="btn sm" data-craft="${r.clave}" ${r.posible ? '' : 'disabled'}>Fabricar</button></div>`;
  }

  function renderInventory() {
    const st = S.stats;
    let grid = '';
    for (let i = 0; i < S.slots.length; i++) {
      const s = S.slots[i];
      grid += `<div class="slot ${i < 9 ? 'hb' : ''} ${i === invSel ? 'sel' : ''} ${s ? calClase(s) : ''}" draggable="true" data-i="${i}">${i < 9 ? `<span class="n">${i + 1}</span>` : ''}${s ? `<img src="${iconUrl(s.item)}" alt="">${s.cantidad > 1 ? `<span class="c">${s.cantidad}</span>` : ''}${barraDur(s)}` : ''}</div>`;
    }
    const todas = S.recipes.map((r) => S.recipeInfo(r));
    const conocidas = todas.filter((r) => r.conocida && (recFiltro === 'todo' || catDe(r) === recFiltro) && (!soloPosibles || r.posible)).sort((a, b) => Number(b.posible) - Number(a.posible));
    const ocultas = todas.filter((r) => !r.conocida);
    const recHtml = conocidas.map(recetaHtml).join('') || '<div class="vacio">Nada que mostrar con este filtro.</div>';
    const pistas = verPistas ? ocultas.filter((r) => r.pista).map((r) => `<div class="pista">${r.pista}</div>`).join('') : '';
    const tabs = FILTROS.map(([k, n]) => `<button class="tab ${k === recFiltro ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
    screens.inventario.innerHTML = `<div class="panel inv">
      <div class="left"><h3>MOCHILA</h3>
        <div class="statline"><span>Vida <b>${Math.round(st.vida)}</b></span><span>Hambre <b>${Math.round(st.hambre)}</b></span><span>Sed <b>${Math.round(st.sed)}</b></span><span>Energía <b>${Math.round(st.energia)}</b></span><span>Temp. <b>${Math.round(st.temperatura)}°C</b></span></div>
        ${equipoHtml()}${cargaHtml()}
        <div class="grid">${grid}</div><div class="detail">${itemDetail(invSel)}</div></div>
      <div class="right"><h3>FABRICACIÓN</h3>${oficiosHtml()}
        <div class="tabs">${tabs}<label class="chk"><input type="checkbox" data-posibles ${soloPosibles ? 'checked' : ''}> solo posibles</label></div>
        <div class="recipes">${recHtml}
          <div class="ocultas"><button class="btn sm" data-pistas>${verPistas ? 'Ocultar pistas' : `${ocultas.length} recetas por descubrir · ver pistas`}</button>${pistas}</div></div></div></div>`;
  }
  screens.inventario.addEventListener('click', (e) => {
    const slot = e.target.closest('.slot[data-i]');
    if (slot) { invSel = +slot.dataset.i; snd(); renderInventory(); return; }
    const eq = e.target.closest('[data-eq]');
    if (eq) { invSel = `eq:${eq.dataset.eq}`; snd(); renderInventory(); return; }
    const f = e.target.closest('[data-f]');
    if (f) { recFiltro = f.dataset.f; snd(); renderInventory(); return; }
    if (e.target.closest('[data-pistas]')) { verPistas = !verPistas; snd(); renderInventory(); return; }
    if (e.target.matches('[data-posibles]')) { soloPosibles = e.target.checked; renderInventory(); return; }
    const c = e.target.closest('[data-craft]');
    if (c) { S.craft(c.dataset.craft); renderInventory(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) { if (e.target === screens.inventario) toggleInventory(false); return; }
    snd();
    if (a === 'quitar') { if (S.desequipar(invSel.slice(3))) invSel = 0; }
    else if (typeof invSel === 'number') {
      if (a === 'usar') S.consume(invSel);
      if (a === 'vestir') S.equipar(invSel);
      if (a === 'reparar') S.reparar(invSel);
      if (a === 'equipar') { if (invSel < 9) S.select(invSel); else { S.inventory.move(invSel, S.selected); invSel = S.selected; S.select(S.selected); } }
      if (a === 'soltar') { S.inventory.drop(invSel); }
    }
    if (typeof invSel === 'string' && !S.equipo[invSel.slice(3)]) invSel = 0;
    renderInventory();
  });
  screens.inventario.addEventListener('dblclick', (e) => { const slot = e.target.closest('.slot[data-i]'); if (slot) { S.consume(+slot.dataset.i); renderInventory(); } const eq = e.target.closest('[data-eq]'); if (eq) { S.desequipar(eq.dataset.eq); invSel = 0; renderInventory(); } });
  screens.inventario.addEventListener('contextmenu', (e) => { e.preventDefault(); const slot = e.target.closest('.slot[data-i]'); if (slot) { S.consume(+slot.dataset.i); renderInventory(); } });
  screens.inventario.addEventListener('dragstart', (e) => { const s = e.target.closest('.slot[data-i]'); if (!s) return; dragFrom = +s.dataset.i; e.dataTransfer.setData('text/plain', String(dragFrom)); e.dataTransfer.effectAllowed = 'move'; });
  screens.inventario.addEventListener('dragover', (e) => { const s = e.target.closest('.slot[data-i]'); if (s) { e.preventDefault(); s.classList.add('over'); } });
  screens.inventario.addEventListener('dragleave', (e) => { e.target.closest?.('.slot')?.classList.remove('over'); });
  screens.inventario.addEventListener('drop', (e) => { const s = e.target.closest('.slot[data-i]'); if (!s) return; e.preventDefault(); S.inventory.move(dragFrom, +s.dataset.i); invSel = +s.dataset.i; renderInventory(); snd(); });
  ctx.events.on('equipo:cambio', () => { if (openPanel === 'inventario') renderInventory(); });

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

  // ---- panel de animal propio
  const animal = createAnimalPanel(ctx, { el, showScreen, closeScreens, unlock, lock, snd });
  screens.animal = animal.screen;
  ui.abrirAnimal = (c) => animal.abrir(c);
  for (const ev of ['fauna:ofrenda', 'fauna:manejo', 'fauna:equipado', 'fauna:orden', 'fauna:domesticada', 'fauna:vinculo_perdido', 'fauna:liberada']) ctx.events.on(ev, () => { if (openPanel === 'animal') animal.render(); });
  ctx.events.on('inventory:changed', () => { if (openPanel === 'animal') animal.render(); });
  ctx.events.on('fauna:habituada', ({ nombre }) => { notify(`${nombre} se ha habituado a tu presencia`, 'ok'); snd('ui_open'); });
  ctx.events.on('saber:nivel', ({ hab, nombre, nivel }) => { void hab; void nombre; void nivel; });

  for (const s of Object.values(screens)) root.append(s);

  // ------------------------------------------------------------------ entrada y estados
  let lastPause = 0;
  ctx.events.on('input:action', ({ action, pressed }) => {
    if (!pressed) return;
    if (action === 'pausa') {
      const now = performance.now(); if (now - lastPause < 300) return; lastPause = now;
      if (ctx.state === 'dead' || ctx.state === 'menu' || ctx.state === 'loading') return;
      if (openPanel === 'animal') { animal.cerrar(); return; }
      if (openPanel === 'inventario' || openPanel === 'mapa') { closeScreens(); return; }
      if (ctx.state === 'playing') { ctx.setState('paused'); showScreen('pausa'); }
      else if (ctx.state === 'paused') { if (openPanel === 'ajustes' || openPanel === 'controles') showScreen('pausa'); else resume(); }
    }
    if (action === 'interactuar' && openPanel === 'animal') { animal.cerrar(); return; }
    if (action === 'inventario') { if (openPanel === 'animal') { animal.cerrar(); return; } if (ctx.state === 'playing') toggleInventory(); }
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
      updateAlertas(ctx.time.realDt, heading);
      // reloj
      clockT -= ctx.time.realDt; if (clockT <= 0) {
        clockT = 0.5;
        const h = ctx.time.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
        const dia = Math.floor(ctx.time.elapsed / ctx.config.time.dayLengthSec) + 1;
        clockEl.innerHTML = `<b>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</b> &nbsp;·&nbsp; DÍA ${dia}`;
      }
      updateGoal(ctx.time.realDt);
      animal.vigilar();
      const mc = ctx.player.montura;
      const rtxt = mc ? `<span class="key">G</span>Desmontar &nbsp; <span class="key">W</span>trote &nbsp; <span class="key">Mayús</span>galope (energía ${Math.round(mc.energia * 100)} %) &nbsp; <span class="key">S</span>frena` : '';
      if (rideEl.dataset.h !== rtxt) { rideEl.dataset.h = rtxt; rideEl.innerHTML = rtxt; rideEl.classList.toggle('on', !!rtxt); }
      if (cfg.fps) { fpsAcc += ctx.time.realDt; fpsN++; if (fpsAcc > 0.5) { fpsBox.textContent = `${Math.round(fpsN / fpsAcc)} FPS`; fpsAcc = 0; fpsN = 0; } }
    },
  };
}
