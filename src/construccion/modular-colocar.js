// Colocación de la construcción modular (F3): encaje en la rejilla de 2,5 m a partir de las piezas que ya hay (bordes, esquinas,
// casillas, encima de paredes, marcos de puerta, extremos de vallas), validación de apoyos (cada pieza hereda el apoyo de la que la
// sostiene y pierde un poco con la altura y los voladizos), coste visible, colisiones de caja, superficies pisables, puertas que se
// abren, demolición con reembolso, reparación con martillo, deterioro a la intemperie y derrumbe de lo que se queda sin apoyo.
// Comparte la lista `piezas` y el guardado con construccion/index.js.
import * as THREE from 'three';
import { ITEMS } from '../core/items.js';
import { MODULOS, MATERIALES, TILE, ALTO, PUERTA, costeDe, hpDe, alturaLocal, materialesModulos, mallaModulo, cajasDe } from './modular.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z (local de la casilla)
const MIN_APOYO = 0.2;
const CLASE = { cimiento: 'casilla', suelo: 'casilla', escalera: 'casilla', rampa: 'casilla', pared: 'pared', pared_puerta: 'pared', pared_ventana: 'pared', puerta: 'puerta', techo: 'techo', pilar: 'pilar', valla: 'linea', empalizada: 'linea' };
const PISO = new Set(['cimiento', 'suelo']); // casillas sobre las que se apoyan paredes, pilares y escaleras
const PARED = new Set(['pared', 'pared_puerta', 'pared_ventana']);
const nombreDe = (mod, mat) => `${MODULOS[mod].nombre} de ${MATERIALES[mat].nombre.toLowerCase()}`;

export function crearModular(ctx, K) {
  const world = ctx.world;
  const MM = materialesModulos(ctx.flora?.texturas ?? null, (m) => ctx.lighting?.setupMaterial?.(m));
  const S = () => ctx.survival;
  const avisar = (t, tipo = 'info') => ctx.ui?.notify?.(t, tipo);
  const dayLen = ctx.config.time.dayLengthSec;
  const { aMundo, aLocal } = K;
  const modulares = () => K.piezas.filter((p) => p.modular);
  const cerca = (x, z, r) => K.piezas.filter((p) => p.modular && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r);
  const angulo = (r) => { r %= Math.PI * 2; return r < 0 ? r + Math.PI * 2 : r; };
  const mismoAng = (a, b) => { const d = Math.abs(angulo(a) - angulo(b)) % Math.PI; return d < 0.05 || Math.PI - d < 0.05; }; // paredes: 0 y π son la misma
  const terreno = (x, z) => world.getHeight(x, z);

  // ------------------------------------------------------------------ medidas del terreno bajo una casilla
  function bajoCasilla(x, z, rot, w = TILE, l = TILE) {
    let lo = 1e9, hi = -1e9, agua = false;
    for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) {
      const [px, pz] = aMundo(x, z, rot, a * w, b * l), y = terreno(px, pz);
      if (y < world.seaLevel + 0.1) agua = true;
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return { lo, hi, agua };
  }

  // ------------------------------------------------------------------ candidatos de encaje
  /** Posiciones posibles para `mod` cerca del punto apuntado. Cada una: { x, y, z, rot, apoyo, soportes, alto?, sube?, libre? } */
  function candidatos(mod, aim, rotUsuario) {
    const out = [], near = cerca(aim.x, aim.z, 9), D = MODULOS[mod];
    const add = (c) => out.push(c);
    for (const p of near) {
      // casillas (cimiento / suelo)
      if (PISO.has(p.mod)) {
        if ((mod === 'cimiento' && p.mod === 'cimiento') || mod === 'suelo') {
          for (const [dx, dz] of DIRS) { const [x, z] = aMundo(p.x, p.z, p.rot, dx * TILE, dz * TILE); add({ x, y: p.y, z, rot: p.rot, soportes: [p], voladizo: mod === 'suelo', base: p }); }
        }
        if (PARED.has(mod)) for (let k = 0; k < 4; k++) {
          const [dx, dz] = DIRS[k], [x, z] = aMundo(p.x, p.z, p.rot, (dx * TILE) / 2, (dz * TILE) / 2);
          add({ x, y: p.y, z, rot: p.rot + (dx !== 0 ? Math.PI / 2 : 0), soportes: [p] });
        }
        if (mod === 'pilar') for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [x, z] = aMundo(p.x, p.z, p.rot, (a * TILE) / 2, (b * TILE) / 2); add({ x, y: p.y, z, rot: p.rot, soportes: [p] }); }
        if (mod === 'escalera') add({ x: p.x, y: p.y, z: p.z, rot: p.rot + Math.round(angulo(rotUsuario - p.rot) / (Math.PI / 2)) * (Math.PI / 2), soportes: [p] });
        if (mod === 'rampa') for (const [dx, dz] of DIRS) {
          const [x, z] = aMundo(p.x, p.z, p.rot, dx * TILE, dz * TILE);
          const sube = p.y - terreno(x, z); // sube del suelo hasta el tablero de la casilla
          const rot = Math.atan2(p.x - x, p.z - z); // +z local mirando a la casilla
          if (sube > 0.15 && sube < ALTO) add({ x, y: p.y - sube, z, rot, soportes: [p], sube });
        }
      }
      // paredes: encima otra pared; a sus lados, suelos y techos
      if (PARED.has(p.mod)) {
        const top = p.y + ALTO;
        if (PARED.has(mod)) add({ x: p.x, y: top, z: p.z, rot: p.rot, soportes: [p], apilada: true });
        if (mod === 'suelo' || mod === 'techo') for (const s of [-1, 1]) {
          const [x, z] = aMundo(p.x, p.z, p.rot, 0, (s * TILE) / 2);
          // el techo se alinea con la rejilla de la pared y se orienta (hacia dónde cae el faldón) con R en pasos de 90°
          const rot = mod === 'techo' ? Math.round(angulo(rotUsuario) / (Math.PI / 2)) * (Math.PI / 2) + (angulo(p.rot) % (Math.PI / 2)) : p.rot;
          add({ x, y: top, z, rot, soportes: [p] });
        }
      }
      // pilares sostienen suelos encima
      if (p.mod === 'pilar' && mod === 'suelo') for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [x, z] = aMundo(p.x, p.z, p.rot, (a * TILE) / 2, (b * TILE) / 2); add({ x, y: p.y + ALTO, z, rot: p.rot, soportes: [p] }); }
      // marco de puerta
      if (p.mod === 'pared_puerta' && mod === 'puerta') add({ x: p.x, y: p.y, z: p.z, rot: p.rot, soportes: [p] });
      // vallas y empalizadas: por los extremos
      if ((mod === 'valla' || mod === 'empalizada') && p.mod === mod) for (const s of [-1, 1]) { const [x, z] = aMundo(p.x, p.z, p.rot, s * TILE, 0); add({ x, y: terreno(x, z), z, rot: p.rot, soportes: [] }); }
    }
    // colocación libre (sobre el terreno)
    if (D.libre) {
      if (mod === 'cimiento') { const b = bajoCasilla(aim.x, aim.z, rotUsuario); add({ x: aim.x, y: b.hi + 0.35, z: aim.z, rot: rotUsuario, soportes: [], libre: true }); }
      else if (mod === 'rampa') { const yb = terreno(aim.x, aim.z); add({ x: aim.x, y: yb, z: aim.z, rot: rotUsuario, soportes: [], libre: true, sube: ALTO / 2 }); }
      else add({ x: aim.x, y: terreno(aim.x, aim.z), z: aim.z, rot: rotUsuario, soportes: [], libre: true });
    }
    return out;
  }

  // ------------------------------------------------------------------ apoyos y ocupación
  function ocupado(mod, c) {
    const cl = CLASE[mod];
    return K.piezas.some((p) => p.modular && CLASE[p.mod] === cl && Math.hypot(p.x - c.x, p.z - c.z) < 0.3 && Math.abs(p.y - c.y) < 0.3 && (cl !== 'pared' || mismoAng(p.rot, c.rot)) && (cl !== 'linea' || mismoAng(p.rot, c.rot)));
  }
  /** Apoyo (0..1) de una candidata y la lista de piezas en las que se sostiene. */
  function apoyoDe(mod, c) {
    if (mod === 'cimiento' || mod === 'valla' || mod === 'empalizada') return { apoyo: 1, soportes: c.soportes ?? [] };
    if (mod === 'rampa' && c.libre) return { apoyo: 1, soportes: [] };
    let a = 0; const sop = new Set();
    const usa = (p, v) => { if (v > a) a = v; sop.add(p); };
    for (const p of c.soportes ?? []) {
      if (PISO.has(p.mod)) usa(p, (p.apoyo ?? 1) - (c.voladizo ? 0.45 : mod === 'pilar' ? 0.05 : 0));
      else if (PARED.has(p.mod)) usa(p, (p.apoyo ?? 1) - (c.apilada ? 0.2 : mod === 'techo' ? 0.1 : 0.15));
      else if (p.mod === 'pilar') usa(p, (p.apoyo ?? 1) - 0.15);
      else usa(p, p.apoyo ?? 1);
    }
    // un suelo o techo también se sostiene en TODAS las paredes y pilares de sus bordes y esquinas a su altura
    if (mod === 'suelo' || mod === 'techo') for (const p of cerca(c.x, c.z, TILE * 1.2)) {
      if (PARED.has(p.mod) && Math.abs(p.y + ALTO - c.y) < 0.15) { const [lx, lz] = aLocal(c.x, c.z, c.rot, p.x, p.z); if ((Math.abs(Math.abs(lx) - TILE / 2) < 0.15 && Math.abs(lz) < 0.15) || (Math.abs(Math.abs(lz) - TILE / 2) < 0.15 && Math.abs(lx) < 0.15)) usa(p, (p.apoyo ?? 1) - (mod === 'techo' ? 0.1 : 0.15)); }
      if (p.mod === 'pilar' && Math.abs(p.y + ALTO - c.y) < 0.15) { const [lx, lz] = aLocal(c.x, c.z, c.rot, p.x, p.z); if (Math.abs(Math.abs(lx) - TILE / 2) < 0.15 && Math.abs(Math.abs(lz) - TILE / 2) < 0.15) usa(p, (p.apoyo ?? 1) - 0.15); }
      if (mod === 'suelo' && PISO.has(p.mod) && Math.abs(p.y - c.y) < 0.15 && Math.abs(Math.hypot(p.x - c.x, p.z - c.z) - TILE) < 0.2) usa(p, (p.apoyo ?? 1) - 0.45);
    }
    return { apoyo: Math.max(0, a), soportes: [...sop] };
  }

  /** ¿Se puede colocar? Devuelve { ok, motivo, apoyo, soportes, coste, faltan, ...c }. */
  function evaluarCandidata(mod, mat, c) {
    const coste = costeDe(mod, mat), faltan = {};
    for (const [k, n] of Object.entries(coste)) { const t = S()?.inventory.count(k) ?? 0; if (t < n) faltan[k] = n - t; }
    const base = { ...c, coste, faltan };
    if (ocupado(mod, c)) return { ok: false, motivo: 'Ya hay una pieza ahí', ...base };
    // terreno bajo lo que apoya en el suelo
    if (mod === 'cimiento') {
      const b = bajoCasilla(c.x, c.z, c.rot);
      if (b.agua) return { ok: false, motivo: 'No se puede construir en el agua', ...base };
      if (c.y - b.lo > 3.4) return { ok: false, motivo: 'El suelo queda muy abajo: el cimiento no llega', ...base };
      if (c.y - b.hi < 0.12) return { ok: false, motivo: 'El terreno sube por encima del cimiento', ...base };
      base.alto = c.y - b.lo + 0.15;
    }
    if (mod === 'valla' || mod === 'empalizada' || (mod === 'rampa' && c.libre)) {
      const b = bajoCasilla(c.x, c.z, c.rot, TILE, mod === 'rampa' ? TILE : 0.3);
      if (b.agua) return { ok: false, motivo: 'No se puede construir en el agua', ...base };
      if (b.hi - b.lo > (mod === 'rampa' ? 0.8 : 1.2)) return { ok: false, motivo: 'El suelo es demasiado desparejo', ...base };
    }
    // árboles y rocas dentro de la huella de lo que toca el suelo
    if (mod === 'cimiento' || mod === 'valla' || mod === 'empalizada' || mod === 'rampa') {
      const R = mod === 'cimiento' || mod === 'rampa' ? TILE * 0.48 : 0.4;
      const pts = mod === 'valla' || mod === 'empalizada' ? [[-0.4, 0], [0, 0], [0.4, 0]].map(([a, b]) => aMundo(c.x, c.z, c.rot, a * TILE, b)) : [[c.x, c.z]];
      for (const [px, pz] of pts) for (const q of world.colliders.query(px, pz, R, [])) {
        if (q.owner?.pieza) continue;
        if (q.kind === 'arbol' || q.kind === 'roca' || q.kind === 'tronco') return { ok: false, motivo: q.kind === 'arbol' ? 'Hay un árbol en medio' : q.kind === 'roca' ? 'Hay una roca en medio' : 'Hay un tronco en medio', ...base };
      }
    }
    // no encerrar al jugador dentro de una pared o un pilar
    const pp = ctx.player.position;
    for (const b of cajasDe(mod, { alto: base.alto })) {
      const [lx, lz] = aLocal(c.x, c.z, c.rot, pp.x, pp.z);
      if (Math.abs(lx - b.cx) < b.hx + 0.4 && Math.abs(lz - b.cz) < b.hz + 0.4 && pp.y < c.y + b.y1 && pp.y + 1.8 > c.y + b.y0 && mod !== 'cimiento') return { ok: false, motivo: 'Estás en medio', ...base };
    }
    const ap = apoyoDe(mod, c);
    Object.assign(base, ap);
    if (ap.apoyo < MIN_APOYO) return { ok: false, motivo: `Sin apoyo suficiente (${Math.round(ap.apoyo * 100)} %)`, ...base };
    if (Object.keys(faltan).length) return { ok: false, motivo: 'Te faltan materiales: ' + Object.entries(faltan).map(([k, n]) => `${n} de ${ITEMS[k].nombre.toLowerCase()}`).join(', '), ...base, sinMateriales: true };
    return { ok: true, motivo: '', ...base };
  }

  /** Mejor candidata para el punto apuntado (la más cercana en el espacio, prefiriendo las encajadas a las libres). */
  function mejor(mod, mat, aim, rotUsuario) {
    const cs = candidatos(mod, aim, rotUsuario);
    let best = null, bd = 1e9;
    for (const c of cs) {
      const d = Math.hypot(c.x - aim.x, c.z - aim.z) + Math.abs((c.y ?? aim.y) - aim.y) * 0.6 + (c.libre ? 1.2 : 0);
      if (!c.libre && d > 2.6) continue;
      if (d < bd) { bd = d; best = c; }
    }
    return best ? evaluarCandidata(mod, mat, best) : { ok: false, motivo: MODULOS[mod].libre ? 'Apunta al suelo' : 'Apunta a una pieza donde encajarla', x: aim.x, y: aim.y, z: aim.z, rot: rotUsuario, coste: costeDe(mod, mat), faltan: {} };
  }

  // ------------------------------------------------------------------ crear y quitar
  function colocarMalla(p) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.set(0, p.rot, 0);
  }
  function aplicarPuerta(p) {
    const hoja = p.mesh.getObjectByName('hoja');
    if (hoja) hoja.rotation.y = p.abierta ? -Math.PI / 2 + 0.08 : 0;
    for (const id of p.cols) world.colliders.remove(id);
    p.cols = [];
    registrarCajas(p);
  }
  function registrarCajas(p) {
    for (const b of cajasDe(p.mod, { alto: p.alto, abierta: p.abierta })) {
      const [cx, cz] = aMundo(p.x, p.z, p.rot, b.cx, b.cz);
      p.cols.push(world.colliders.addBox(cx, cz, b.hx, b.hz, p.rot, { y0: p.y + b.y0, y1: p.y + b.y1, kind: 'estructura', owner: { pieza: p } }));
    }
  }
  function crearModulo(mod, mat, c, extra = {}) {
    const p = {
      id: K.nuevoId(), modular: true, mod, mat, def: MODULOS[mod], x: c.x, y: c.y, z: c.z, rot: c.rot,
      alto: c.alto ?? extra.alto, sube: c.sube ?? extra.sube, hpMax: hpDe(mod, mat), hp: extra.hp ?? hpDe(mod, mat),
      apoyo: c.apoyo ?? extra.apoyo ?? 1, soportes: (c.soportes ?? []).map((q) => q.id), abierta: !!extra.abierta, cols: [], cont: null, t: extra.t ?? ctx.time.elapsed,
    };
    p.mesh = mallaModulo(mod, mat, MM, { alto: p.alto, sube: p.sube });
    p.mesh.userData.pieza = p;
    p.mesh.traverse((o) => { o.userData.pieza = p; });
    colocarMalla(p); K.raiz.add(p.mesh);
    registrarCajas(p);
    if (mod === 'puerta' && p.abierta) aplicarPuerta(p);
    if (mod === 'cimiento' || mod === 'valla' || mod === 'empalizada' || (mod === 'rampa' && !p.soportes.length)) p.claro = ctx.flora?.despejar?.(p.x, p.z, mod === 'cimiento' || mod === 'rampa' ? TILE * 0.75 : TILE * 0.55) ?? null;
    K.piezas.push(p);
    return p;
  }
  function quitarModulo(p) {
    for (const id of p.cols) world.colliders.remove(id);
    if (p.claro) ctx.flora?.cerrarClaro?.(p.claro);
    K.raiz.remove(p.mesh);
    const i = K.piezas.indexOf(p); if (i >= 0) K.piezas.splice(i, 1);
  }
  /** Piezas que se quedarían sin apoyo si se quita `p` (las que solo se sostienen en ella, y en cadena). */
  function dependientes(p, quitadas = new Set([p.id])) {
    const out = [];
    for (const q of modulares()) {
      if (quitadas.has(q.id) || !q.soportes.length) continue;
      if (q.soportes.every((id) => quitadas.has(id))) { quitadas.add(q.id); out.push(q, ...dependientes(q, quitadas)); }
    }
    return out;
  }

  // ------------------------------------------------------------------ acciones del jugador
  function demoler(p) {
    const dep = dependientes(p);
    if (dep.length) { avisar(`Antes quita lo que se apoya aquí (${dep.length} ${dep.length === 1 ? 'pieza' : 'piezas'})`, 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return false; }
    quitarModulo(p);
    // reembolso: la mitad de los materiales (menos si estaba dañada)
    const k = 0.5 * Math.max(0.3, p.hp / p.hpMax);
    for (const [it, n] of Object.entries(costeDe(p.mod, p.mat))) {
      const m = Math.floor(n * k); if (m <= 0) continue;
      const left = S()?.inventory.add(it, m) ?? m;
      if (left > 0) ctx.physics?.spawnProp?.('loot', new THREE.Vector3(p.x, p.y + 1, p.z), new THREE.Vector3(0, 2.5, 0), { item: it, cantidad: left });
    }
    ctx.events.emit('construccion:demolida', { mod: p.mod, mat: p.mat });
    ctx.events.emit('ui:sound', { nombre: 'ui_click' });
    return true;
  }
  /** Repara con el martillo: cuesta un cuarto de los materiales de la pieza. */
  function reparar(p) {
    if (p.hp >= p.hpMax - 0.5) { avisar('No necesita reparación', 'info'); return false; }
    const coste = Object.fromEntries(Object.entries(costeDe(p.mod, p.mat)).map(([k, n]) => [k, Math.max(1, Math.ceil(n / 4))]));
    for (const [k, n] of Object.entries(coste)) if ((S()?.inventory.count(k) ?? 0) < n) { avisar(`Para reparar necesitas ${n} de ${ITEMS[k].nombre.toLowerCase()}`, 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return false; }
    for (const [k, n] of Object.entries(coste)) S().inventory.remove(k, n);
    p.hp = p.hpMax; S()?.desgastarMano?.(1);
    ctx.events.emit('construccion:reparada', { mod: p.mod });
    ctx.audio?.play?.('craft');
    return true;
  }
  function alternarPuerta(p) { p.abierta = !p.abierta; aplicarPuerta(p); ctx.events.emit('ui:sound', { nombre: 'ui_click' }); ctx.events.emit('construccion:puerta', { abierta: p.abierta }); }

  /** Daño a una pieza (criaturas, incursiones). Si llega a 0 se derrumba con lo que se apoya en ella. */
  function danar(p, n, causa = 'golpe') {
    if (!K.piezas.includes(p)) return;
    p.hp -= n;
    if (p.hp <= 0) derrumbar(p, causa);
  }
  function derrumbar(p, causa = 'deterioro') {
    const caen = [p, ...dependientes(p)];
    for (const q of caen) { quitarModulo(q); ctx.fx?.emit?.('polvo', new THREE.Vector3(q.x, q.y + 1, q.z), { cantidad: 14 }); }
    avisar(`Se derrumbó: ${nombreDe(p.mod, p.mat)}${caen.length > 1 ? ` (y ${caen.length - 1} más)` : ''}`, 'warn');
    ctx.events.emit('construccion:derrumbe', { mod: p.mod, causa, piezas: caen.length });
  }

  // ------------------------------------------------------------------ consultas para el jugador y el clima
  /** Altura de la superficie construida pisable bajo (x, z) que queda a lo sumo `subida` por encima de `y` (o -Infinity). */
  function superficie(x, z, y, subida = 0.75) {
    let best = -Infinity;
    for (const p of K.piezas) {
      if (!p.modular || !p.def.pisable || Math.abs(p.x - x) > 2.4 || Math.abs(p.z - z) > 2.4) continue;
      const [lx, lz] = aLocal(p.x, p.z, p.rot, x, z);
      let h = alturaLocal(p.mod, lx, lz); if (h == null) continue;
      if (p.mod === 'rampa') h = Math.min(1, Math.max(0, (lz + TILE / 2) / TILE)) * (p.sube ?? ALTO / 2);
      const top = p.y + h;
      if (top <= y + subida && top > best) best = top;
    }
    return best;
  }
  /** Lo más bajo construido por encima de la cabeza (techos y suelos) en (x, z), o Infinity. */
  function techoSobre(x, z, y) {
    let best = Infinity;
    for (const p of K.piezas) {
      if (!p.modular || (p.mod !== 'suelo' && p.mod !== 'cimiento') || Math.abs(p.x - x) > 1.8 || Math.abs(p.z - z) > 1.8) continue;
      const [lx, lz] = aLocal(p.x, p.z, p.rot, x, z);
      if (Math.abs(lx) > TILE / 2 || Math.abs(lz) > TILE / 2) continue;
      const bajo = p.y - (p.mod === 'cimiento' ? p.alto ?? 0.6 : 0.2);
      if (bajo > y + 0.5 && bajo < best) best = bajo;
    }
    return best;
  }
  /** Cobertura (0/1) de techos y suelos construidos sobre un punto. */
  function cubierto(x, z, y = null) {
    for (const p of K.piezas) {
      if (!p.modular || !p.def.techo || Math.abs(p.x - x) > 2 || Math.abs(p.z - z) > 2) continue;
      const [lx, lz] = aLocal(p.x, p.z, p.rot, x, z);
      if (Math.abs(lx) <= TILE / 2 + 0.25 && Math.abs(lz) <= TILE / 2 + 0.25 && (y == null || p.y > y + 0.4)) return 1;
    }
    return 0;
  }

  // ------------------------------------------------------------------ deterioro
  let accDet = 0;
  function tick(dt) {
    accDet += dt * (ctx.time.escala ?? 1);
    if (accDet < 10) return;
    const g = accDet; accDet = 0;
    for (const p of [...modulares()]) {
      if (!K.piezas.includes(p)) continue;
      // a cubierto se deteriora a la cuarta parte (las paredes y suelos bajo techo)
      const cub = p.def.techo ? 0 : cubierto(p.x, p.z, p.y + 0.5);
      p.hp -= p.hpMax * MATERIALES[p.mat].deterioro * (g / dayLen) * (cub ? 0.25 : 1);
      if (p.hp <= 0) derrumbar(p, 'deterioro');
    }
  }

  // ------------------------------------------------------------------ guardado
  const serializar = (p) => ({ m: p.mod, mat: p.mat, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), r: +p.rot.toFixed(4), ...(p.alto != null ? { alto: +p.alto.toFixed(3) } : {}), ...(p.sube != null ? { sube: +p.sube.toFixed(3) } : {}), hp: Math.round(p.hp), ap: +p.apoyo.toFixed(2), sop: p.soportes, id: p.id, ...(p.abierta ? { ab: 1 } : {}), t: Math.round(p.t) });
  function restaurar(lista) {
    // dos pasadas: primero crea (con los id guardados), después traduce los soportes
    const mapa = new Map();
    for (const d of lista) {
      if (!MODULOS[d.m] || !MATERIALES[d.mat]) continue;
      const p = crearModulo(d.m, d.mat, { x: d.x, y: d.y, z: d.z, rot: d.r, alto: d.alto, sube: d.sube, apoyo: d.ap, soportes: [] }, { hp: d.hp, abierta: !!d.ab, t: d.t });
      mapa.set(d.id, p);
    }
    for (const d of lista) { const p = mapa.get(d.id); if (p) p.soportes = (d.sop ?? []).map((id) => mapa.get(id)?.id).filter((x) => x != null); }
  }

  return {
    MODULOS, MATERIALES, TILE, ALTO, PUERTA, nombreDe, costeDe,
    candidatos, mejor, evaluarCandidata, crearModulo, quitarModulo, dependientes, demoler, reparar, alternarPuerta, danar, derrumbar,
    superficie, techoSobre, cubierto, tick, serializar, restaurar, modulares, materiales: MM,
  };
}
