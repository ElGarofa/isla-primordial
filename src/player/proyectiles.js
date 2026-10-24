// Proyectiles del jugador: flechas, guijarros de honda y jabalinas. Balística simple (gravedad), impacto contra criaturas, flora y terreno.
// La munición que no se rompe queda en el suelo como botín recogible (con el desgaste que le quede si es una jabalina).
import * as THREE from 'three';
import { ITEMS } from '../core/items.js';

const MAX = 24;
const G = 9.8;

export function createProyectiles(ctx) {
  const group = new THREE.Group(); group.name = 'proyectiles'; ctx.scene.add(group);
  const lista = [];
  const geos = {}, mats = {};
  const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _n = new THREE.Vector3();

  function malla(clase) {
    if (!geos[clase]) {
      if (clase === 'flecha') { const g = new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5); g.rotateX(Math.PI / 2); geos[clase] = g; mats[clase] = new THREE.MeshStandardMaterial({ color: 0xb58a52, roughness: 0.8 }); }
      else if (clase === 'jabalina') { const g = new THREE.CylinderGeometry(0.014, 0.012, 1.5, 6); g.rotateX(Math.PI / 2); geos[clase] = g; mats[clase] = new THREE.MeshStandardMaterial({ color: 0x8a6034, roughness: 0.85 }); }
      else { geos[clase] = new THREE.SphereGeometry(0.035, 8, 6); mats[clase] = new THREE.MeshStandardMaterial({ color: 0x8f8c85, roughness: 0.9 }); }
      ctx.lighting?.setupMaterial?.(mats[clase]);
    }
    const m = new THREE.Mesh(geos[clase], mats[clase]); m.castShadow = false; return m;
  }

  function quitar(i) { const p = lista[i]; group.remove(p.mesh); lista.splice(i, 1); }

  /** Suelta el objeto como botín en el punto (si no se rompe). */
  function soltar(p, pos) {
    const it = ITEMS[p.item];
    const extra = it.dur ? { dur: Math.max(1, p.dur ?? it.dur), cal: p.cal ?? 1, rep: p.rep ?? 0 } : null;
    if (!it.dur && Math.random() < p.rotura) { ctx.events.emit('proyectil:roto', { item: p.item, position: pos.clone() }); ctx.audio?.play?.('rotura', pos); return false; }
    const gy = ctx.world.getHeight(pos.x, pos.z);
    ctx.physics?.spawnProp?.('loot', new THREE.Vector3(pos.x, Math.max(pos.y, gy) + 0.25, pos.z), new THREE.Vector3(0, 0.6, 0), { item: p.item, cantidad: 1, extra, noPickup: 0.8 });
    return true;
  }

  return {
    get count() { return lista.length; },
    lista,
    /** opts: origin, dir (unitario), vel, dano, item (munición o jabalina), clase, rotura, penetra, arma, dur, cal, rep */
    disparar(o) {
      if (lista.length >= MAX) quitar(0);
      const clase = o.clase ?? 'flecha';
      const mesh = malla(clase);
      mesh.position.copy(o.origin);
      const vel = o.dir.clone().multiplyScalar(o.vel);
      mesh.lookAt(o.origin.clone().add(vel)); group.add(mesh);
      const p = { mesh, pos: o.origin.clone(), vel, dano: o.dano, item: o.item, clase, rotura: o.rotura ?? 0.3, penetra: o.penetra ?? 0, arma: o.arma ?? null, dur: o.dur, cal: o.cal, rep: o.rep, vida: 0, caza: o.caza ?? false };
      lista.push(p);
      ctx.events.emit('proyectil:disparado', { item: o.item, arma: o.arma, position: o.origin.clone() });
      return p;
    },
    update(dt) {
      if (dt <= 0) return;
      const world = ctx.world;
      for (let i = lista.length - 1; i >= 0; i--) {
        const p = lista[i];
        p.vida += dt;
        if (p.vida > 7) { quitar(i); continue; }
        // sub-pasos de ≤ 1 m para no atravesar nada
        const rapidez = p.vel.length(), pasos = Math.max(1, Math.ceil((rapidez * dt) / 1));
        const h = dt / pasos;
        let fin = false;
        for (let k = 0; k < pasos && !fin; k++) {
          _o.copy(p.pos);
          p.vel.y -= G * h;
          p.pos.addScaledVector(p.vel, h);
          const seg = Math.max(1e-4, _o.distanceTo(p.pos));
          _d.copy(p.pos).sub(_o).divideScalar(seg);
          // criaturas
          const fa = ctx.fauna?.pick?.(_o, _d, seg);
          if (fa?.criatura && !fa.criatura.muerta) {
            const c = fa.criatura;
            ctx.fauna.damage(c, p.dano, 'jugador', { penetra: p.penetra });
            ctx.events.emit('proyectil:impacto', { en: 'criatura', especie: c.especie, item: p.item, dano: p.dano, position: fa.point });
            ctx.survival?.saber?.ganar?.('caza', 1.2);
            if (p.clase === 'jabalina') p.dur = (p.dur ?? 20) - 3; // el golpe también la gasta
            if (p.dur != null && p.dur <= 0) ctx.events.emit('item:roto', { item: p.item }); else soltar(p, fa.point);
            fin = true; break;
          }
          // árboles y rocas
          const fl = ctx.flora?.pick?.(_o, _d, seg);
          if (fl) { ctx.events.emit('proyectil:impacto', { en: 'flora', item: p.item, position: fl.position ?? p.pos }); if (p.dur != null) p.dur -= 1; ctx.audio?.play?.('golpe_madera', p.pos, { v: 0.6 }); soltar(p, p.pos); fin = true; break; }
          // agua / terreno
          if (p.pos.y < world.seaLevel) { ctx.events.emit('proyectil:impacto', { en: 'agua', item: p.item, position: p.pos.clone() }); fin = true; break; }
          const gy = world.getHeight(p.pos.x, p.pos.z);
          if (p.pos.y <= gy + 0.02) { p.pos.y = gy + 0.02; ctx.events.emit('proyectil:impacto', { en: 'suelo', item: p.item, position: p.pos.clone() }); if (p.dur != null) p.dur -= 1; soltar(p, p.pos); fin = true; break; }
        }
        if (fin) { quitar(i); continue; }
        p.mesh.position.copy(p.pos);
        _n.copy(p.vel); if (_n.lengthSq() > 1e-4) p.mesh.lookAt(p.pos.x + _n.x, p.pos.y + _n.y, p.pos.z + _n.z);
      }
    },
  };
}
