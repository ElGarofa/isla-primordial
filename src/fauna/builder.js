// Constructor de mallas orgánicas con esqueleto: tubos elípticos a lo largo de curvas, con pesos de piel suaves entre huesos.
import * as THREE from 'three';

export const PART = { cuerpo: 0, ojo: 1, diente: 2, garra: 3, cuerno: 4, membrana: 5, boca: 6, gola: 7 };

const _a = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3();
const UPY = new THREE.Vector3(0, 1, 0), UPZ = new THREE.Vector3(0, 0, 1);

export class SkinBuilder {
  constructor(boneIndex) {
    this.bi = boneIndex; // nombre -> índice de hueso
    this.pos = []; this.uv = []; this.si = []; this.sw = []; this.part = []; this.idx = []; this.rings = [];
  }

  vert(p, u, v, part, skin) {
    this.pos.push(p.x, p.y, p.z); this.uv.push(u, v); this.part.push(part);
    this.si.push(skin[0][0], skin[1] ? skin[1][0] : 0, 0, 0); this.sw.push(skin[0][1], skin[1] ? skin[1][1] : 0, 0, 0);
    return this.pos.length / 3 - 1;
  }

  /** Pesos de piel: owners[s] es el hueso que posee el segmento s; se mezcla con el vecino cerca de cada articulación. */
  skinAt(owners, s, u) {
    const o = owners[s];
    let other = null, wo = 1, wn = 0;
    if (u < 0.5) { if (s > 0 && owners[s - 1] !== o) { other = owners[s - 1]; wn = 0.5 - u; } } else if (s < owners.length - 1 && owners[s + 1] !== o) { other = owners[s + 1]; wn = u - 0.5; }
    wo = 1 - wn;
    return other == null ? [[o, 1]] : [[o, wo], [other, wn]];
  }

  /**
   * Tubo elíptico. pts: Vector3[] (puntos de control), rx/ry: semiejes por punto, owners: nombres de hueso por segmento (o un solo nombre).
   * opciones: sides, sub, part, uscale, vscale, cap0/cap1 (cerrar extremos), roll
   */
  tube({ pts, rx, ry, owners, sides = 10, sub = 3, part = PART.cuerpo, uscale = 2, vscale = 1.5, cap0 = true, cap1 = true, spec = 'cuerpo' }) {
    const n = pts.length;
    const own = (Array.isArray(owners) ? owners : new Array(n - 1).fill(owners)).map((o) => this.bi[o]);
    if (own.some((o) => o == null)) throw new Error(`Hueso desconocido en tubo: ${owners}`);
    const curve = n > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
    const total = (n - 1) * sub;
    const ringStarts = [];
    let arc = 0, prev = null;
    for (let i = 0; i <= total; i++) {
      const s = Math.min(n - 2, Math.floor(i / sub)), u = i === total ? 1 : (i - s * sub) / sub;
      const t = Math.min(1, (s + u) / (n - 1));
      const c = curve.getPoint(t), d = curve.getTangent(t).normalize();
      const sm = u * u * (3 - 2 * u);
      const ax = rx[s] + (rx[s + 1] - rx[s]) * sm, ay = ry[s] + (ry[s + 1] - ry[s]) * sm;
      if (prev) arc += c.distanceTo(prev); prev = c.clone();
      _d.copy(d);
      const ref = Math.abs(_d.y) > 0.9 ? UPZ : UPY;
      _r.crossVectors(ref, _d).normalize(); _u.crossVectors(_d, _r).normalize();
      const skin = this.skinAt(own, s, u);
      const start = this.pos.length / 3; ringStarts.push(start);
      // escamas isótropas: el reparto de U alrededor sigue el perímetro local; la costura queda en el vientre
      const ur = Math.max(0.35, 2 * Math.PI * Math.sqrt((ax * ax + ay * ay) / 2) * vscale);
      for (let j = 0; j <= sides; j++) {
        const th = (j / sides) * Math.PI * 2 - Math.PI / 2, ct = Math.cos(th), st = Math.sin(th);
        _a.copy(c).addScaledVector(_r, ct * ax).addScaledVector(_u, st * ay);
        this.vert(_a, (j / sides) * ur, arc * vscale, part, skin);
      }
    }
    for (let i = 0; i < total; i++) {
      const r0 = ringStarts[i], r1 = ringStarts[i + 1];
      for (let j = 0; j < sides; j++) { const a = r0 + j, b = a + 1, c2 = r1 + j, d2 = c2 + 1; this.idx.push(a, b, c2, b, d2, c2); }
    }
    this.rings.push({ start: ringStarts[0], count: (total + 1) * (sides + 1), sides });
    const cap = (ringStart, p, d, flip, sk) => {
      const center = this.vert(p, 0.5, arc * vscale, part, sk);
      for (let j = 0; j < sides; j++) { const a = ringStart + j, b = a + 1; if (flip) this.idx.push(center, b, a); else this.idx.push(center, a, b); }
      void d;
    };
    if (cap0) cap(ringStarts[0], pts[0], null, true, this.skinAt(own, 0, 0));
    if (cap1) cap(ringStarts[total], pts[n - 1], null, false, this.skinAt(own, n - 2, 1));
    return this;
  }

  /** Cono (cuernos, dientes, garras) desde base hacia punta. curva: desplazamiento lateral en el punto medio. */
  spike(base, tip, r0, bone, part = PART.diente, { sides = 6, bend = null, r1 = 0.002 } = {}) {
    const mid = base.clone().lerp(tip, 0.5);
    if (bend) mid.add(bend);
    this.tube({ pts: [base, mid, tip], rx: [r0, r0 * 0.6, r1], ry: [r0, r0 * 0.6, r1], owners: bone, sides, sub: 2, part, uscale: 1, vscale: 1, cap0: true, cap1: false });
    return this;
  }

  /** Elipsoide (ojos, articulaciones). */
  blob(c, rx, ry, rz, bone, part = PART.cuerpo, sides = 8) {
    const k = 5, pts = [], px = [], py = [];
    for (let i = 0; i <= k; i++) { const t = i / k, a = Math.sin(t * Math.PI); pts.push(new THREE.Vector3(c.x, c.y, c.z - rz + 2 * rz * t)); px.push(Math.max(0.001, rx * a)); py.push(Math.max(0.001, ry * a)); }
    this.tube({ pts, rx: px, ry: py, owners: bone, sides, sub: 1, part, uscale: 1, vscale: 1, cap0: true, cap1: true });
    return this;
  }

  /** Promedia normales en las costuras de cada tubo y devuelve la BufferGeometry final (colorizada por `colorize`). */
  finish(colorize) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(this.pos);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal.array;
    for (const r of this.rings) {
      const stride = r.sides + 1, rows = r.count / stride;
      for (let i = 0; i < rows; i++) {
        const a = (r.start + i * stride) * 3, b = (r.start + i * stride + r.sides) * 3;
        const x = nrm[a] + nrm[b], y = nrm[a + 1] + nrm[b + 1], z = nrm[a + 2] + nrm[b + 2], l = Math.hypot(x, y, z) || 1;
        nrm[a] = nrm[b] = x / l; nrm[a + 1] = nrm[b + 1] = y / l; nrm[a + 2] = nrm[b + 2] = z / l;
      }
    }
    const col = new Float32Array(pos.length), out = [0, 0, 0];
    for (let i = 0; i < pos.length / 3; i++) {
      colorize(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], this.part[i], out);
      col[i * 3] = out[0]; col[i * 3 + 1] = out[1]; col[i * 3 + 2] = out[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere(); g.boundingSphere.radius *= 1.35;
    return g;
  }
}

/** Esqueleto a partir de [{name, parent, pos:[x,y,z]}] con posiciones de reposo en coordenadas del modelo. */
export function makeSkeleton(specs) {
  const bones = [], byName = {}, index = {};
  const rest = {};
  specs.forEach((s, i) => { const b = new THREE.Bone(); b.name = s.name; bones.push(b); byName[s.name] = b; index[s.name] = i; rest[s.name] = new THREE.Vector3(...s.pos); });
  specs.forEach((s) => {
    const b = byName[s.name];
    if (s.parent) { byName[s.parent].add(b); b.position.copy(rest[s.name]).sub(rest[s.parent]); } else b.position.copy(rest[s.name]);
  });
  return { bones, byName, index, rest };
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
