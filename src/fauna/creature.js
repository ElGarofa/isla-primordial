// Una criatura: nodo de escena con malla esquelética, marcha con IK de patas apoyadas en el terreno, animación procedural y comportamiento.
import * as THREE from 'three';
import { makeSkeleton } from './builder.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const shortest = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const rnd = (a, b) => a + Math.random() * (b - a);
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _o = [];
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

/** Datos de reposo de cada pata, calculados una vez por especie. */
export function prepareLegs(built) {
  const rest = built.sk.rest;
  const hips = rest.hips;
  return built.legs.map((l) => {
    const hip = rest[l.thigh], knee = rest[l.shin], ankle = rest[l.foot];
    const ang = (a, b) => Math.atan2(b.z - a.z, -(b.y - a.y));
    return {
      ...l,
      hipLocal: hip.clone().sub(hips),
      L1: Math.hypot(knee.y - hip.y, knee.z - hip.z), L2: Math.hypot(ankle.y - knee.y, ankle.z - knee.z),
      th1r: ang(hip, knee), th2r: ang(knee, ankle),
      ankleOff: ankle.clone().sub(l.toe), // del contacto del pie al tobillo
      toeRest: l.toe.clone(),
    };
  });
}

export class Creature {
  constructor(mgr, sp, id, x, z, opts = {}) {
    this.mgr = mgr; this.ctx = mgr.ctx; this.sp = sp; this.id = id; this.especie = sp.id; this.nombre = sp.nombre;
    const data = mgr.getBuilt(sp);
    this.data = data;
    const sk = makeSkeleton(data.specs);
    this.bones = sk.byName; this.rest = sk.rest;
    this.mesh = new THREE.SkinnedMesh(data.geo, mgr.makeMaterial(sp, opts.tint ?? Math.random()));
    this.mesh.add(sk.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(sk.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.position = this.group.position;
    this.group.position.set(x, mgr.ctx.world.getHeight(x, z), z);
    this.yaw = opts.yaw ?? Math.random() * TAU;
    this.hpMax = sp.vidaMax; this.hp = sp.vidaMax; this.muerta = false;
    this.state = 'idle'; this.stateT = rnd(0.5, 3); this.speed = 0; this.wish = 0; this.phase = Math.random();
    this.goal = new THREE.Vector3(x, 0, z); this.herd = opts.herd ?? null;
    this.pitch = 0; this.roll = 0; this.bobY = 0; this.lookYaw = 0; this.lookPitch = 0; this.jaw = 0; this.biteT = -1; this.atkCd = rnd(0, 1);
    this.flank = (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.1);
    this.enrage = 0; this.fleeT = 0; this.t = Math.random() * 100; this.deathT = 0; this.override = null; this.frozen = !!opts.frozen;
    this.lastRoar = -99; this.hit = 0; this.kn = new THREE.Vector3();
    this.tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'].filter((n) => this.bones[n]).map((n) => this.bones[n]);
    this.neck = ['neck1', 'neck2', 'neck3', 'neck4'].filter((n) => this.bones[n]);
    this.legs = data.legs.map((l) => ({ ...l, ik: { dz: 0, lift: 0 }, ang1: 0, ang2: 0 }));
    this.flight = sp.ai.vuelo ? { cx: x, cz: z, r: rnd(55, 110), ang: Math.random() * TAU, alt: rnd(45, 85), flap: 0, flapT: rnd(0, 3), dir: Math.random() < 0.5 ? 1 : -1 } : null;
    this.apply();
  }

  get vida() { return Math.max(0, Math.round((this.hp / this.hpMax) * 100)); }
  get center() { return _v.set(this.position.x, this.position.y + (this.sp.hit[0]?.[1] ?? 1), this.position.z); }

  // ------------------------------------------------------------------------------------------ daño
  damage(n, fuente) {
    if (this.muerta) return;
    this.hp -= n; this.hit = 0.25;
    const sp = this.sp;
    this.mgr.onHit(this, n, fuente);
    if (this.hp <= 0) { this.die(); return; }
    // reacción
    if (sp.ai.huye > 0 || sp.ai.huye === 1) { if (sp.ai.huye === 1 || this.hp / this.hpMax < sp.ai.huye) { this.setState('flee'); this.fleeT = rnd(4, 7); } }
    if (sp.ai.agresivo) { this.setState('chase'); this.stateT = 0; this.roar(); }
    if (sp.ai.defiende) { this.enrage = 22; this.setState('charge'); this.roar(); }
    if (sp.ai.pasivo && Math.random() < 0.5) this.roar();
    if (sp.ai.vuelo) this.flight.alt += 12;
  }
  die() {
    this.muerta = true; this.state = 'dead'; this.deathT = 0; this.hp = 0;
    this.mgr.onKilled(this);
  }
  roar() {
    const t = this.ctx.time.elapsed;
    if (t - this.lastRoar < 3.5) return;
    this.lastRoar = t;
    this.jawAnim = 1.2;
    this.ctx.events.emit('creature:roar', { especie: this.especie, position: this.center.clone() });
  }
  setState(s) { if (this.state === s) return; this.state = s; this.stateT = 0; }

  // ------------------------------------------------------------------------------------------ IA
  distToPlayer() {
    const p = this.ctx.player?.position; if (!p) return 1e9;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }
  walkable(x, z) {
    const w = this.ctx.world, h = w.getHeight(x, z);
    if (h < 0.15 && !this.sp.ai.vuelo) return false;
    if (w.getSlope(x, z) > (this.sp.radius > 1 ? 0.2 : 0.3)) return false;
    return Math.hypot(x, z) < w.size * 0.43;
  }
  pickGoal(r = 28) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU, d = rnd(r * 0.4, r);
      let cx = this.position.x, cz = this.position.z;
      if (this.herd && this.herd.center && Math.random() < 0.6) { cx = this.herd.center.x; cz = this.herd.center.z; }
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.walkable(x, z)) { this.goal.set(x, 0, z); return true; }
    }
    this.goal.set(this.position.x, 0, this.position.z); return false;
  }
  steer(tx, tz, dt, speed, turn = 2.6) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const want = Math.atan2(dx, dz);
    const dy = shortest(want - this.yaw);
    this.yawRate = clamp(dy, -turn * dt, turn * dt) / Math.max(dt, 1e-4);
    this.yaw += clamp(dy, -turn * dt, turn * dt);
    // acelerar solo si está más o menos orientado
    this.wish = Math.abs(dy) < 1.2 ? speed : speed * 0.25;
  }

  think(dt) {
    const sp = this.sp, ai = sp.ai, ctx = this.ctx, playing = ctx.state === 'playing' && !ctx.survival?.dead;
    const d = playing ? this.distToPlayer() : 1e9;
    this.stateT += dt; this.enrage = Math.max(0, this.enrage - dt);
    this.wish = 0; this.yawRate = 0;
    const pl = ctx.player?.position;
    const sight = ai.vista * (ctx.player?.crouching ? 0.55 : 1) * (ctx.time.nightFactor > 0.6 ? 0.8 : 1);
    const grace = this.mgr.grace > 0 && Math.hypot(this.position.x - ctx.world.spawn.x, this.position.z - ctx.world.spawn.z) < 90;

    switch (this.state) {
      case 'idle': {
        if (ai.pasivo && d < 10) { /* ignora al jugador */ }
        if (ai.agresivo && playing && d < sight && !grace) { this.setState('alert'); break; }
        if (ai.huye === 1 && d < ai.huyeDist) { this.setState('flee'); this.fleeT = rnd(3, 6); break; }
        if (ai.defiende && playing && d < 9 && ctx.player?.crouching === false && Math.random() < dt * 0.15) { this.setState('alert'); break; }
        this.lookYaw = Math.sin(this.t * 0.4 + this.id) * 0.5; this.lookPitch = 0;
        if (this.stateT > this.idleLen) { if (!ai.vuelo && Math.random() < (sp.tipo === 'herbivoro' ? 0.55 : 0.2)) this.setState('graze'); else { this.pickGoal(sp.scale < 0.5 ? 14 : 30); this.setState('wander'); } this.idleLen = rnd(2.5, 7); }
        break;
      }
      case 'graze': {
        if (ai.agresivo && playing && d < sight && !grace) { this.setState('alert'); break; }
        if (ai.huye === 1 && d < ai.huyeDist) { this.setState('flee'); this.fleeT = rnd(3, 6); break; }
        if (this.stateT > rnd(5, 9)) { this.pickGoal(30); this.setState('wander'); }
        break;
      }
      case 'wander': {
        const dist = Math.hypot(this.goal.x - this.position.x, this.goal.z - this.position.z);
        if (ai.agresivo && playing && d < sight && !grace) { this.setState('alert'); break; }
        if (ai.huye === 1 && d < ai.huyeDist) { this.setState('flee'); this.fleeT = rnd(3, 6); break; }
        if (dist < 1.5 + sp.radius || this.stateT > 30) { this.setState('idle'); this.idleLen = rnd(2.5, 7); break; }
        this.steer(this.goal.x, this.goal.z, dt, sp.vel.walk, sp.scale > 0.9 ? 1.1 : 2.2);
        break;
      }
      case 'alert': {
        if (!playing) { this.setState('idle'); break; }
        const dx = pl.x - this.position.x, dz = pl.z - this.position.z;
        this.steer(this.position.x + dx * 0.01, this.position.z + dz * 0.01, dt, 0, 3.5);
        this.lookYaw = clamp(shortest(Math.atan2(dx, dz) - this.yaw), -0.9, 0.9); this.lookPitch = -0.1;
        if (ai.agresivo && this.stateT > 0.7) { this.roar(); this.setState('chase'); }
        if (ai.defiende && this.stateT > 2.5 && d > 14) this.setState('idle');
        if (d > sight * 1.3) this.setState('idle');
        break;
      }
      case 'flee': {
        this.fleeT -= dt;
        if (pl) {
          const ax = this.position.x - pl.x, az = this.position.z - pl.z, l = Math.hypot(ax, az) || 1;
          let tx = this.position.x + ax / l * 20, tz = this.position.z + az / l * 20;
          if (!this.walkable(tx, tz)) { tx = this.position.x - az / l * 20; tz = this.position.z + ax / l * 20; }
          this.steer(tx, tz, dt, sp.vel.run, 3.4);
        }
        if (this.fleeT <= 0 && (d > 24 || !playing)) this.setState('idle');
        break;
      }
      case 'chase': case 'charge': {
        if (!playing) { this.setState('idle'); break; }
        const dx = pl.x - this.position.x, dz = pl.z - this.position.z, dist = Math.hypot(dx, dz);
        if (this.state === 'chase' && (dist > sight * 1.6 || (this.stateT > 25 && dist > 12))) { this.setState('idle'); break; }
        if (this.state === 'charge' && this.enrage <= 0) { this.setState('idle'); break; }
        // la manada rodea: se acercan por ángulos distintos
        let tx = pl.x, tz = pl.z;
        if (ai.manada && dist > 6) { const a = Math.atan2(dz, dx) + Math.PI + this.flank * Math.min(1, dist / 18) * 0.5; tx = pl.x + Math.cos(a) * 2.2; tz = pl.z + Math.sin(a) * 2.2; }
        this.steer(tx, tz, dt, sp.vel.run * (this.state === 'charge' ? 0.9 : 1), 4.2);
        this.lookYaw = 0; this.atkCd -= dt;
        if (dist < ai.ataque && this.atkCd <= 0 && Math.abs(shortest(Math.atan2(dx, dz) - this.yaw)) < 0.7) { this.atkCd = ai.cd; this.biteT = 0; this.struck = false; }
        if (this.hp / this.hpMax < (ai.huye ?? 0) && ai.agresivo) { this.setState('flee'); this.fleeT = rnd(5, 8); }
        break;
      }
      default: break;
    }
    if (this.override) { if (this.override.speed != null) this.wish = this.override.speed; }
    // golpe (mordisco / embestida)
    if (this.biteT >= 0) {
      this.biteT += dt / (ai.agresivo ? 0.55 : 0.8);
      this.jaw = Math.sin(clamp(this.biteT, 0, 1) * Math.PI) * 0.7;
      if (!this.struck && this.biteT > 0.4 && playing) {
        this.struck = true;
        const dx = pl.x - this.position.x, dz = pl.z - this.position.z;
        if (Math.hypot(dx, dz) < ai.ataque * 1.45) {
          this.mgr.hitPlayer(this, ai.dano * rnd(0.8, 1.2));
          const l = Math.hypot(dx, dz) || 1;
          if (ai.defiende) { ctx.player.velocity.x += dx / l * 9; ctx.player.velocity.z += dz / l * 9; ctx.player.velocity.y = Math.max(ctx.player.velocity.y, 4.5); }
        }
      }
      if (this.biteT >= 1) this.biteT = -1;
    }
  }

  thinkFlight(dt) {
    const f = this.flight, ctx = this.ctx, w = ctx.world;
    f.ang += (this.sp.vel.walk / f.r) * dt * f.dir;
    const x = f.cx + Math.cos(f.ang) * f.r, z = f.cz + Math.sin(f.ang) * f.r;
    const gy = Math.max(w.getHeight(x, z), 0);
    const y = gy + f.alt + Math.sin(this.t * 0.25 + this.id) * 7;
    this.yaw = Math.atan2(-Math.sin(f.ang) * f.dir, Math.cos(f.ang) * f.dir);
    const oy = this.position.y;
    this.position.set(x, lerp(oy, y, Math.min(1, dt * 1.5)), z);
    this.vy = (this.position.y - oy) / Math.max(dt, 1e-4);
    f.flapT -= dt;
    if (f.flapT <= 0) { f.flap = f.flap > 0 ? 0 : 1; f.flapT = f.flap ? rnd(2, 4) : rnd(3, 7); }
  }

  // ------------------------------------------------------------------------------------------ física y marcha
  move(dt) {
    const sp = this.sp, w = this.ctx.world;
    // aceleración suave
    const acc = this.wish > this.speed ? 3.2 : 5.5;
    this.speed += clamp(this.wish - this.speed, -acc * dt, acc * dt);
    if (this.speed > 0.02 && !this.override?.hold) {
      const nx = this.position.x + Math.sin(this.yaw) * this.speed * dt, nz = this.position.z + Math.cos(this.yaw) * this.speed * dt;
      if (this.walkable(nx, nz) || !this.walkable(this.position.x, this.position.z) || this.state === 'chase' || this.state === 'charge' || this.state === 'flee') { this.position.x = nx; this.position.z = nz; } else { this.speed *= 0.5; if (this.state === 'wander') this.pickGoal(); }
    }
    // empuje por impactos
    if (this.kn.lengthSq() > 1e-4) { this.position.x += this.kn.x * dt; this.position.z += this.kn.z * dt; this.kn.multiplyScalar(Math.max(0, 1 - dt * 6)); }
    // colisión con árboles, rocas y entre criaturas
    const list = w.colliders.query(this.position.x, this.position.z, sp.radius, _o);
    for (let i = 0; i < list.length; i++) {
      const c = list[i], dx = this.position.x - c.x, dz = this.position.z - c.z, d = Math.hypot(dx, dz) || 1e-3, m = c.radius + sp.radius * 0.7;
      if (d < m) { this.position.x = c.x + (dx / d) * m; this.position.z = c.z + (dz / d) * m; }
    }
    this.mgr.separate(this, dt);
  }

  applyGait(dt) {
    const sp = this.sp, w = this.ctx.world;
    if (!this.legs.length) return;
    const k = clamp((this.speed - sp.vel.walk) / Math.max(0.1, sp.vel.run - sp.vel.walk), 0, 1);
    // el paso no puede exceder lo que la pata alcanza: si el ciclo pedido es mayor, se acorta (más pasos por metro)
    this.legLen ??= Math.max(...this.legs.map((l) => l.L1 + l.L2));
    const cycleLen = Math.min(lerp(sp.cycle.walk, sp.cycle.run, k), (this.legLen * (0.85 + 0.8 * k)) / (sp.stance * 0.9));
    const moving = this.speed > 0.15;
    if (moving) this.phase = (this.phase + (this.speed * dt) / cycleLen) % 1;
    const stride = moving ? Math.min(cycleLen * sp.stance * 0.9, cycleLen) : 0;
    const stepH = sp.step * (0.5 + 0.7 * k) * (moving ? 1 : 0);
    const hips = this.bones.hips, rest = this.rest;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // inclinación del cuerpo según el terreno
    const L = sp.radius, px = this.position.x, pz = this.position.z;
    const hF = w.getHeight(px + sy * L, pz + cy * L), hB = w.getHeight(px - sy * L, pz - cy * L);
    const hL = w.getHeight(px + cy * L * 0.6, pz - sy * L * 0.6), hR = w.getHeight(px - cy * L * 0.6, pz + sy * L * 0.6);
    const tp = -Math.atan2(hF - hB, 2 * L) * 0.8, tr = Math.atan2(hL - hR, 1.2 * L) * 0.8;
    this.pitch = lerp(this.pitch, tp, Math.min(1, dt * 5)); this.roll = lerp(this.roll, tr, Math.min(1, dt * 5));
    const bobAmp = sp.scale > 0.9 ? 0.03 * sp.hips : 0.04;
    this.bobY = moving ? Math.cos(this.phase * TAU * 2) * bobAmp * (0.5 + k) : lerp(this.bobY, 0, dt * 4);
    hips.position.set(rest.hips.x, rest.hips.y + this.bobY, rest.hips.z);
    hips.rotation.set(this.pitch, 0, this.roll + (moving ? Math.sin(this.phase * TAU) * 0.025 * (sp.tipo === 'depredador' ? 1.6 : 1) : 0));
    // altura del grupo = media del terreno bajo los pies
    let gSum = 0;
    const legs = this.legs;
    for (const l of legs) {
      const u = (this.phase + l.phase) % 1;
      let dz, lift = 0;
      if (u < sp.stance) { const t = u / sp.stance; dz = stride * (0.5 - t); } else { const t = (u - sp.stance) / (1 - sp.stance), e = t * t * (3 - 2 * t); dz = stride * (-0.5 + e); lift = Math.sin(t * Math.PI) * stepH; }
      if (!moving) { dz = 0; lift = 0; }
      l.ik.dz = dz; l.ik.lift = lift;
      const lx = l.toeRest.x, lz = l.toeRest.z + dz;
      l.wx = px + lx * cy + lz * sy; l.wz = pz - lx * sy + lz * cy;
      l.gy = w.getHeight(l.wx, l.wz);
      gSum += l.gy;
    }
    const target = gSum / legs.length;
    this.position.y = lerp(this.position.y, target, Math.min(1, dt * 9));
    if (Math.abs(this.position.y - target) > 1.5) this.position.y = target;
    // IK por pata
    hips.updateMatrix(); _qi.copy(hips.quaternion).invert();
    for (const l of legs) {
      const toeWorldY = l.gy + l.ik.lift + 0.02;
      // punto del tobillo en coordenadas del grupo (y relativa al grupo)
      _v.set(l.toeRest.x + l.ankleOff.x, toeWorldY - this.position.y + l.ankleOff.y, l.toeRest.z + l.ik.dz + l.ankleOff.z);
      _v.sub(hips.position).applyQuaternion(_qi);
      const dy = _v.y - l.hipLocal.y, dz = _v.z - l.hipLocal.z;
      const D = clamp(Math.hypot(dy, dz), Math.abs(l.L1 - l.L2) + 0.03, l.L1 + l.L2 - 0.004);
      const phi = Math.atan2(dz, -dy);
      const a = Math.acos(clamp((l.L1 * l.L1 + D * D - l.L2 * l.L2) / (2 * l.L1 * D), -1, 1));
      const th1 = l.bendFwd ? phi + a : phi - a;
      const kz = l.L1 * Math.sin(th1), ky = -l.L1 * Math.cos(th1);
      const az = D * Math.sin(phi) - kz, ay = -D * Math.cos(phi) - ky;
      const th2 = Math.atan2(az, -ay);
      const d1 = th1 - l.th1r, d2 = th2 - l.th2r;
      this.bones[l.thigh].quaternion.setFromAxisAngle(AX, -d1);
      this.bones[l.shin].quaternion.setFromAxisAngle(AX, -(d2 - d1));
      const toeUp = l.ik.lift > 0.002 ? 0.35 * Math.min(1, l.ik.lift / Math.max(0.01, stepH)) : 0;
      const dF = -this.pitch * 0.9 - toeUp;
      this.bones[l.foot].quaternion.setFromAxisAngle(AX, -(dF - d2));
    }
    this.k = k;
  }

  // ------------------------------------------------------------------------------------------ cola, cuello, cabeza, mandíbula
  applySecondary(dt) {
    const sp = this.sp, B = this.bones, t = this.t;
    const k = this.k ?? 0, mv = clamp(this.speed / Math.max(0.5, sp.vel.run), 0, 1);
    // cola: ondulación con retardo + contra-giro
    const turn = clamp(this.yawRate ?? 0, -2, 2);
    for (let i = 0; i < this.tail.length; i++) {
      const b = this.tail[i], f = (i + 1) / this.tail.length;
      const sway = Math.sin(this.phase * TAU - i * 0.7) * (0.05 + 0.12 * mv) * (sp.scale > 0.9 ? 0.5 : 1) + Math.sin(t * 0.8 - i * 0.5) * 0.03;
      b.rotation.y = sway - turn * 0.06 * f;
      b.rotation.x = Math.sin(this.phase * TAU * 2 - i * 0.6) * 0.03 * mv + (sp.tipo === 'depredador' ? -0.02 * f * k : 0);
    }
    if (B.spine1) { B.spine1.rotation.y = Math.sin(this.phase * TAU) * 0.05 * (0.5 + mv) * (sp.scale > 0.9 ? 0.6 : 1); B.spine1.rotation.x = Math.sin(t * 1.7) * 0.008; }
    if (B.spine2) B.spine2.rotation.y = -Math.sin(this.phase * TAU) * 0.04 * mv;
    // cuello / cabeza
    const graze = this.state === 'graze' ? 1 : 0, charge = this.state === 'charge' ? 1 : 0;
    this.grazeK = lerp(this.grazeK ?? 0, graze, Math.min(1, dt * 2.5));
    this.chargeK = lerp(this.chargeK ?? 0, charge, Math.min(1, dt * 4));
    const ly = this.lookYaw ?? 0, lp = this.lookPitch ?? 0, n = this.neck.length;
    const bite = this.biteT >= 0 ? Math.sin(clamp(this.biteT, 0, 1) * Math.PI) : 0;
    if (sp.id === 'braquiosaurio') {
      const wave = Math.sin(t * 0.35) * 0.05;
      this.neck.forEach((nm, i) => { const b = B[nm]; b.rotation.x = (i === 0 ? -0.05 : 0.02) + wave * (i + 1) * 0.5 + this.grazeK * (i === 0 ? 0.0 : 0.18); b.rotation.y = ly * 0.25 + Math.sin(t * 0.2 + i) * 0.03; });
      B.head.rotation.x = 0.1 + this.grazeK * 0.5 + Math.sin(t * 0.9) * 0.02; B.head.rotation.y = ly * 0.2;
    } else if (sp.id === 'triceratops') {
      B.neck1.rotation.x = 0.05 + this.grazeK * 0.55 + this.chargeK * 0.25 + Math.sin(this.phase * TAU * 2) * 0.02 * mv; B.neck1.rotation.y = ly * 0.5;
      B.head.rotation.x = this.grazeK * 0.7 + this.chargeK * 0.35 - 0.05 + bite * 0.25; B.head.rotation.y = ly * 0.5;
    } else if (sp.id === 'pteranodon') {
      B.neck1.rotation.y = Math.sin(t * 0.9) * 0.1; B.head.rotation.x = Math.sin(t * 1.3) * 0.05 - (this.vy ?? 0) * 0.01;
    } else {
      // terópodos: la cabeza se mantiene estable al correr y se proyecta al morder
      const stab = -this.pitch * 0.5;
      const bob = Math.sin(this.phase * TAU * 2) * 0.05 * mv;
      B.neck1.rotation.x = stab * 0.3 - 0.12 * bite + lp * 0.3 + (this.state === 'alert' ? -0.1 : 0);
      B.neck2.rotation.x = stab * 0.4 + bob + 0.08 * bite - lp * 0.3 + Math.sin(t * 1.1 + this.id) * 0.015;
      B.head.rotation.x = stab * 0.3 - bob * 0.5 + 0.1 * bite + lp * 0.4;
      B.neck1.rotation.y = ly * 0.35; B.neck2.rotation.y = ly * 0.4; B.head.rotation.y = ly * 0.35 + (this.state === 'idle' ? Math.sin(t * 0.7 + this.id * 3) * 0.12 : 0);
      if (B.armL) for (const s of ['L', 'R']) { B[`arm${s}`].rotation.x = 0.35 + Math.sin(this.phase * TAU * 2) * 0.1 * mv; B[`forearm${s}`].rotation.x = -0.6; }
    }
    // mandíbula: rugido / mordisco / respiración
    this.jawAnim = Math.max(0, (this.jawAnim ?? 0) - dt);
    const open = Math.max(this.jaw, this.jawAnim > 0 ? Math.sin(clamp(1 - this.jawAnim / 1.2, 0, 1) * Math.PI) * 0.75 : 0);
    this.jaw = 0;
    if (B.jaw) B.jaw.rotation.x = open + 0.02 + Math.sin(t * 1.6) * 0.01;
  }

  applyFlight(dt) {
    const B = this.bones, f = this.flight, t = this.t;
    const bank = -0.42 * f.dir;
    this.roll = lerp(this.roll, bank, Math.min(1, dt * 2));
    this.pitch = lerp(this.pitch, clamp(-(this.vy ?? 0) * 0.04, -0.4, 0.4), Math.min(1, dt * 2));
    B.hips.position.set(0, 0, 0);
    B.hips.rotation.set(this.pitch, 0, this.roll);
    f.flapPh = (f.flapPh ?? 0) + dt * (f.flap ? 7.5 : 0.9);
    const amp = f.flap ? 0.62 : 0.06, ph = f.flapPh;
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      B[`sh${s}`].rotation.z = Math.sin(ph) * amp * sg + 0.05 * sg;
      B[`el${s}`].rotation.z = Math.sin(ph - 0.7) * amp * 0.55 * sg;
      B[`wr${s}`].rotation.z = Math.sin(ph - 1.4) * amp * 0.5 * sg - 0.04 * sg;
      B[`legU${s}`].rotation.x = 0.5;
    }
    B.hips.position.y = Math.sin(ph) * (f.flap ? 0.07 : 0.01);
    B.tail.rotation.y = Math.sin(t * 1.2) * 0.2;
    B.head.rotation.x = Math.sin(t * 1.3) * 0.05;
    if (B.jaw) B.jaw.rotation.x = 0.02;
  }

  // ------------------------------------------------------------------------------------------ muerte
  updateDead(dt) {
    this.deathT += dt;
    const k = clamp(this.deathT / 1.1, 0, 1), e = k * k * (3 - 2 * k);
    this.group.rotation.z = lerp(0, 1.45, e);
    const B = this.bones, rest = this.rest;
    this.speed = 0;
    // las patas se relajan: se encogen
    for (const l of this.legs) { this.bones[l.thigh].rotation.x = lerp(this.bones[l.thigh].rotation.x, l.bendFwd ? -0.5 : 0.3, dt * 3); this.bones[l.shin].rotation.x = lerp(this.bones[l.shin].rotation.x, 0.6, dt * 3); }
    B.hips.position.set(rest.hips.x, rest.hips.y * (1 - 0.35 * e), rest.hips.z);
    B.hips.rotation.set(0, 0, 0);
    if (B.jaw) B.jaw.rotation.x = lerp(B.jaw.rotation.x, 0.35, dt * 2);
    const gy = this.ctx.world.getHeight(this.position.x, this.position.z);
    this.position.y = lerp(this.position.y, gy - Math.max(0, this.deathT - 40) * 0.12, Math.min(1, dt * 6));
    if (this.flight) { this.position.y = Math.max(gy, this.position.y - 22 * dt); this.group.rotation.x += dt * 2; }
  }

  // ------------------------------------------------------------------------------------------ bucle
  apply() { this.group.rotation.y = this.yaw; }

  update(dt, near) {
    this.t += dt; this.hit = Math.max(0, this.hit - dt);
    if (this.muerta) { this.updateDead(dt); this.apply(); return; }
    if (this.flight) {
      if (!this.frozen) this.thinkFlight(dt);
      this.applyFlight(dt); this.group.rotation.set(0, this.yaw, 0); this.group.position.copy(this.position);
      return;
    }
    if (!this.frozen) this.think(dt); else if (this.override?.speed != null) this.wish = this.override.speed;
    this.move(dt);
    if (near) { this.applyGait(dt); this.applySecondary(dt); } else this.phase = (this.phase + (this.speed * dt) / 2.5) % 1;
    this.apply();
  }

  dispose() {
    this.mesh.skeleton?.dispose?.(); // geometría y materiales son compartidos: no se liberan
  }
}
