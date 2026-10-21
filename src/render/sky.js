// Cielo atmosférico: LUT de dispersión (GPU) + cúpula (shader propio) + entorno PMREM para IBL.
// La LUT guarda la radiancia del cielo despejado en función de (azimut relativo al sol, elevación) para una elevación
// solar dada; se regenera solo cuando el sol se mueve lo suficiente o cambia la turbidez (clima).
import * as THREE from 'three';
import { ATM, GLSL_ATMOSPHERE } from './atmosphere.js';

const LUT_W = 256, LUT_H = 128;

const LUT_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const LUT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uSunElev;
uniform float uMie;
uniform float uObsAlt;
${GLSL_ATMOSPHERE}
const float MS_FACTOR = ${ATM.msFactor.toFixed(3)};
const vec3 GROUND_ALB = vec3(${ATM.groundAlbedo.join(', ')});
void main() {
  float phi = vUv.x * PI_A;
  float elev = vUv.y * vUv.y * (PI_A * 0.5);
  vec3 rd = vec3(cos(elev) * cos(phi), sin(elev), cos(elev) * sin(phi));
  vec3 sun = vec3(cos(uSunElev), sin(uSunElev), 0.0);
  vec3 ro = vec3(0.0, RG + uObsAlt, 0.0);
  float tMax;
  vec2 gh = raySphere(ro, rd, RG);
  bool hitG = gh.x > 0.0;
  if (hitG) tMax = gh.x; else tMax = raySphere(ro, rd, RT).y;
  float cosT = dot(rd, sun);
  float phaseR = 3.0 / (16.0 * PI_A) * (1.0 + cosT * cosT);
  float g = G_MIE;
  float phaseM = (1.0 - g * g) / (4.0 * PI_A) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  const int N = 48;
  for (int i = 0; i < N; i++) {
    float s0 = float(i) / float(N);
    float s1 = float(i + 1) / float(N);
    float t0 = tMax * s0 * s0;
    float t1 = tMax * s1 * s1;
    float dt = t1 - t0;
    vec3 p = ro + rd * (0.5 * (t0 + t1));
    float alt = length(p) - RG;
    float dR = exp(-alt / H_R);
    float dM = exp(-alt / H_M) * uMie;
    vec3 ext = extinctionAt(alt, uMie);
    vec3 stepT = exp(-ext * dt);
    vec3 Ts = sunTransmittance(p, sun, uMie);
    vec3 scat = BETA_R * dR * phaseR + vec3(BETA_MS * dM * phaseM);
    vec3 ms = (BETA_R * dR + vec3(BETA_MS * dM)) * (MS_FACTOR / (4.0 * PI_A));
    vec3 S = Ts * (scat + ms);
    L += T * (S - S * stepT) / max(ext, vec3(1e-9));
    T *= stepT;
  }
  gl_FragColor = vec4(L, 1.0);
}
`;

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p;
  gl_Position.z = p.w * 0.999995;
}
`;

const DOME_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform sampler2D uSkyLUT;
uniform vec3 uSunDir;
uniform vec2 uSunH;
uniform float uSkyScale;
uniform vec3 uSunDisc;
uniform float uEnv;
uniform vec3 uGroundColor;
uniform float uOvercast;
uniform vec3 uOvercastColor;
uniform float uFlash;
const float PI_D = 3.14159265359;

vec3 skyLUT(vec3 d) {
  float elev = asin(clamp(d.y, -1.0, 1.0));
  vec2 hh = d.xz;
  float hl = length(hh);
  vec2 hn = hl > 1e-4 ? hh / hl : uSunH;
  float phi = acos(clamp(dot(hn, uSunH), -1.0, 1.0));
  float v = sqrt(max(elev, 0.0) / (PI_D * 0.5));
  return texture2D(uSkyLUT, vec2(phi / PI_D, clamp(v, 0.002, 0.998))).rgb;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 sky = skyLUT(dir) * uSkyScale;
  // cielo cubierto: mezcla hacia un gris luminoso con gradiente cenital
  float zen = clamp(dir.y, 0.0, 1.0);
  vec3 ov = uOvercastColor * (0.55 + 0.45 * sqrt(zen));
  sky = mix(sky, ov, uOvercast);
  sky += uFlash * vec3(0.65, 0.75, 1.0);

  float cs = dot(dir, uSunDir);
  float sunAng = acos(clamp(cs, -1.0, 1.0));
  float rs = 0.0125; // radio angular del disco (rad)
  if (uEnv < 0.5) {
    float disc = 1.0 - smoothstep(rs * 0.94, rs, sunAng);
    float mu = sqrt(max(1.0 - (sunAng / rs) * (sunAng / rs), 0.0));
    float limb = 0.45 + 0.55 * pow(mu, 0.6);
    float horizonFade = smoothstep(-0.012, 0.006, dir.y);
    float glare = 0.0012 / (sunAng * sunAng + 0.0006);
    sky += uSunDisc * (disc * limb + glare * 0.5) * horizonFade * (1.0 - uOvercast * 0.85);
  }
  if (dir.y < 0.0) {
    vec3 g = mix(sky, uGroundColor, uEnv);
    sky = mix(sky, g, smoothstep(0.0, -0.08, dir.y));
  }
  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createSky(ctx, renderer) {
  // --- LUT ---
  const lutRT = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, generateMipmaps: false,
  });
  lutRT.texture.wrapS = lutRT.texture.wrapT = THREE.ClampToEdgeWrapping;
  const lutMat = new THREE.ShaderMaterial({
    vertexShader: LUT_VERT, fragmentShader: LUT_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uSunElev: { value: 0.5 }, uMie: { value: 1 }, uObsAlt: { value: ATM.obsAlt } },
  });
  const lutQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lutMat);
  lutQuad.frustumCulled = false;
  const lutScene = new THREE.Scene();
  lutScene.add(lutQuad);
  const lutCam = new THREE.Camera();
  let lutElev = 9, lutMie = -1;

  function updateLUT(sunElev, mie, force = false) {
    if (!force && Math.abs(sunElev - lutElev) < 0.0006 && Math.abs(mie - lutMie) < 0.02) return false;
    lutElev = sunElev; lutMie = mie;
    lutMat.uniforms.uSunElev.value = sunElev;
    lutMat.uniforms.uMie.value = mie;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(lutRT);
    renderer.render(lutScene, lutCam);
    renderer.setRenderTarget(prev);
    return true;
  }

  // --- cúpula ---
  function makeDomeMaterial(env) {
    return new THREE.ShaderMaterial({
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uSkyLUT: { value: lutRT.texture },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunH: { value: new THREE.Vector2(1, 0) },
        uSkyScale: { value: ATM.sunI },
        uSunDisc: { value: new THREE.Color(1, 1, 1) },
        uEnv: { value: env ? 1 : 0 },
        uGroundColor: { value: new THREE.Color(0.1, 0.1, 0.08) },
        uOvercast: { value: 0 },
        uOvercastColor: { value: new THREE.Color(0.5, 0.55, 0.62) },
        uFlash: { value: 0 },
      },
    });
  }
  const domeGeo = new THREE.SphereGeometry(1, 48, 24);
  const domeMat = makeDomeMaterial(false);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'cielo';
  dome.frustumCulled = false;
  dome.renderOrder = 100000; // después de todo lo opaco, antes de lo transparente
  dome.onBeforeRender = (r, s, cam) => dome.position.copy(cam.position);
  ctx.scene.add(dome);

  // --- entorno para IBL ---
  const envMat = makeDomeMaterial(true);
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(domeGeo, envMat);
  envDome.frustumCulled = false;
  envScene.add(envDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function updateEnvironment(size = 128) {
    const prev = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 10, { size });
    ctx.scene.environment = envRT.texture;
    if (prev) prev.dispose();
  }

  const mats = [domeMat, envMat];
  const setAll = (name, fn) => { for (const m of mats) fn(m.uniforms[name].value); };

  return {
    dome, domeMat, envMat, lutRT, updateLUT, updateEnvironment,
    /** Aplica el estado del cielo a los uniforms de ambas cúpulas. */
    setState(s) {
      setAll('uSunDir', (v) => v.copy(s.sunDir));
      const hl = Math.hypot(s.sunDir.x, s.sunDir.z);
      setAll('uSunH', (v) => (hl > 1e-4 ? v.set(s.sunDir.x / hl, s.sunDir.z / hl) : v.set(1, 0)));
      setAll('uSkyScale', (v) => v); // reservado
      domeMat.uniforms.uSunDisc.value.copy(s.sunDisc);
      setAll('uGroundColor', (v) => v.copy(s.ground));
      setAll('uOvercast', (v) => v);
      domeMat.uniforms.uOvercast.value = s.overcast;
      envMat.uniforms.uOvercast.value = s.overcast;
      setAll('uOvercastColor', (v) => v.copy(s.overcastColor));
      domeMat.uniforms.uFlash.value = s.flash;
      envMat.uniforms.uFlash.value = s.flash * 0.5;
    },
    dispose() {
      lutRT.dispose(); lutMat.dispose(); domeGeo.dispose(); domeMat.dispose(); envMat.dispose();
      pmrem.dispose(); envRT?.dispose();
      ctx.scene.remove(dome);
    },
  };
}
