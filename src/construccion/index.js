// Módulo CONSTRUCCIÓN: piezas colocables (cama, refugio, cestas, cofres y vasijas) con vista previa verde/roja, giro y validación del
// terreno; colisiones con el jugador y las criaturas; interacción (E) y desmontaje (X); contenedores con casillas; consultas de refugio
// (techo) y de camas; guardado. La construcción modular (cimientos, paredes, techos…) se apoya en este mismo módulo.
import * as THREE from 'three';
import { ITEMS } from '../core/items.js';
import { PIEZAS, materiales, construirMalla } from './piezas.js';

const PASO_GIRO = Math.PI / 12; // 15°
const ALCANCE = 6; // m desde el jugador

export async function create(ctx) {
  const world = ctx.world;
  const raiz = new THREE.Group(); raiz.name = 'construccion'; ctx.scene.add(raiz);
  const M = materiales(ctx.flora?.texturas ?? null, (m) => ctx.lighting?.setupMaterial?.(m));
  const piezas = []; // { id, tipo, def, x, y, z, rot, inc: [pitch, roll], mesh, unreg, cols: [ids], cont: { casillas } | null }
  let nextId = 1;
  const tmp = [];
  const S = () => ctx.survival;
  const avisar = (t, tipo = 'info') => ctx.ui?.notify?.(t, tipo);

  // ------------------------------------------------------------------ geometría
  /** Punto local (lx, lz) de una pieza en (x, z) girada `rot` → coordenadas de mundo (mismo giro que rotation.y de three). */
  const aMundo = (x, z, rot, lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  const aLocal = (x, z, rot, wx, wz) => { const dx = wx - x, dz = wz - z; return [dx * Math.cos(rot) - dz * Math.sin(rot), dx * Math.sin(rot) + dz * Math.cos(rot)]; };
  const radioDe = (def) => Math.hypot(def.huella[0], def.huella[1]) / 2;

  /** ¿Se puede colocar aquí? Devuelve { ok, motivo, y, inc }. `ignorar` = pieza que se está moviendo (no choca consigo). */
  function evaluar(tipo, x, z, rot, ignorar = null) {
    const def = PIEZAS[tipo]; if (!def) return { ok: false, motivo: 'Pieza desconocida' };
    const [w, l] = def.huella, h = {};
    let lo = 1e9, hi = -1e9;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const [px, pz] = aMundo(x, z, rot, (a * w) / 2, (b * l) / 2), y = world.getHeight(px, pz);
      h[`${a},${b}`] = y;
      if (y < world.seaLevel + 0.15) return { ok: false, motivo: 'No se puede construir en el agua' };
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    const inc = [Math.atan2(h['0,1'] - h['0,-1'], l) * -1, Math.atan2(h['1,0'] - h['-1,0'], w)];
    const base = { y: h['0,0'], inc };
    if (hi - lo > def.desnivel) return { ok: false, motivo: 'El suelo es demasiado desparejo', ...base };
    const R = (Math.min(w, l) / 2) * 0.9;
    for (const c of world.colliders.query(x, z, R, tmp)) {
      if (c.owner?.pieza && c.owner.pieza === ignorar) continue;
      return { ok: false, motivo: c.kind === 'arbol' ? 'Hay un árbol en medio' : c.kind === 'roca' ? 'Hay una roca en medio' : c.owner?.pieza ? 'Choca con otra construcción' : 'Hay algo en medio', ...base };
    }
    for (const p of piezas) {
      if (p === ignorar) continue;
      if (Math.hypot(p.x - x, p.z - z) < (radioDe(p.def) + radioDe(def)) * 0.62) return { ok: false, motivo: 'Choca con otra construcción', ...base };
    }
    // las piezas sólidas no pueden quedar encima del jugador
    const pp = ctx.player.position;
    for (const c of def.colision) { const [cx, cz] = aMundo(x, z, rot, c.x, c.z); if (Math.hypot(pp.x - cx, pp.z - cz) < c.r + 0.45) return { ok: false, motivo: 'Estás en medio', ...base }; }
    if (Math.hypot(pp.x - x, pp.z - z) > ALCANCE + radioDe(def)) return { ok: false, motivo: 'Demasiado lejos', ...base };
    return { ok: true, motivo: '', ...base };
  }

  // ------------------------------------------------------------------ piezas
  function colocarMalla(p) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.set(p.inc[0], p.rot, p.inc[1], 'YXZ');
  }

  function crear(tipo, x, z, rot, extra = {}) {
    const def = PIEZAS[tipo];
    const ev = evaluar(tipo, x, z, rot); // y e inclinación del terreno (aunque no sea válido: al restaurar se respeta lo guardado)
    const p = { id: nextId++, tipo, def, x, z, y: ev.y ?? world.getHeight(x, z), rot, inc: ev.inc ?? [0, 0], mesh: construirMalla(tipo, M), cols: [], cont: null };
    p.mesh.userData.pieza = p;
    colocarMalla(p); raiz.add(p.mesh);
    p.claro = ctx.flora?.despejar?.(x, z, radioDe(def) + 0.35) ?? null; // sin hierba ni matorrales atravesando la pieza
    for (const c of def.colision) {
      const [cx, cz] = aMundo(x, z, rot, c.x, c.z);
      p.cols.push(world.colliders.addCircle(cx, cz, c.r, { height: c.h, kind: 'estructura', owner: { pieza: p } }));
    }
    if (def.contenedor) {
      p.cont = { casillas: new Array(def.contenedor.casillas).fill(null), conserva: def.contenedor.conserva };
      if (Array.isArray(extra.cont)) extra.cont.forEach((c, i) => { if (i < p.cont.casillas.length && c && ITEMS[c.item]) p.cont.casillas[i] = { ...c }; });
    }
    const centro = new THREE.Vector3(x, p.y + (tipo === 'refugio_ramas' ? 1.0 : tipo === 'cama_hojas' ? 0.35 : 0.45), z);
    p.unreg = ctx.player.registerInteractable({
      id: 'pieza', position: centro, radius: Math.max(1.6, radioDe(def) + 0.6), label: def.nombre, pieza: p,
      getPrompt: () => promptE(p),
      onInteract: () => accionE(p),
      getPromptX: () => (def.recoger ? (p.cont && p.cont.casillas.some(Boolean) ? 'Recoger (vacíala antes)' : `Recoger ${def.nombre.toLowerCase()}`) : null),
      onX: () => recoger(p),
    });
    piezas.push(p);
    return p;
  }

  function quitar(p) {
    p.unreg?.();
    if (p.claro) ctx.flora?.cerrarClaro?.(p.claro);
    for (const id of p.cols) world.colliders.remove(id);
    raiz.remove(p.mesh);
    const i = piezas.indexOf(p); if (i >= 0) piezas.splice(i, 1);
    if (api.abierto === p) api.cerrarContenedor?.();
  }

  function promptE(p) {
    if (p.def.accion === 'dormir') return ctx.survival?.descanso?.prompt?.(p) ?? 'Dormir';
    if (p.def.accion === 'abrir') { const n = p.cont.casillas.filter(Boolean).length; return `Abrir ${p.def.nombre.toLowerCase()} (${n}/${p.cont.casillas.length})`; }
    return p.def.nombre;
  }
  function accionE(p) {
    if (p.def.accion === 'dormir') { ctx.survival?.descanso?.dormir?.({ cama: p }); return; }
    if (p.def.accion === 'abrir') { api.abierto = p; ctx.events.emit('contenedor:abrir', { pieza: p }); ctx.ui?.abrirContenedor?.(p); }
  }

  function recoger(p) {
    if (!p.def.recoger) return false;
    if (p.cont && p.cont.casillas.some(Boolean)) { avisar('Vacíala antes de recogerla', 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return false; }
    quitar(p);
    const left = S()?.inventory.add(p.def.item, 1) ?? 1;
    if (left > 0) ctx.physics?.spawnProp?.('loot', new THREE.Vector3(p.x, p.y + 0.6, p.z), new THREE.Vector3(0, 2.5, 0), { item: p.def.item, cantidad: 1 });
    ctx.events.emit('construccion:recogida', { tipo: p.tipo });
    ctx.events.emit('ui:sound', { nombre: 'ui_click' });
    return true;
  }

  // ------------------------------------------------------------------ modo colocación (vista previa)
  const est = { activo: false, tipo: null, item: null, slot: -1, rot: 0, ghost: null, x: 0, z: 0, ok: false, motivo: '', ev: null };
  const fantasmaOk = new THREE.MeshBasicMaterial({ color: 0x5cff7a, transparent: true, opacity: 0.42, depthWrite: false });
  const fantasmaMal = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.42, depthWrite: false });
  const hojaOk = new THREE.MeshBasicMaterial({ color: 0x5cff7a, transparent: true, opacity: 0.42, depthWrite: false, map: M.hoja.map, alphaTest: M.hoja.alphaTest, side: THREE.DoubleSide });
  const hojaMal = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.42, depthWrite: false, map: M.hoja.map, alphaTest: M.hoja.alphaTest, side: THREE.DoubleSide });
  function pintarFantasma(ok) {
    est.ghost?.traverse((o) => { if (o.isMesh) o.material = o.userData.hoja ? (ok ? hojaOk : hojaMal) : (ok ? fantasmaOk : fantasmaMal); });
  }
  let ultimoEstado = '';
  function emitir() {
    const clave = `${est.activo}|${est.ok}|${est.motivo}|${est.tipo}`;
    if (clave === ultimoEstado) return;
    ultimoEstado = clave;
    ctx.events.emit('construccion:estado', { activo: est.activo, ok: est.ok, motivo: est.motivo, nombre: est.tipo ? PIEZAS[est.tipo].nombre : '' });
  }

  function iniciar(slot) {
    const s = S()?.slots?.[slot], it = s ? ITEMS[s.item] : null;
    if (!it?.pieza || !PIEZAS[it.pieza]) return false;
    cancelar(true);
    Object.assign(est, { activo: true, tipo: it.pieza, item: s.item, slot, rot: ctx.player.yaw, ok: false, motivo: '' });
    est.ghost = construirMalla(it.pieza, M);
    est.ghost.traverse((o) => { if (o.isMesh) { o.userData.hoja = o.material === M.hoja || o.material === M.hojaSeca; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5; } });
    raiz.add(est.ghost);
    actualizarFantasma();
    emitir();
    ctx.events.emit('ui:sound', { nombre: 'ui_open' });
    return true;
  }
  function cancelar(silencioso = false) {
    if (!est.activo) return;
    if (est.ghost) raiz.remove(est.ghost);
    Object.assign(est, { activo: false, tipo: null, item: null, slot: -1, ghost: null, ok: false, motivo: '' });
    emitir();
    if (!silencioso) ctx.events.emit('ui:sound', { nombre: 'ui_close' });
  }
  function alternar(slot) { if (est.activo && est.slot === slot) { cancelar(); return true; } return iniciar(slot); }
  function girar(pasos = 1) { if (!est.activo) return; est.rot += pasos * PASO_GIRO; actualizarFantasma(); }

  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  function actualizarFantasma() {
    if (!est.activo) return;
    // el objeto tiene que seguir en la casilla elegida
    const s = S()?.slots?.[est.slot];
    if (!s || s.item !== est.item) { cancelar(true); return; }
    ctx.player.getLookRay(_o, _d);
    const hit = world.raycastTerrain?.(_o, _d, ALCANCE + 1.5);
    let px, pz;
    if (hit?.point) { px = hit.point.x; pz = hit.point.z; }
    else { px = _o.x + _d.x * 3; pz = _o.z + _d.z * 3; }
    // a distancia de alcance como mucho
    const pp = ctx.player.position, dd = Math.hypot(px - pp.x, pz - pp.z);
    if (dd > ALCANCE) { px = pp.x + ((px - pp.x) / dd) * ALCANCE; pz = pp.z + ((pz - pp.z) / dd) * ALCANCE; }
    est.x = px; est.z = pz;
    const ev = evaluar(est.tipo, px, pz, est.rot);
    est.ok = ev.ok; est.motivo = ev.motivo; est.ev = ev;
    est.ghost.position.set(px, (ev.y ?? world.getHeight(px, pz)) + 0.01, pz);
    est.ghost.rotation.set(ev.inc?.[0] ?? 0, est.rot, ev.inc?.[1] ?? 0, 'YXZ');
    pintarFantasma(ev.ok);
    emitir();
  }

  function confirmar() {
    if (!est.activo) return false;
    actualizarFantasma();
    if (!est.activo) return false;
    if (!est.ok) { avisar(est.motivo || 'No se puede colocar aquí', 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return false; }
    if (!S()?.inventory.remove(est.item, 1)) { cancelar(true); return false; }
    const p = crear(est.tipo, est.x, est.z, est.rot);
    ctx.events.emit('construccion:colocada', { tipo: p.tipo, x: p.x, z: p.z });
    ctx.events.emit('ui:sound', { nombre: 'craft' });
    ctx.audio?.play?.('craft');
    cancelar(true);
    return p;
  }

  // entrada: R gira (Mayús al revés), la rueda gira, clic derecho cancela
  window.addEventListener('keydown', (e) => {
    if (!est.activo || e.repeat || ctx.state !== 'playing') return;
    if (e.code === 'KeyR') girar(e.shiftKey ? -1 : 1);
  });
  window.addEventListener('wheel', (e) => { if (est.activo && ctx.state === 'playing') girar(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  ctx.events.on('input:action', ({ action, pressed }) => {
    if (!pressed || !est.activo) return;
    if (action === 'secundario') cancelar();
  });
  ctx.events.on('player:died', () => cancelar(true));
  ctx.events.on('state', ({ state }) => { if (state === 'menu') cancelar(true); });

  // ------------------------------------------------------------------ contenedores
  const stackMax = (id) => (ITEMS[id]?.dur ? 1 : ITEMS[id]?.apilable ?? 1);
  /** Mete en las casillas de un contenedor; devuelve lo que no cupo. Las frescuras se promedian al apilar (ver survival/frescura.js). */
  function meterEn(casillas, item, cantidad, extra = null) {
    let resto = cantidad;
    const max = stackMax(item), fr = extra?.fr;
    if (max > 1) for (const c of casillas) {
      if (resto <= 0) break;
      if (c && c.item === item && c.cantidad < max) {
        const n = Math.min(max - c.cantidad, resto);
        if (fr != null || c.fr != null) c.fr = ((c.fr ?? 1) * c.cantidad + (fr ?? 1) * n) / (c.cantidad + n);
        c.cantidad += n; resto -= n;
      }
    }
    for (let i = 0; i < casillas.length && resto > 0; i++) {
      if (casillas[i]) continue;
      const n = Math.min(max, resto);
      casillas[i] = { item, cantidad: n, ...(extra ?? {}) };
      if (casillas[i].fr == null && fr != null) casillas[i].fr = fr;
      resto -= n;
    }
    return resto;
  }
  /** Mochila → contenedor (una casilla entera o `cantidad`). */
  function guardar(p, slot, cantidad = null) {
    const inv = S()?.inventory, s = S()?.slots?.[slot]; if (!p?.cont || !s) return 0;
    const n = cantidad == null ? s.cantidad : Math.min(cantidad, s.cantidad);
    const extra = s.dur != null || s.fr != null ? { ...(s.dur != null ? { dur: s.dur, cal: s.cal, rep: s.rep } : {}), ...(s.fr != null ? { fr: s.fr } : {}) } : null;
    const prueba = p.cont.casillas.map((c) => (c ? { ...c } : null)), resto = meterEn(prueba, s.item, n, extra);
    const metidos = n - resto; if (metidos <= 0) { avisar('No cabe más aquí', 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return 0; }
    inv.tomar(slot, metidos);
    meterEn(p.cont.casillas, s.item, metidos, extra);
    ctx.events.emit('contenedor:cambio', { pieza: p });
    return metidos;
  }
  /** Contenedor → mochila (una casilla entera o `cantidad`): lo que no cabe se queda en el contenedor. */
  function sacar(p, i, cantidad = null) {
    const inv = S()?.inventory, c = p?.cont?.casillas?.[i]; if (!c) return 0;
    const n = cantidad == null ? c.cantidad : Math.min(cantidad, c.cantidad);
    const extra = c.dur != null || c.fr != null ? { ...(c.dur != null ? { dur: c.dur, cal: c.cal, rep: c.rep } : {}), ...(c.fr != null ? { fr: c.fr } : {}) } : null;
    const resto = inv.add(c.item, n, extra), sacados = n - resto;
    if (sacados <= 0) { avisar('No tienes sitio en la mochila', 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return 0; }
    c.cantidad -= sacados; if (c.cantidad <= 0) p.cont.casillas[i] = null;
    ctx.events.emit('contenedor:cambio', { pieza: p });
    return sacados;
  }
  function guardarTodo(p, desde = 9) { let n = 0; for (let i = desde; i < (S()?.slots?.length ?? 0); i++) if (S().slots[i]) n += guardar(p, i); return n; }
  function sacarTodo(p) { let n = 0; for (let i = 0; i < (p?.cont?.casillas?.length ?? 0); i++) if (p.cont.casillas[i]) n += sacar(p, i); return n; }

  // ------------------------------------------------------------------ consultas
  /** Cobertura de techo (0..1) en un punto: 1 bajo un techo construido. */
  function techoEn(x, z, y = null) {
    let t = 0;
    for (const p of piezas) {
      const T = p.def.techo; if (!T) continue;
      if (Math.abs(p.x - x) > 4 || Math.abs(p.z - z) > 4) continue;
      const [lx, lz] = aLocal(p.x, p.z, p.rot, x, z);
      if (lx >= T.x0 && lx <= T.x1 && lz >= T.z0 && lz <= T.z1 && (y == null || y < p.y + T.alto + 0.3)) t = 1;
    }
    return t;
  }

  // ------------------------------------------------------------------ guardado
  function serializar() {
    return piezas.map((p) => ({ t: p.tipo, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +p.rot.toFixed(3), ...(p.cont ? { cont: p.cont.casillas.map((c) => (c ? { ...c } : null)) } : {}) }));
  }
  function restaurar(lista) {
    cancelar(true);
    for (const p of [...piezas]) quitar(p);
    for (const d of lista ?? []) if (PIEZAS[d.t]) crear(d.t, d.x, d.z, d.r ?? 0, { cont: d.cont });
  }

  const api = (ctx.construccion = {
    PIEZAS, piezas, evaluar, crear, quitar, recoger,
    get colocando() { return est.activo; },
    estado: est,
    iniciar, cancelar, alternar, girar, confirmar, actualizarFantasma,
    abierto: null,
    cerrarContenedor() { if (api.abierto) { const p = api.abierto; api.abierto = null; ctx.events.emit('contenedor:cerrar', { pieza: p }); } },
    guardar, sacar, guardarTodo, sacarTodo, meterEn,
    contenedores: () => piezas.filter((p) => p.cont),
    camas: () => piezas.filter((p) => p.def.accion === 'dormir'),
    techoEn,
    serializar, restaurar,
  });

  return {
    name: 'construccion',
    update() {
      if (est.activo) { if (ctx.state === 'playing') actualizarFantasma(); else if (ctx.state === 'dead' || ctx.state === 'menu') cancelar(true); }
      // contenedor abierto: se cierra si el jugador se aleja
      if (api.abierto && Math.hypot(api.abierto.x - ctx.player.position.x, api.abierto.z - ctx.player.position.z) > 4.5) ctx.ui?.cerrarContenedor?.();
    },
  };
}
