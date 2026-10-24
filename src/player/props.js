// Físicas ligeras para objetos sueltos (ctx.physics): troncos, piedras, cocos y botín. Esferas/cilindros contra el terreno.
import * as THREE from 'three';

const KINDS = {
  loot: { r: 0.18, mass: 1, restitution: 0.35, color: 0xc9a86a, geo: () => new THREE.IcosahedronGeometry(0.18, 1) },
  piedra: { r: 0.22, mass: 3, restitution: 0.25, color: 0x77726a, geo: () => new THREE.DodecahedronGeometry(0.22, 0) },
  coco: { r: 0.14, mass: 1, restitution: 0.4, color: 0x5a3d22, geo: () => new THREE.SphereGeometry(0.14, 12, 10) },
  tronco: { r: 0.22, mass: 8, restitution: 0.12, color: 0x6b4a2c, geo: () => new THREE.CylinderGeometry(0.2, 0.22, 1.6, 12).rotateZ(Math.PI / 2) },
};
const MAX_ACTIVE = 160;

export function createProps(ctx) {
  const props = [];
  const group = new THREE.Group();
  group.name = 'props';
  ctx.scene.add(group);
  const mats = {};
  const geos = {};
  const g = ctx.config.physics.gravity;

  function spawnProp(kind, position, velocity = new THREE.Vector3(), data = null) {
    const k = KINDS[kind] ?? KINDS.loot;
    if (props.length >= MAX_ACTIVE) removeAt(0);
    geos[kind] ??= k.geo();
    mats[kind] ??= ctx.lighting?.setupMaterial?.(new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.85, metalness: 0 })) ?? new THREE.MeshStandardMaterial({ color: k.color });
    const mesh = new THREE.Mesh(geos[kind], mats[kind]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    group.add(mesh);
    const p = { kind, k, mesh, vel: velocity.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), sleep: 0, life: 0, data };
    props.push(p);
    return p;
  }

  function removeAt(i) {
    const p = props[i];
    group.remove(p.mesh);
    props.splice(i, 1);
  }

  const tmp = new THREE.Vector3();
  return {
    spawnProp,
    get count() { return props.length; },
    get list() { return props; },
    update(dt) {
      if (dt <= 0) return;
      const world = ctx.world, pp = ctx.player?.position;
      for (let i = props.length - 1; i >= 0; i--) {
        const p = props[i];
        p.life += dt;
        if (p.sleep > 1.2) {
          // el botín se recoge al acercarse (el jugador)
          if (p.kind === 'loot' && p.data && p.life > (p.data.noPickup ?? 0) && pp && p.mesh.position.distanceToSquared(tmp.set(pp.x, pp.y + 0.8, pp.z)) < 2.4) {
            const left = ctx.survival?.inventory?.add?.(p.data.item, p.data.cantidad, p.data.extra ?? null) ?? 0;
            if (left === 0) { removeAt(i); continue; }
            p.data.cantidad = left; // se llevó parte: el resto queda en el suelo
          }
          if (p.life > 90) removeAt(i);
          continue;
        }
        const pos = p.mesh.position;
        p.vel.y -= g * dt;
        const inWater = pos.y < world.seaLevel;
        if (inWater) { p.vel.multiplyScalar(1 - Math.min(1, 3.2 * dt)); p.vel.y += g * 0.75 * dt; } // flotan
        pos.addScaledVector(p.vel, dt);
        const gh = world.getHeight(pos.x, pos.z) + p.k.r;
        if (pos.y < gh) {
          pos.y = gh;
          const n = world.getNormal(pos.x, pos.z, tmp);
          const vn = p.vel.dot(n);
          if (vn < 0) p.vel.addScaledVector(n, -(1 + p.k.restitution) * vn);
          const fr = Math.max(0, 1 - 4.5 * dt);
          p.vel.x *= fr; p.vel.z *= fr;
          // rueda cuesta abajo
          p.vel.x += n.x * g * 0.18 * dt; p.vel.z += n.z * g * 0.18 * dt;
          p.spin.multiplyScalar(0.92);
          if (p.vel.lengthSq() < 0.05) p.sleep += dt; else p.sleep = 0;
        } else p.sleep = 0;
        p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      }
    },
  };
}
