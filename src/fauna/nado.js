// NADO — locomoción, profundidad y animación de los animales acuáticos (reptiles marinos y peces). Lo usa `Creature` cuando la especie declara `sp.nada`.
//   sp.nada = { prof:[min,max] (profundidad del centro del cuerpo, m), alto (semialtura del tronco, m), minAgua (m de columna de agua para poder estar), respira:[s,s]|null,
//               crucero (fracción de la velocidad de paseo que mantiene sin objetivo), tipo:'undulante'|'carangiforme'|'plesiosaurio', amp, paso, lag, largo, aleta, filtra }
// La IA (cerebro.js) sigue siendo horizontal: persecución, huida, alerta y comida usan x,z. Aquí se decide la profundidad (subir a respirar, bajar a la presa, huir
// buceando), se mantiene al animal dentro del agua y se animan el cuerpo (ondulación lateral o aleteo de las cuatro aletas) y la mandíbula.
// Un cadáver sube a la superficie y flota panza arriba hasta hundirse.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const sin = Math.sin, cos = Math.cos;

/** Altura de la superficie del agua en (x,z). */
export function superficie(c, x = c.position.x, z = c.position.z) {
  const w = c.ctx.world;
  return w.seaLevel + (w.water?.getWaveHeight?.(x, z, c.ctx.time.elapsed) ?? 0);
}

/** ¿Hay agua suficiente en (x,z) para que el animal esté ahí (y dentro del mar jugable)? */
export function caminableNado(c, x, z) {
  const w = c.ctx.world;
  if (Math.abs(x) > w.limite || Math.abs(z) > w.limite) return false;
  if (!c.dentro(x, z)) return false; // su zona de mar
  return w.getHeight(x, z) < -c.nada.minAgua;
}

/** ¿Puede el animal llegar a (x,z)? Un nadador solo alcanza lo que está en el agua o en su orilla inmediata. */
export function alcanzaNado(c, x, z) {
  return c.ctx.world.getHeight(x, z) < 0.6;
}

function buscarAgua(c, x, z) {
  for (let r = 10; r <= 400; r += 10) {
    const n = Math.max(8, Math.round(r / 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r, px = x + cos(a) * r, pz = z + sin(a) * r;
      if (caminableNado(c, px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Estado inicial de un nadador (se llama desde el constructor de Creature). */
export function iniciarNado(c) {
  const n = c.nada;
  if (!caminableNado(c, c.position.x, c.position.z)) {
    const p = buscarAgua(c, c.position.x, c.position.z);
    if (p) { c.position.x = p.x; c.position.z = p.z; c.goal.set(p.x, 0, p.z); }
  }
  const sup = superficie(c), prof0 = lerp(n.prof[0], n.prof[1], Math.random() ** 1.6);
  c.nd = { y: sup - prof0, vy: 0, obj: prof0, objT: rnd(5, 14), resp: n.respira ? rnd(n.respira[0] * 0.2, n.respira[1]) : 1e9, subeT: 0 };
  c.swimPh = Math.random();
  c.position.y = c.nd.y - c.sp.hips;
}

/** Tras `pensar`: un nadador no se detiene del todo (los reptiles marinos flotan despacio, los peces siguen ventilando) y el filtrador nada con la boca abierta. */
export function ajustarPensar(c, dt) {
  const n = c.nada, sp = c.sp, st = c.state;
  if (c.wish < 0.01 && (st === 'idle' || st === 'graze' || st === 'rest') && !(c.stun > 0)) {
    const f = st === 'rest' ? n.crucero * 0.35 : st === 'graze' && n.filtra ? 0.8 : n.crucero;
    c.wish = sp.vel.walk * f * c.speedMul;
    c.yaw += sin(c.t * 0.35 + c.id * 1.7) * 0.22 * dt; // el rumbo cambia despacio
  }
  if (st === 'graze' && n.filtra) c.jaw = Math.max(c.jaw, 0.35);
}

/** Profundidad del centro del cuerpo: objetivo según el estado (cazar, huir, comer, respirar), velocidad vertical limitada y el fondo como límite. */
export function profundidad(c, dt) {
  const n = c.nada, nd = c.nd, w = c.ctx.world, sp = c.sp, st = c.state;
  const px = c.position.x, pz = c.position.z, R = sp.radius, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  const sup = superficie(c);
  const piso = Math.max(w.getHeight(px, pz), w.getHeight(px + sy * R, pz + cy * R), w.getHeight(px - sy * R, pz - cy * R));
  const col = sup - piso;
  nd.objT -= dt;
  if (nd.objT <= 0) { nd.objT = rnd(6, 16); nd.obj = lerp(n.prof[0], n.prof[1], Math.random() ** 1.6); }
  let prof = nd.obj;
  if (st === 'chase' || st === 'charge' || st === 'stalk' || (st === 'alert' && (c.tgt || c.tgtJugador))) {
    const o = c.objetivoPos();
    if (o) {
      const yT = o.jugador ? c.ctx.player.position.y + 0.6 : o.ref ? o.ref.position.y + (o.ref.sp.hit?.[0]?.[1] ?? 0.5) - (o.ref.sp.hips ?? 0) * 0 : sup - 1;
      prof = clamp(sup - yT, n.alto * 0.5, n.prof[1] + 6);
    }
  } else if (st === 'flee') prof = Math.max(prof, n.prof[1] * 0.75); // huye buceando
  else if (st === 'feed' && c.carcass) prof = clamp(sup - (c.carcass.nd?.y ?? c.carcass.position.y), n.alto * 0.5, n.prof[1]);
  let vmax = clamp(0.5 + 0.35 * c.speed, 0.5, 3.5);
  if (n.respira) { // sube a respirar cada cierto tiempo: sube hasta que el lomo asoma, respira unos segundos y vuelve a su profundidad
    // fase 0 = nadando, 1 = subiendo, 2 = respirando en la superficie; un animal que caza o huye aguanta hasta 30 s más antes de ceder a la necesidad
    const activo = st === 'chase' || st === 'charge' || st === 'flee';
    nd.fase ??= 0;
    if (nd.fase === 0) {
      nd.resp -= dt;
      if (nd.resp <= 0 && (!activo || nd.resp < -30)) { nd.fase = 1; nd.subeMax = 70; }
    }
    if (nd.fase === 1) {
      nd.subeMax -= dt; prof = Math.min(prof, n.alto * 0.6); vmax = Math.max(vmax, 1.7);
      if (sup - nd.y <= n.alto * 0.95 || nd.subeMax <= 0) { nd.fase = 2; nd.subeT = rnd(2.5, 4.5); }
    } else if (nd.fase === 2) {
      nd.subeT -= dt; prof = Math.min(prof, n.alto * 0.6);
      if (nd.subeT <= 0) { nd.fase = 0; nd.resp = rnd(n.respira[0], n.respira[1]); }
    }
  }
  const minP = n.alto * 0.5, maxP = Math.max(minP, col - n.alto - 0.25);
  prof = clamp(prof, minP, maxP);
  const err = sup - prof - nd.y;
  nd.vy += clamp(clamp(err * 1.4, -vmax, vmax) - nd.vy, -2.2 * dt, 2.2 * dt);
  nd.y += nd.vy * dt;
  nd.y = clamp(nd.y, piso + n.alto + 0.1, sup - n.alto * 0.5);
  c.position.y = nd.y - sp.hips;
  // inclinación: nariz arriba al subir, abajo al bajar; ladeo al virar
  const yr = c.yawRate ?? 0, k = Math.min(1, dt * 3);
  c.pitch = lerp(c.pitch, clamp(-Math.atan2(nd.vy, Math.max(0.8, c.speed)), -0.5, 0.5), k);
  c.roll = lerp(c.roll, -clamp(yr * 0.1, -0.35, 0.35) * clamp(c.speed / 2, 0, 1), k);
}

/** Animación del cuerpo: ciclo de nado según velocidad, ondulación o aleteo, cuello, cabeza y mandíbula. */
export function aplicarNado(c, dt, near) {
  const sp = c.sp, n = c.nada, B = c.bones, rest = c.rest, t = c.t;
  const mv = clamp(c.speed / Math.max(0.5, sp.vel.run), 0, 1);
  const tipo = n.tipo;
  const ciclo = tipo === 'plesiosaurio' ? 0.12 + c.speed / (2.2 * Math.max(0.4, n.aleta)) : 0.05 + c.speed / Math.max(0.3, n.paso * n.largo);
  c.swimPh = (c.swimPh + ciclo * dt) % 1;
  if (!near) return;
  c.estadosAnim(dt);
  const ph = c.swimPh * TAU, turn = clamp(c.yawRate ?? 0, -2, 2), lag = n.lag;
  B.hips.position.set(rest.hips.x, rest.hips.y, rest.hips.z);
  B.hips.rotation.set(c.pitch, 0, c.roll);
  const nT = c.tail.length;
  const carga = c.state === 'charge' || c.state === 'chase' ? 1 : 0;
  // cola: onda que viaja hacia atrás y crece hacia la punta (cuerpos propulsados por la cola) o balanceo suave (plesiosaurios)
  const amp = tipo === 'plesiosaurio' ? 0.05 + 0.04 * mv : n.amp * (0.3 + 0.7 * mv + 0.15 * carga);
  for (let i = 0; i < nT; i++) {
    const f = (i + 1) / nT;
    c.tail[i].rotation.y = sin(ph - i * lag) * amp * (0.55 + 0.9 * f) + turn * 0.06 * f;
    c.tail[i].rotation.x = sin(ph * 2 - i * lag) * 0.01 * mv;
  }
  if (B.fluke) { B.fluke.rotation.y = sin(ph - nT * lag) * amp * 1.45 + turn * 0.05; B.fluke.rotation.x = sin(ph * 2 - nT * lag) * 0.04 * mv; }
  if (B.dorsal) B.dorsal.rotation.y = sin(ph - 1) * amp * 0.25;
  if (B.spine1) B.spine1.rotation.y = (tipo === 'plesiosaurio' ? sin(t * 0.4) * 0.02 : -sin(ph - lag * 0.5) * amp * 0.45) - turn * 0.03;
  // cuello y cabeza
  const ly = c.lookYaw ?? 0, lp = c.lookPitch ?? 0, bite = c.biteT >= 0 ? sin(clamp(c.biteT, 0, 1) * Math.PI) : 0;
  const fk = c.feedK ?? 0, gz = c.grazeK ?? 0, nK = c.neck.length;
  c.neck.forEach((nm, i) => {
    const b = B[nm], f = (i + 1) / (nK + 1);
    const larga = nK >= 3; // plesiosaurios de cuello largo: S suave en el plano horizontal, casi recto en el vertical
    b.rotation.y = ly * (larga ? 0.18 : 0.3) + (larga ? sin(t * 0.45 - i * 0.8 + c.id) * 0.07 : sin(ph - lag * (0.5 + i)) * amp * -0.2) - turn * 0.04;
    b.rotation.x = (larga ? 0.02 : 0) + gz * 0.04 + fk * 0.1 * f - bite * (larga ? 0.12 : 0.05) + lp * 0.1;
  });
  B.head.rotation.y = ly * 0.35 - (nK ? 0 : sin(ph - lag * 0.5) * amp * -0.25);
  B.head.rotation.x = lp * 0.3 + fk * 0.2 + bite * 0.12 + (n.filtra ? 0 : 0);
  // aletas pares
  const aleteo = tipo === 'plesiosaurio';
  for (const par of ['F', 'H']) {
    for (const [lado, sg] of [['L', 1], ['R', -1]]) {
      const b1 = B[`fl${par}${lado}1`], b2 = B[`fl${par}${lado}2`];
      if (!b1) continue;
      if (aleteo) { // «vuelo subacuático»: las cuatro aletas baten en fase desplazada, las traseras con retraso
        const fase = ph + (par === 'H' ? 1.9 : 0), A = 0.28 + 0.5 * mv;
        b1.rotation.z = sg * (sin(fase) * A + 0.05); b2.rotation.z = sg * sin(fase - 0.9) * A * 0.75;
        b1.rotation.x = cos(fase) * 0.3 * A; b2.rotation.x = cos(fase - 0.9) * 0.25 * A;
      } else { // timones: se mantienen casi quietas, con un pequeño temblor y compensando el cabeceo
        const tr = par === 'F' ? -0.22 : -0.1;
        b1.rotation.z = sg * (tr + sin(t * 1.7 + (lado === 'L' ? 0 : 1.3)) * 0.07 * (0.4 + mv)); b2.rotation.z = sg * sin(t * 1.7 - 0.6) * 0.05;
        b1.rotation.x = c.pitch * 0.35;
      }
    }
  }
  // mandíbula: bostezo / mordisco / respiración
  c.jawAnim = Math.max(0, (c.jawAnim ?? 0) - dt);
  const open = Math.max(c.jaw, c.jawAnim > 0 ? sin(clamp(1 - c.jawAnim / 1.2, 0, 1) * Math.PI) * 0.7 : 0, c.display > 0 ? 0.5 : 0);
  c.jaw = 0;
  if (B.jaw) B.jaw.rotation.x = open * (n.apertura ?? 0.85) + 0.02;
}

/** Muerte: panza arriba, sube a la superficie y flota; pasado un tiempo se hunde. */
export function muerteNado(c, dt) {
  c.deathT += dt; c.speed = 0;
  const n = c.nada, nd = c.nd, B = c.bones, sp = c.sp, w = c.ctx.world;
  const sup = superficie(c), piso = w.getHeight(c.position.x, c.position.z);
  c.roll = lerp(c.roll, Math.PI, Math.min(1, dt * 1.4)); c.pitch = lerp(c.pitch, 0, Math.min(1, dt * 1.5));
  let obj = sup - n.alto * 0.5 + Math.sin(c.t * 0.9) * 0.03;
  if (c.deathT > 90) obj -= (c.deathT - 90) * 0.25;
  obj = Math.max(obj, piso + n.alto * 0.9);
  const dy = clamp((obj - nd.y) * 1.2, -1.2, 1.2);
  nd.y += dy * dt; nd.vy = dy;
  c.position.y = nd.y - sp.hips;
  B.hips.position.set(c.rest.hips.x, c.rest.hips.y, c.rest.hips.z);
  B.hips.rotation.set(c.pitch, 0, c.roll);
  const k = Math.min(1, dt * 2.5);
  for (const b of c.tail) { b.rotation.y = lerp(b.rotation.y, sin(c.t * 0.5) * 0.05, k); b.rotation.x = lerp(b.rotation.x, 0, k); }
  if (B.fluke) B.fluke.rotation.y = lerp(B.fluke.rotation.y, 0, k);
  for (const nm of c.neck) { B[nm].rotation.y = lerp(B[nm].rotation.y, sin(c.t * 0.3) * 0.08, k); B[nm].rotation.x = lerp(B[nm].rotation.x, 0.1, k); }
  for (const par of ['F', 'H']) for (const [lado, sg] of [['L', 1], ['R', -1]]) { // las aletas cuelgan relajadas
    const b1 = B[`fl${par}${lado}1`], b2 = B[`fl${par}${lado}2`]; if (!b1) continue;
    b1.rotation.z = lerp(b1.rotation.z, sg * 0.5, k); b2.rotation.z = lerp(b2.rotation.z, sg * 0.3, k); b1.rotation.x = lerp(b1.rotation.x, 0, k);
  }
  B.head.rotation.x = lerp(B.head.rotation.x, 0.15, k);
  if (B.jaw) B.jaw.rotation.x = lerp(B.jaw.rotation.x, 0.3, Math.min(1, dt * 2));
}
