// Fogatas: se colocan con el objeto 'fogata'; dan calor y luz, cocinan carne y se apagan si no se les echa leña.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const MAX_FUEL = 720; // s
const WOOD_FUEL = 150;

function buildMesh() {
  const g = new THREE.Group();
  const rnd = mulberry32(77);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95, flatShading: true });
  const stoneGeo = new THREE.DodecahedronGeometry(0.16, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.2;
    const m = new THREE.Mesh(stoneGeo, stoneMat);
    m.position.set(Math.cos(a) * 0.46, 0.08, Math.sin(a) * 0.46);
    m.scale.set(0.9 + rnd() * 0.7, 0.7 + rnd() * 0.6, 0.9 + rnd() * 0.7);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  const logMat = new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 1 });
  const logGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.8, 7);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(logGeo, logMat);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    m.position.set(Math.cos(a) * 0.12, 0.18, Math.sin(a) * 0.12);
    m.rotation.set(Math.PI / 2 - 0.45, 0, -a + Math.PI / 2, 'YXZ');
    m.lookAt(0, 0.05, 0);
    m.rotateX(Math.PI / 2);
    m.castShadow = true; g.add(m);
  }
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 1 });
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), ashMat);
  ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02; ash.receiveShadow = true; g.add(ash);
  g.userData.mats = [stoneMat, logMat, ashMat];
  return g;
}

export function createCampfires(ctx, inventory) {
  const list = [];
  const group = new THREE.Group(); group.name = 'fogatas'; ctx.scene.add(group);
  let cooking = null; // { fire, t }

  function add(x, z, fuel = 360) {
    const y = ctx.world.getHeight(x, z);
    const mesh = buildMesh();
    mesh.position.set(x, y, z);
    for (const m of mesh.userData.mats) ctx.lighting?.setupMaterial?.(m);
    group.add(mesh);
    const f = { x, z, y, mesh, fuel, fire: null, off: null };
    f.pos = new THREE.Vector3(x, y + 0.25, z);
    f.unregister = ctx.player.registerInteractable({
      id: 'fogata', position: new THREE.Vector3(x, y + 0.3, z), radius: 2.4, label: 'Fogata',
      getPrompt: () => {
        if (f.fuel <= 0) return inventory.has('madera') ? 'Echar leña y encender' : 'Fogata apagada (necesitas madera)';
        if (inventory.has('carne_cruda')) return 'Cocinar carne';
        return inventory.has('madera') && f.fuel < MAX_FUEL - WOOD_FUEL ? 'Echar leña' : `Fogata (${Math.ceil(f.fuel / 60)} min)`;
      },
      onInteract: () => interact(f),
    });
    list.push(f);
    light(f);
    return f;
  }

  function light(f) {
    if (f.fuel > 0 && !f.fire) f.fire = ctx.fx?.createFire?.(f.pos, { escala: 1, luz: true, intensidad: 1 }) ?? null;
    if (f.fuel <= 0 && f.fire) { f.fire.dispose(); f.fire = null; ctx.fx?.emit?.('humo', f.pos, { cantidad: 8 }); }
  }

  function interact(f) {
    if (f.fuel > 0 && inventory.has('carne_cruda')) {
      inventory.remove('carne_cruda', 1);
      ctx.ui?.notify?.('Cocinando carne…', 'info');
      cooking = { f, t: 3.5 };
      return;
    }
    if (inventory.has('madera') && f.fuel < MAX_FUEL - 20) {
      inventory.remove('madera', 1);
      f.fuel = Math.min(MAX_FUEL, f.fuel + WOOD_FUEL);
      light(f);
      ctx.events.emit('ui:sound', { nombre: 'fogata_encender' });
      ctx.audio?.play?.('fogata_encender', f.pos);
    } else ctx.events.emit('ui:sound', { nombre: 'ui_error' });
  }

  function placeFromPlayer() {
    const { origin, dir } = ctx.player.getLookRay();
    const hit = ctx.world.raycastTerrain?.(origin, dir, 5.5);
    const p = hit?.point ?? origin.clone().addScaledVector(dir, 2.2);
    if (ctx.world.isWater(p.x, p.z) || ctx.world.getHeight(p.x, p.z) < 0.8) { ctx.ui?.notify?.('No puedes encender fuego aquí', 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); return false; }
    if (ctx.world.getSlope(p.x, p.z) > 0.55) { ctx.ui?.notify?.('El suelo es demasiado inclinado', 'warn'); return false; }
    if (list.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 1.5)) return false;
    if (!inventory.remove('fogata', 1)) return false;
    add(p.x, p.z, 300);
    ctx.events.emit('fogata:colocada', { x: p.x, z: p.z });
    ctx.events.emit('ui:sound', { nombre: 'fogata_encender' });
    ctx.audio?.play?.('fogata_encender', p);
    return true;
  }

  return {
    list,
    placeFromPlayer,
    nearLit(pos, r = 5) { for (const f of list) if (f.fuel > 0 && Math.hypot(f.x - pos.x, f.z - pos.z) < r) return true; return false; },
    /** Calor 0..1 en una posición (para la temperatura). */
    heatAt(pos) { let h = 0; for (const f of list) if (f.fuel > 0) { const d = Math.hypot(f.x - pos.x, f.z - pos.z); if (d < 9) h = Math.max(h, 1 - d / 9); } return h; },
    serialize() { return list.map((f) => ({ x: f.x, z: f.z, fuel: Math.round(f.fuel) })); },
    restore(arr) {
      for (const f of list) { f.unregister(); f.fire?.dispose(); group.remove(f.mesh); }
      list.length = 0;
      for (const d of arr) add(d.x, d.z, d.fuel);
    },
    update(dt) {
      if (dt <= 0) return;
      for (const f of list) {
        if (f.fuel > 0) {
          const rainy = ctx.time.weather.rain > 0.5 ? 1 + ctx.time.weather.rain * 1.5 : 1;
          f.fuel = Math.max(0, f.fuel - dt * rainy);
          if (f.fuel <= 0) light(f);
          else if (f.fire?.setIntensity) f.fire.setIntensity(0.6 + Math.min(1, f.fuel / 60) * 0.4);
        }
      }
      if (cooking) {
        cooking.t -= dt;
        if (cooking.f.fuel <= 0) cooking = null;
        else if (cooking.t <= 0) { inventory.add('carne_cocida', 1); ctx.events.emit('ui:sound', { nombre: 'craft' }); cooking = null; }
      }
    },
  };
}
