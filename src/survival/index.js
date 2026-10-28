// Módulo SUPERVIVENCIA: estadísticas vitales, inventario, barra rápida, crafteo, fogatas, muerte/reaparición y guardado.
import * as THREE from 'three';
import { ITEMS, RECIPES, RANURAS, CALIDADES, CAPACIDAD_BASE, HABILIDADES, despiezar as despiezarTabla, estadoDur } from '../core/items.js';
import { createCampfires } from './campfire.js';
import { createSaber, tirarCalidad } from './saber.js';

const SAVE_KEY = 'isla-primordial:partida:v1'; // la clave no cambia: el formato interno lleva su propia versión (v:1 antiguo, v:2 actual)
const SLOTS = 30; // los 9 primeros son la barra rápida
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function create(ctx) {
  const world = ctx.world;
  const cfgPlayer = ctx.config.player;
  const baseSprint = cfgPlayer.sprintSpeed;
  const baseWalk = cfgPlayer.walkSpeed;

  // ------------------------------------------------------------------ inventario
  // Casilla: { item, cantidad } y, solo en objetos con desgaste, { dur, cal, rep } (cada unidad ocupa su casilla).
  const slots = new Array(SLOTS).fill(null);
  const equipo = Object.fromEntries(RANURAS.map((r) => [r, null])); // ropa puesta: { item, dur, cal, rep }
  const saber = createSaber();
  const changed = () => ctx.events.emit('inventory:changed', {});
  const stackMax = (id) => (ITEMS[id]?.dur ? 1 : ITEMS[id]?.apilable ?? 1);
  const durMaxDe = (item, cal = 1, rep = 0) => Math.round((ITEMS[item]?.dur ?? 0) * (CALIDADES[cal]?.durMult ?? 1) * (1 - 0.1 * rep));
  const nuevaInstancia = (item, extra = null) => {
    if (!ITEMS[item]?.dur) return {};
    const cal = extra?.cal ?? 1, rep = extra?.rep ?? 0;
    return { cal, rep, dur: Math.min(extra?.dur ?? durMaxDe(item, cal, rep), durMaxDe(item, cal, rep) || 1e9) };
  };

  function aprender(nuevas) {
    for (const r of nuevas ?? []) { ctx.events.emit('saber:aprendido', { clave: r.clave, item: r.id, nombre: ITEMS[r.id]?.nombre ?? r.id }); }
  }

  const peso = () => { let w = 0; for (const s of slots) if (s) w += (ITEMS[s.item]?.peso ?? 0) * s.cantidad; for (const r of RANURAS) if (equipo[r]) w += ITEMS[equipo[r].item]?.peso ?? 0; return w; };
  const volumen = () => { let v = 0; for (const s of slots) if (s) v += (ITEMS[s.item]?.vol ?? 0) * s.cantidad; return v; };
  const capacidad = () => { let p = CAPACIDAD_BASE.peso, v = CAPACIDAD_BASE.volumen; for (const r of RANURAS) { const it = equipo[r] && ITEMS[equipo[r].item]; if (it?.capacidad) p += it.capacidad; if (it?.volumen) v += it.volumen; } return { peso: p, volumen: v }; };

  const inventory = {
    slots,
    count(item) { let n = 0; for (const s of slots) if (s && s.item === item) n += s.cantidad; return n; },
    has(item, cantidad = 1) { return this.count(item) >= cantidad; },
    peso, volumen, capacidad,
    /** Cuántas unidades de `item` caben todavía (por volumen duro y por peso, hasta 1,6× la capacidad). */
    cabe(item, cantidad) {
      const it = ITEMS[item]; if (!it) return 0;
      const cap = capacidad();
      const porVol = it.vol > 0 ? Math.floor((cap.volumen - volumen()) / it.vol + 1e-6) : cantidad;
      const porPeso = it.peso > 0 ? Math.floor((cap.peso * 1.6 - peso()) / it.peso + 1e-6) : cantidad;
      return Math.max(0, Math.min(cantidad, porVol, porPeso));
    },
    /** Devuelve lo que NO cupo. `extra` = { dur, cal, rep } para objetos con desgaste. */
    add(item, cantidad = 1, extra = null) {
      if (!ITEMS[item] || cantidad <= 0) return cantidad;
      let left = cantidad - this.cabe(item, cantidad);
      const quiere = cantidad - left;
      let porPoner = quiere;
      const max = stackMax(item);
      if (max > 1) for (const s of slots) {
        if (porPoner <= 0) break;
        if (s && s.item === item && s.cantidad < max) { const n = Math.min(max - s.cantidad, porPoner); s.cantidad += n; porPoner -= n; }
      }
      for (let i = 0; i < SLOTS && porPoner > 0; i++) {
        if (!slots[i]) { const n = Math.min(max, porPoner); slots[i] = { item, cantidad: n, ...nuevaInstancia(item, extra) }; porPoner -= n; }
      }
      left += porPoner;
      const added = cantidad - left;
      if (added > 0) {
        ctx.events.emit('item:added', { item, cantidad: added }); changed(); refreshEquipped();
        aprender(saber.verItem(item));
      }
      return left;
    },
    remove(item, cantidad = 1) {
      if (this.count(item) < cantidad) return false;
      let left = cantidad;
      for (let i = SLOTS - 1; i >= 0 && left > 0; i--) {
        const s = slots[i];
        if (!s || s.item !== item) continue;
        const n = Math.min(s.cantidad, left); s.cantidad -= n; left -= n;
        if (s.cantidad <= 0) slots[i] = null;
      }
      changed(); refreshEquipped();
      return true;
    },
    /** Saca una cantidad de una casilla y devuelve { item, cantidad, extra } (para entregarla a un animal, a un cofre…). */
    tomar(i, cantidad = null) {
      const s = slots[i]; if (!s) return null;
      const n = cantidad == null ? s.cantidad : Math.min(cantidad, s.cantidad);
      const out = { item: s.item, cantidad: n, extra: s.dur != null ? { dur: s.dur, cal: s.cal, rep: s.rep } : null };
      s.cantidad -= n; if (s.cantidad <= 0) slots[i] = null;
      changed(); refreshEquipped();
      return out;
    },
    /** Intercambia o fusiona dos casillas (solo se fusionan objetos apilables). */
    move(a, b) {
      if (a === b || a < 0 || b < 0 || a >= SLOTS || b >= SLOTS) return;
      const A = slots[a], B = slots[b];
      if (A && B && A.item === B.item && stackMax(A.item) > 1) {
        const n = Math.min(stackMax(A.item) - B.cantidad, A.cantidad);
        B.cantidad += n; A.cantidad -= n; if (A.cantidad <= 0) slots[a] = null;
      } else { slots[a] = B; slots[b] = A; }
      changed(); refreshEquipped();
    },
    /** Suelta parte de una casilla delante del jugador. */
    drop(i, cantidad = null) {
      const s = slots[i]; if (!s) return;
      const n = cantidad == null ? s.cantidad : Math.min(cantidad, s.cantidad);
      const extra = s.dur != null ? { dur: s.dur, cal: s.cal, rep: s.rep } : null;
      s.cantidad -= n; if (s.cantidad <= 0) slots[i] = null;
      const { origin, dir } = ctx.player.getLookRay();
      ctx.physics?.spawnProp?.('loot', origin.clone().addScaledVector(dir, 1.2), dir.clone().multiplyScalar(3).setY(2), { item: s.item, cantidad: n, extra, noPickup: 1.5 });
      changed(); refreshEquipped();
    },
    /** Primera casilla que contiene un objeto con la etiqueta (la de mejor calidad y desgaste primero). */
    mejorConEtiqueta(tag) {
      let best = -1, bs = -1;
      for (let i = 0; i < SLOTS; i++) {
        const s = slots[i]; if (!s || !ITEMS[s.item].etiquetas?.includes(tag)) continue;
        const sc = (CALIDADES[s.cal ?? 1].mult) * 10 + (s.dur ?? 0) / Math.max(1, durMaxDe(s.item, s.cal ?? 1, s.rep ?? 0));
        if (sc > bs) { bs = sc; best = i; }
      }
      return best;
    },
  };

  // ------------------------------------------------------------------ estadísticas
  const stats = { vida: 100, hambre: 100, sed: 100, energia: 100, oxigeno: 100, temperatura: 26 };
  let selected = 0;
  let equipped = null;
  let dead = false;
  let sprintTime = 0;

  function refreshEquipped() {
    const s = slots[selected];
    const it = s ? ITEMS[s.item] : null;
    const next = it && (it.tipo === 'herramienta' || it.tipo === 'arma') ? s.item : null;
    if (next !== survival.equipped) { survival.equipped = next; ctx.events.emit('equip:changed', { item: next }); }
    survival.selected = selected;
  }

  function select(i) {
    selected = clamp(i, 0, 8);
    refreshEquipped();
    changed();
  }

  function consume(i) {
    const s = slots[i]; if (!s) return false;
    const it = ITEMS[s.item];
    if (it.tipo === 'comida' || it.tipo === 'bebida') {
      stats.hambre = clamp(stats.hambre + (it.comida ?? 0), 0, 100);
      stats.sed = clamp(stats.sed + (it.sed ?? 0), 0, 100);
      if (it.vida) stats.vida = clamp(stats.vida + it.vida, 1, 100);
      inventory.remove(s.item, 1);
      ctx.audio?.play?.(it.tipo === 'bebida' ? 'beber' : 'comer');
      ctx.events.emit('ui:sound', { nombre: 'ui_click' });
      return true;
    }
    if (s.item === 'fogata') return campfires.placeFromPlayer();
    if (it.tipo === 'ropa') return equipar(i);
    if (it.tipo === 'herramienta' || it.tipo === 'arma') { if (i < 9) select(i); return true; }
    return false;
  }

  /** Puntos de armadura, abrigo y modificadores de ruido de la ropa puesta. */
  function armadura() { let n = 0; for (const r of RANURAS) { const e = equipo[r]; if (e) n += (ITEMS[e.item].armadura ?? 0) * (CALIDADES[e.cal ?? 1].mult); } return n; }
  function abrigo() { let n = 0; for (const r of RANURAS) { const e = equipo[r]; if (e) n += (ITEMS[e.item].abrigo ?? 0) * (CALIDADES[e.cal ?? 1].mult); } return n; }
  function ruidoMul() { let m = 1; for (const r of RANURAS) { const e = equipo[r]; if (e) m *= ITEMS[e.item].ruido ?? 1; } return m; }
  const impermeable = () => RANURAS.some((r) => equipo[r] && ITEMS[equipo[r].item].impermeable);

  /** `opts.armadura`: el daño viene de una criatura y la ropa lo amortigua (el frío, el hambre o las caídas no). */
  function damage(cantidad, fuente = 'desconocido', opts = null) {
    if (dead || cantidad <= 0 || ctx.state === 'menu') return;
    if (opts?.armadura) {
      const A = armadura();
      if (A > 0) {
        const bruto = cantidad;
        cantidad = bruto * (1 - A / (A + 30));
        const puestas = RANURAS.filter((r) => equipo[r] && (ITEMS[equipo[r].item].armadura ?? 0) > 0);
        if (puestas.length) { const r = puestas[Math.floor(Math.random() * puestas.length)]; desgastarRanura(r, Math.max(1, bruto / 14)); }
      }
    }
    stats.vida = Math.max(0, stats.vida - cantidad);
    ctx.events.emit('player:damage', { cantidad, fuente });
    ctx.audio?.play?.('dano');
    if (stats.vida <= 0) die(fuente);
  }

  let bag = null;
  function die(causa) {
    if (dead) return;
    dead = true;
    // la bolsa con las pertenencias queda en el lugar de la muerte
    const items = slots.filter(Boolean).map((s) => ({ ...s }));
    for (const r of RANURAS) if (equipo[r]) { items.push({ item: equipo[r].item, cantidad: 1, dur: equipo[r].dur, cal: equipo[r].cal, rep: equipo[r].rep }); equipo[r] = null; }
    if (items.length) {
      const pos = ctx.player.position.clone();
      bag?.unregister?.();
      const unregister = ctx.player.registerInteractable({
        id: 'bolsa', position: pos.clone().setY(pos.y + 0.4), radius: 2.2, label: 'Bolsa de pertenencias',
        getPrompt: () => 'Recoger pertenencias',
        onInteract: () => {
          for (const s of items) { const left = inventory.add(s.item, s.cantidad, s); if (left > 0) ctx.physics?.spawnProp?.('loot', ctx.player.position.clone().setY(ctx.player.position.y + 1), new THREE.Vector3(0, 3, 0), { item: s.item, cantidad: left, extra: s.dur != null ? { dur: s.dur, cal: s.cal, rep: s.rep } : null }); }
          unregister(); bag = null; ctx.ui?.notify?.('Recuperaste tus pertenencias', 'ok');
        },
      });
      bag = { unregister, mesh: null };
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.95 }));
      mesh.position.copy(pos).setY(world.getHeight(pos.x, pos.z) + 0.3); mesh.castShadow = true; ctx.scene.add(mesh);
      ctx.lighting?.setupMaterial?.(mesh.material);
      bag.mesh = mesh;
      const old = unregister;
      bag.unregister = () => { old(); ctx.scene.remove(mesh); };
      for (let i = 0; i < SLOTS; i++) slots[i] = null;
      changed(); refreshEquipped();
    }
    ctx.events.emit('player:died', { causa });
    ctx.audio?.play?.('muerte');
    save(true);
  }

  function respawn() {
    if (!dead) return;
    dead = false;
    Object.assign(stats, { vida: 70, hambre: 70, sed: 70, energia: 80, oxigeno: 100 });
    ctx.events.emit('player:respawn', { position: world.spawn.clone() });
  }

  // ------------------------------------------------------------------ desgaste, equipo y armas
  const avisar = (txt, tipo = 'info') => ctx.ui?.notify?.(txt, tipo);
  function romper(item) {
    ctx.events.emit('item:roto', { item });
    ctx.audio?.play?.('rotura');
    avisar(`Se rompió: ${ITEMS[item].nombre}`, 'warn');
  }
  /** Resta usos a una casilla del inventario. Devuelve true si el objeto se rompió. */
  function desgastar(i, n = 1) {
    const s = slots[i]; if (!s || s.dur == null) return false;
    s.dur -= n;
    if (s.dur <= 0) { const id = s.item; slots[i] = null; changed(); refreshEquipped(); romper(id); return true; }
    if (Math.floor((s.dur + n) / 10) !== Math.floor(s.dur / 10)) changed();
    return false;
  }
  function desgastarRanura(r, n = 1) {
    const e = equipo[r]; if (!e) return false;
    e.dur -= n;
    if (e.dur <= 0) { const id = e.item; equipo[r] = null; changed(); romper(id); return true; }
    return false;
  }
  /** Desgasta lo que lleva en la mano (herramienta o arma) tras un uso. */
  function desgastarMano(n = 1) { const s = slots[selected]; if (!s || s.dur == null) return false; return desgastar(selected, n); }

  function equipar(i) {
    const s = slots[i]; if (!s) return false;
    const it = ITEMS[s.item]; if (it.tipo !== 'ropa') return false;
    const r = it.ranura, previo = equipo[r];
    slots[i] = null; // se libera antes: el objeto previo ocupa su lugar
    equipo[r] = { item: s.item, dur: s.dur, cal: s.cal, rep: s.rep };
    if (previo) { const left = inventory.add(previo.item, 1, previo); if (left > 0) { equipo[r] = previo; slots[i] = s; avisar('No hay sitio en la mochila', 'warn'); return false; } }
    ctx.events.emit('equipo:cambio', { ranura: r, item: s.item });
    ctx.events.emit('ui:sound', { nombre: 'ui_click' });
    changed(); refreshEquipped(); return true;
  }
  function desequipar(r) {
    const e = equipo[r]; if (!e) return false;
    if (inventory.cabe(e.item, 1) < 1) { avisar('No hay sitio en la mochila', 'warn'); return false; }
    equipo[r] = null; // para que la capacidad de la mochila puesta no cuente al comprobar
    const left = inventory.add(e.item, 1, e);
    if (left > 0) { equipo[r] = e; avisar('No hay sitio en la mochila', 'warn'); return false; }
    ctx.events.emit('equipo:cambio', { ranura: r, item: null }); changed(); return true;
  }

  /** Saca de la mano el objeto seleccionado (para arrojarlo) y devuelve su casilla. */
  function tomarMano() { const s = slots[selected]; if (!s) return null; slots[selected] = null; changed(); refreshEquipped(); return s; }

  /** Estadísticas del arma o herramienta en la mano (puños si no lleva nada). */
  function weaponStats() {
    const s = slots[selected], it = s ? ITEMS[s.item] : null;
    if (!it || !(it.tipo === 'herramienta' || it.tipo === 'arma')) return { item: null, dano: 4, cd: 0.7, alcance: 0, penetra: 0, aturde: 0, tags: [], cal: 1, distancia: false };
    const q = CALIDADES[s.cal ?? 1].mult;
    return { item: s.item, slot: selected, dano: (it.dano ?? 4) * (it.dur ? q : 1), cd: it.cd ?? 0.55, alcance: it.alcance ?? 0, penetra: it.penetra ?? 0, aturde: it.aturde ?? 0, tags: it.etiquetas ?? [], cal: s.cal ?? 1, distancia: !!it.distancia, talar: it.talar ?? 0, picar: it.picar ?? 0 };
  }
  /** Munición de la clase pedida: casilla con la mejor (más daño). */
  function municion(clase) {
    let best = -1, bd = -1;
    for (let i = 0; i < SLOTS; i++) { const s = slots[i]; if (s && ITEMS[s.item].tipo === 'municion' && ITEMS[s.item].clase === clase && ITEMS[s.item].dano > bd) { bd = ITEMS[s.item].dano; best = i; } }
    return best;
  }

  /** Repara el objeto de una casilla con los materiales de su ficha; cada reparación resta un 10 % de durabilidad máxima (hasta 4). */
  function reparar(i) {
    const s = slots[i]; if (!s || s.dur == null) return false;
    const it = ITEMS[s.item];
    if (!it.reparar) { avisar('Eso no se puede reparar', 'warn'); return false; }
    if ((s.rep ?? 0) >= 4) { avisar('Ya está demasiado remendado', 'warn'); return false; }
    const max = durMaxDe(s.item, s.cal ?? 1, s.rep ?? 0);
    if (s.dur >= max * 0.95) { avisar('No necesita reparación', 'info'); return false; }
    for (const [m, n] of Object.entries(it.reparar)) if (inventory.count(m) < n) { ctx.events.emit('ui:sound', { nombre: 'ui_error' }); avisar(`Necesitas ${n} × ${ITEMS[m].nombre}`, 'warn'); return false; }
    for (const [m, n] of Object.entries(it.reparar)) inventory.remove(m, n);
    s.rep = (s.rep ?? 0) + 1;
    s.dur = Math.min(durMaxDe(s.item, s.cal ?? 1, s.rep), s.dur + durMaxDe(s.item, s.cal ?? 1, s.rep) * 0.4);
    changed(); ctx.audio?.play?.('craft');
    return true;
  }

  // ------------------------------------------------------------------ crafteo
  /** Etiquetas de las herramientas que lleva en la mochila (y la mejor calidad para cada una). */
  function etiquetasMochila() {
    const out = new Map();
    for (const s of slots) if (s && ITEMS[s.item].etiquetas) for (const t of ITEMS[s.item].etiquetas) { const q = CALIDADES[s.cal ?? 1].mult; if (!out.has(t) || out.get(t) < q) out.set(t, q); }
    return out;
  }
  function recipeInfo(r) {
    const faltan = {};
    for (const [item, n] of Object.entries(r.costo)) { const have = inventory.count(item); if (have < n) faltan[item] = n - have; }
    const estacionOk = !r.estacion || campfires.nearLit(ctx.player.position, 5);
    const herramientaOk = !r.herramienta || inventory.mejorConEtiqueta(r.herramienta) >= 0;
    const nivelOk = saber.nivel(r.hab.tipo) >= r.hab.nivel;
    const conocida = saber.conoce(r.clave);
    const motivo = !conocida ? 'desconocida' : Object.keys(faltan).length ? 'materiales' : !estacionOk ? 'estacion' : !herramientaOk ? 'herramienta' : !nivelOk ? 'nivel' : '';
    return { ...r, nombre: ITEMS[r.id].nombre, faltan, estacionOk, herramientaOk, nivelOk, conocida, motivo, posible: motivo === '' };
  }
  const MOTIVOS = { desconocida: 'Todavía no sabes fabricar esto', materiales: 'Te faltan materiales', estacion: 'Necesitas una fogata encendida cerca', herramienta: 'Te falta una herramienta', nivel: 'Tu oficio todavía no alcanza' };
  function craft(clave) {
    const r = RECIPES.find((x) => x.clave === clave) ?? RECIPES.find((x) => x.id === clave && saber.conoce(x.clave)) ?? RECIPES.find((x) => x.id === clave);
    if (!r) return false;
    const info = recipeInfo(r);
    if (!info.posible) {
      ctx.events.emit('ui:sound', { nombre: 'ui_error' });
      const extra = info.motivo === 'herramienta' ? `: ${r.herramienta === 'corta' ? 'algo que corte' : r.herramienta === 'perfora' ? 'un punzón' : r.herramienta}` : info.motivo === 'nivel' ? `: ${HABILIDADES[r.hab.tipo].nombre} nivel ${r.hab.nivel}` : '';
      avisar(`${MOTIVOS[info.motivo]}${extra}`, 'warn'); return false;
    }
    // espacio: el resultado tiene que caber (los materiales se liberan antes)
    for (const [item, n] of Object.entries(r.costo)) inventory.remove(item, n);
    if (inventory.cabe(r.id, r.cantidad) < r.cantidad) {
      for (const [item, n] of Object.entries(r.costo)) inventory.add(item, n); // devuelve los materiales
      ctx.events.emit('ui:sound', { nombre: 'ui_error' }); avisar('No tienes sitio para llevar eso', 'warn'); return false;
    }
    // herramienta usada: desgaste de 1 uso
    if (r.herramienta) { const i = inventory.mejorConEtiqueta(r.herramienta); if (i >= 0) desgastar(i, 1); }
    const cal = ITEMS[r.id].dur ? tirarCalidad(saber.nivel(r.hab.tipo), r.hab.nivel) : 1;
    const left = inventory.add(r.id, r.cantidad, ITEMS[r.id].dur ? { cal } : null);
    if (left > 0) ctx.physics?.spawnProp?.('loot', ctx.player.position.clone().setY(ctx.player.position.y + 1), new THREE.Vector3(0, 3, 0), { item: r.id, cantidad: left });
    // experiencia y descubrimientos
    const g = saber.ganar(r.hab.tipo, r.xp);
    if (g.subio) { ctx.events.emit('saber:nivel', { hab: r.hab.tipo, nivel: g.nivel, nombre: HABILIDADES[r.hab.tipo].nombre }); aprender(g.nuevas); }
    aprender(saber.fabricar(r.id));
    ctx.events.emit('ui:sound', { nombre: 'craft' });
    ctx.audio?.play?.('craft');
    ctx.events.emit('crafted', { item: r.id, clave: r.clave, cal, cantidad: r.cantidad });
    return true;
  }

  // ------------------------------------------------------------------ aprovechamiento de cadáveres
  /** Despieza una criatura muerta: usa las herramientas de la mochila, aplica lo devorado, da experiencia y recetas. Devuelve los objetos obtenidos. */
  function cosechar(especie, comido = 0) {
    const tags = [...etiquetasMochila().keys()];
    const iCorta = inventory.mejorConEtiqueta('corta');
    const calidad = iCorta >= 0 ? CALIDADES[slots[iCorta].cal ?? 1].mult : 1;
    const res = despiezarTabla(especie, tags, calidad, comido, saber.nivel('cuero'));
    // desgaste de la herramienta de corte (y del hacha si hizo falta)
    if (iCorta >= 0) desgastar(iCorta, 2);
    if (res.items.some((x) => ['osteodermo', 'cuerno'].includes(x.item))) { const ih = inventory.mejorConEtiqueta('talar'); if (ih >= 0) desgastar(ih, 2); }
    for (const d of res.items) {
      const left = inventory.add(d.item, d.cantidad);
      if (left > 0) ctx.physics?.spawnProp?.('loot', ctx.player.position.clone().setY(ctx.player.position.y + 1), new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2), { item: d.item, cantidad: left, noPickup: 0.6 });
    }
    const g = saber.ganar('cuero', iCorta >= 0 ? 3 : 1);
    if (g.subio) { ctx.events.emit('saber:nivel', { hab: 'cuero', nivel: g.nivel, nombre: HABILIDADES.cuero.nombre }); aprender(g.nuevas); }
    aprender(saber.despiece(especie));
    ctx.events.emit('despiece', { especie, items: res.items, perdidos: res.perdidos });
    return res;
  }

  // ------------------------------------------------------------------ guardado
  function snapshot() {
    return {
      v: 2, fecha: Date.now(),
      stats: { ...stats }, slots: slots.map((s) => (s ? { ...s } : null)), selected,
      equipo: Object.fromEntries(RANURAS.map((r) => [r, equipo[r] ? { ...equipo[r] } : null])), saber: saber.serialize(),
      hora: ctx.time.hour, elapsed: ctx.time.elapsed,
      pos: [ctx.player.position.x, ctx.player.position.z], yaw: ctx.player.yaw,
      fogatas: campfires.serialize(), tutorial: tutorial.step,
      fauna: ctx.fauna?.serializar?.() ?? [], // animales propios y habituados (la fauna salvaje no se guarda)
    };
  }
  function save(silent = false) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); if (!silent) ctx.ui?.notify?.('Partida guardada', 'ok'); return true; } catch { return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (!d || (d.v !== 1 && d.v !== 2)) return false;
      Object.assign(stats, d.stats, { vida: Math.max(15, d.stats.vida) });
      // v1 (partida anterior a la ampliación): sin ropa, durabilidad ni conocimiento → se migra con valores por defecto
      for (let i = 0; i < SLOTS; i++) {
        const sv = d.slots?.[i];
        slots[i] = sv && ITEMS[sv.item] ? { ...sv, ...(ITEMS[sv.item].dur ? nuevaInstancia(sv.item, sv) : {}) } : null;
      }
      for (const r of RANURAS) { const e = d.equipo?.[r]; equipo[r] = e && ITEMS[e.item]?.ranura === r ? { ...e, ...nuevaInstancia(e.item, e) } : null; }
      saber.restore(d.saber ?? null);
      for (const sl of slots) if (sl) saber.verItem(sl.item); // v1: lo que ya llevaba cuenta como visto
      saber.evaluar();
      selected = d.selected ?? 0;
      ctx.time.hour = d.hora ?? ctx.time.hour; ctx.time.elapsed = d.elapsed ?? 0;
      ctx.player.teleport(d.pos[0], d.pos[1]);
      if (d.yaw != null) ctx.player.yaw = d.yaw;
      campfires.restore(d.fogatas ?? []);
      ctx.fauna?.restaurar?.(d.fauna ?? []);
      tutorial.step = d.tutorial ?? 0;
      dead = false; changed(); refreshEquipped();
      return true;
    } catch { return false; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* sin almacenamiento */ } }
  function newGame() {
    Object.assign(stats, { vida: 100, hambre: 100, sed: 100, energia: 100, oxigeno: 100, temperatura: 26 });
    for (let i = 0; i < SLOTS; i++) slots[i] = null;
    for (const r of RANURAS) equipo[r] = null;
    saber.reset();
    selected = 0; dead = false; tutorial.step = 0;
    campfires.restore([]);
    ctx.fauna?.restaurar?.([]); // quita los animales propios de la partida anterior
    ctx.player.teleport(world.spawn.x, world.spawn.z);
    ctx.time.hour = ctx.config.time.startHour;
    changed(); refreshEquipped();
  }

  // ------------------------------------------------------------------ API pública
  const survival = (ctx.survival = {
    stats, inventory, equipped: null, selected: 0, slots, equipo, saber,
    get dead() { return dead; },
    recipes: RECIPES,
    recipeInfo, craft, select, consume, use: consume, damage, respawn,
    equipar, desequipar, desgastar, desgastarMano, desgastarRanura, reparar, weaponStats, municion, cosechar, tomarMano,
    armadura, abrigo, durMaxDe, estadoDe: (s) => (s?.dur != null ? estadoDur(s.dur / Math.max(1, durMaxDe(s.item, s.cal ?? 1, s.rep ?? 0))) : null),
    get ruidoMul() { return ruidoMul(); },
    save, load, hasSave, clearSave, newGame,
    drink(cantidad = 20) {
      stats.sed = clamp(stats.sed + cantidad, 0, 100);
      if (survival.equipped === 'cantimplora') inventory.add('agua', 1);
      ctx.events.emit('ui:sound', { nombre: 'beber' });
      ctx.audio?.play?.('beber');
    },
    heal(n) { stats.vida = clamp(stats.vida + n, 0, 100); },
    nearFire(pos = ctx.player.position, r = 8) { return campfires.nearLit(pos, r); },
  });

  const campfires = createCampfires(ctx, inventory);
  const tutorial = { step: 0 };
  survival.tutorial = tutorial;
  survival.fires = () => campfires.list.map((f) => ({ x: f.x, z: f.z, lit: f.fuel > 0 }));
  survival.campfires = campfires; // (pruebas y capturas: colocar fogatas directamente)

  // ------------------------------------------------------------------ entrada
  ctx.events.on('input:action', ({ action, pressed, index }) => {
    if (!pressed || ctx.state !== 'playing' || ctx.ui?.blocksInput) return;
    if (action === 'hotbar') {
      if (index === selected && slots[index] && ITEMS[slots[index].item].tipo !== 'herramienta' && ITEMS[slots[index].item].tipo !== 'arma') consume(index);
      else select(index);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat && ctx.state === 'playing' && !ctx.ui?.blocksInput) consume(selected);
  });
  window.addEventListener('wheel', (e) => {
    if (ctx.state !== 'playing' || ctx.ui?.blocksInput || !document.pointerLockElement) return;
    select((selected + (e.deltaY > 0 ? 1 : 8)) % 9);
  }, { passive: true });
  ctx.events.on('player:respawn', () => { bag?.unregister?.(); /* la bolsa queda hasta recogerla */ });

  // Recoger cosas del suelo hace sonido
  ctx.events.on('item:added', () => { ctx.audio?.play?.('recoger'); });

  // ------------------------------------------------------------------ bucle
  let saveTimer = 0;
  // La llama de la antorcha en mano la crea el viewmodel (player/viewmodel.js).

  function simulate(dt) {
    const p = ctx.player;
    const w = ctx.time.weather;
    // temperatura ambiente "sentida"
    const h = world.getHeight(p.position.x, p.position.z);
    let tAmb = 14 + 14 * (1 - ctx.time.nightFactor);
    tAmb -= Math.max(0, h - 25) * 0.075;
    tAmb -= (w.rain * 5 + w.storm * 3) * (impermeable() ? 0.4 : 1);
    if (p.inWater) tAmb -= 7;
    const fire = campfires.heatAt(p.position);
    tAmb += fire * 16 + (survival.equipped === 'antorcha' ? 2 : 0);
    const ab = abrigo(); // la ropa solo ayuda cuando hace frío y estorba un poco con calor
    if (tAmb < 20) tAmb += Math.min(ab, 20 - tAmb); else if (tAmb > 30) tAmb += ab * 0.15;
    stats.temperatura += (tAmb - stats.temperatura) * Math.min(1, dt * 0.25);

    // consumo
    const moving = Math.hypot(p.velocity.x, p.velocity.z) > 0.6;
    const sprinting = p.sprinting && moving;
    const hot = stats.temperatura > 36 ? 1.8 : 1;
    stats.hambre = Math.max(0, stats.hambre - dt * (0.055 + (sprinting ? 0.05 : 0)));
    stats.sed = Math.max(0, stats.sed - dt * (0.085 + (sprinting ? 0.08 : 0)) * hot);
    if (sprinting) { stats.energia = Math.max(0, stats.energia - dt * 3.2); sprintTime += dt; }
    else { stats.energia = Math.min(100, stats.energia + dt * (moving ? 0.9 : 2.4)); sprintTime = 0; }
    stats.energia = Math.max(0, stats.energia - dt * 0.01);

    // oxígeno
    const under = ctx.camera.position.y < (world.seaLevel + (world.water?.getWaveHeight?.(p.position.x, p.position.z, ctx.time.elapsed) ?? 0) - 0.05);
    if (under) stats.oxigeno = Math.max(0, stats.oxigeno - dt * 6);
    else stats.oxigeno = Math.min(100, stats.oxigeno + dt * 35);

    // salud
    let dv = 0;
    if (stats.hambre <= 0) dv -= 0.9;
    if (stats.sed <= 0) dv -= 1.4;
    if (stats.temperatura < 9) dv -= (9 - stats.temperatura) * 0.12;
    if (stats.oxigeno <= 0) dv -= 9;
    if (dv < 0) { stats.vida = Math.max(0, stats.vida + dv * dt); if (stats.vida <= 0) die(stats.oxigeno <= 0 ? 'Ahogamiento' : stats.sed <= 0 ? 'Sed' : stats.hambre <= 0 ? 'Hambre' : 'Frío'); }
    else if (stats.hambre > 45 && stats.sed > 45 && stats.vida < 100 && !under) stats.vida = Math.min(100, stats.vida + dt * (0.6 + (fire > 0 ? 0.4 : 0)));

    // la fatiga limita el sprint
    // la carga lenta: hasta la capacidad no pesa; por encima se pierde hasta un 45 % de velocidad
    const ratio = peso() / capacidad().peso, wf = ratio <= 1 ? 1 : Math.max(0.55, 1 - (ratio - 1) * 0.75);
    survival.cargaFactor = wf;
    cfgPlayer.sprintSpeed = baseSprint * (stats.energia > 12 ? 1 : 0.62) * wf;
    cfgPlayer.walkSpeed = baseWalk * (stats.vida < 25 ? 0.85 : 1) * wf;
  }

  return {
    name: 'survival',
    update(dt) {
      if (ctx.state === 'playing' && !dead && dt > 0) {
        simulate(dt);
        saveTimer += dt;
        if (saveTimer > 25) { saveTimer = 0; save(true); }
      }
      campfires.update(dt);
    },
  };
}
