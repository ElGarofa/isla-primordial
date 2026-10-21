// Modelo atmosférico (dispersión Rayleigh + Mie + absorción de ozono) en dos versiones que comparten constantes:
//  - GLSL: genera la LUT del cielo en GPU (sky.js).
//  - JS:   muestrea unas pocas direcciones por frame para derivar colores de niebla, ambiente y luz del sol en CPU.
// Unidades: metros. E_sol = 1 (irradiancia normalizada); sky.js multiplica por la intensidad nominal del sol.
import * as THREE from 'three';

export const ATM = {
  Rg: 6360000, // radio del planeta
  Rt: 6460000, // techo de la atmósfera
  betaR: [5.802e-6, 13.558e-6, 33.1e-6],
  betaMs: 3.996e-6,
  betaMe: 4.44e-6,
  betaO: [0.65e-6, 1.881e-6, 0.085e-6],
  HR: 8000,
  HM: 1200,
  g: 0.8,
  groundAlbedo: [0.2, 0.22, 0.14],
  msFactor: 1.1, // aproximación de dispersión múltiple (isotrópica)
  obsAlt: 20, // altura del observador sobre el nivel del mar (m)
  sunI: 3.6, // intensidad nominal del sol en unidades de three (luz directa) = escala del cielo
};

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const v3 = (a) => `vec3(${a.map((x) => x.toExponential(4)).join(', ')})`;

/** Funciones GLSL comunes (transmitancia hasta el sol, extinción). Requiere uniform float uMie. */
export const GLSL_ATMOSPHERE = /* glsl */`
const float PI_A = 3.14159265359;
const float RG = ${f(ATM.Rg)};
const float RT = ${f(ATM.Rt)};
const vec3 BETA_R = ${v3(ATM.betaR)};
const float BETA_MS = ${ATM.betaMs.toExponential(4)};
const float BETA_ME = ${ATM.betaMe.toExponential(4)};
const vec3 BETA_O = ${v3(ATM.betaO)};
const float H_R = ${f(ATM.HR)};
const float H_M = ${f(ATM.HM)};
const float G_MIE = ${f(ATM.g)};

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

vec3 extinctionAt(float alt, float mie) {
  float dR = exp(-alt / H_R);
  float dM = exp(-alt / H_M);
  float dO = max(0.0, 1.0 - abs(alt - 25000.0) / 15000.0);
  return BETA_R * dR + BETA_ME * mie * dM + BETA_O * dO;
}

// Transmitancia desde el punto p (centro del planeta = origen) hacia el sol. 0 si el planeta lo tapa.
vec3 sunTransmittance(vec3 p, vec3 sunDir, float mie) {
  vec2 g = raySphere(p, sunDir, RG);
  if (g.x > 0.0) return vec3(0.0);
  vec2 a = raySphere(p, sunDir, RT);
  float len = a.y;
  const int N = 10;
  float dt = len / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 q = p + sunDir * ((float(i) + 0.5) * dt);
    float alt = length(q) - RG;
    od += extinctionAt(alt, mie) * dt;
  }
  return exp(-od);
}
`;

// ---------------------------------------------------------------------------------------------
// Versión JS (misma física, menos pasos). Se usa para colores de niebla/ambiente/sol.
// ---------------------------------------------------------------------------------------------
const _ro = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

function raySphereJS(ro, rd, r, out) {
  const b = ro.dot(rd);
  const c = ro.dot(ro) - r * r;
  let h = b * b - c;
  if (h < 0) { out[0] = -1; out[1] = -1; return false; }
  h = Math.sqrt(h);
  out[0] = -b - h; out[1] = -b + h;
  return true;
}
const _hit = [0, 0];

function extinctionJS(alt, mie, out) {
  const dR = Math.exp(-alt / ATM.HR);
  const dM = Math.exp(-alt / ATM.HM);
  const dO = Math.max(0, 1 - Math.abs(alt - 25000) / 15000);
  out[0] = ATM.betaR[0] * dR + ATM.betaMe * mie * dM + ATM.betaO[0] * dO;
  out[1] = ATM.betaR[1] * dR + ATM.betaMe * mie * dM + ATM.betaO[1] * dO;
  out[2] = ATM.betaR[2] * dR + ATM.betaMe * mie * dM + ATM.betaO[2] * dO;
}
const _ext = [0, 0, 0];

/** Transmitancia hacia el sol desde p (relativo al centro del planeta). Escribe en out (THREE.Color/Vector3-like con r,g,b o array). */
export function sunTransmittanceJS(p, sunDir, mie, out, steps = 12) {
  raySphereJS(p, sunDir, ATM.Rg, _hit);
  if (_hit[0] > 0) { out[0] = out[1] = out[2] = 0; return out; }
  raySphereJS(p, sunDir, ATM.Rt, _hit);
  const len = _hit[1];
  const dt = len / steps;
  let o0 = 0, o1 = 0, o2 = 0;
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * dt;
    _q.copy(sunDir).multiplyScalar(s).add(p);
    extinctionJS(_q.length() - ATM.Rg, mie, _ext);
    o0 += _ext[0] * dt; o1 += _ext[1] * dt; o2 += _ext[2] * dt;
  }
  out[0] = Math.exp(-o0); out[1] = Math.exp(-o1); out[2] = Math.exp(-o2);
  return out;
}

const _tsun = [0, 0, 0];
/** Radiancia del cielo (E_sol = 1) en la dirección rd (unitaria), con el sol en sunDir. Escribe en out[3]. */
export function skyRadianceJS(rd, sunDir, mie, out, steps = 20, alt0 = ATM.obsAlt) {
  _ro.set(0, ATM.Rg + alt0, 0);
  let tMax;
  raySphereJS(_ro, rd, ATM.Rg, _hit);
  const hitsGround = _hit[0] > 0;
  if (hitsGround) tMax = _hit[0];
  else { raySphereJS(_ro, rd, ATM.Rt, _hit); tMax = _hit[1]; }
  const cosT = rd.dot(sunDir);
  const phaseR = (3 / (16 * Math.PI)) * (1 + cosT * cosT);
  const g = ATM.g;
  const phaseM = ((1 - g * g) / (4 * Math.PI)) / Math.pow(1 + g * g - 2 * g * cosT, 1.5);
  let L0 = 0, L1 = 0, L2 = 0;
  let T0 = 1, T1 = 1, T2 = 1;
  for (let i = 0; i < steps; i++) {
    const s0 = i / steps, s1 = (i + 1) / steps;
    const t0 = tMax * s0 * s0, t1 = tMax * s1 * s1;
    const dt = t1 - t0, tm = 0.5 * (t0 + t1);
    _p.copy(rd).multiplyScalar(tm).add(_ro);
    const alt = _p.length() - ATM.Rg;
    const dR = Math.exp(-alt / ATM.HR), dM = Math.exp(-alt / ATM.HM) * mie;
    extinctionJS(alt, mie, _ext);
    const e0 = _ext[0], e1 = _ext[1], e2 = _ext[2];
    const st0 = Math.exp(-e0 * dt), st1 = Math.exp(-e1 * dt), st2 = Math.exp(-e2 * dt);
    sunTransmittanceJS(_p, sunDir, mie, _tsun, 6);
    const sc = (c) => ATM.betaR[c] * dR * phaseR + ATM.betaMs * dM * phaseM;
    const ms = (ATM.betaR[0] * dR + ATM.betaMs * dM) * (ATM.msFactor / (4 * Math.PI));
    const ms1 = (ATM.betaR[1] * dR + ATM.betaMs * dM) * (ATM.msFactor / (4 * Math.PI));
    const ms2 = (ATM.betaR[2] * dR + ATM.betaMs * dM) * (ATM.msFactor / (4 * Math.PI));
    const S0 = _tsun[0] * (sc(0) + ms), S1 = _tsun[1] * (sc(1) + ms1), S2 = _tsun[2] * (sc(2) + ms2);
    L0 += T0 * (S0 - S0 * st0) / Math.max(e0, 1e-9);
    L1 += T1 * (S1 - S1 * st1) / Math.max(e1, 1e-9);
    L2 += T2 * (S2 - S2 * st2) / Math.max(e2, 1e-9);
    T0 *= st0; T1 *= st1; T2 *= st2;
  }
  if (hitsGround) {
    _p.copy(rd).multiplyScalar(tMax).add(_ro);
    sunTransmittanceJS(_p, sunDir, mie, _tsun, 6);
    const ndl = Math.max(0, _p.clone().normalize().dot(sunDir));
    L0 += T0 * ATM.groundAlbedo[0] / Math.PI * _tsun[0] * ndl;
    L1 += T1 * ATM.groundAlbedo[1] / Math.PI * _tsun[1] * ndl;
    L2 += T2 * ATM.groundAlbedo[2] / Math.PI * _tsun[2] * ndl;
  }
  out[0] = L0; out[1] = L1; out[2] = L2;
  return out;
}
