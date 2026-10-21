// Oclusión ambiental tipo GTAO (Jimenez et al., "Practical Realtime Strategies for Accurate Indirect Occlusion"),
// calculada solo a partir del depth del pase principal: no repite la geometría de la escena (ahorra draw calls y
// respeta el viento/desplazamientos de los shaders ajenos). Normales reconstruidas del depth. Desenfoque bilateral
// separable. El resultado multiplica la luz indirecta en el pase de composición (post.js).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uProjScale;   // proj[0][0], proj[1][1]
uniform vec2 uSize;        // tamaño del depth en píxeles
uniform float uRadius;     // radio en metros
uniform float uFalloff;
uniform float uIntensity;
const int SLICES = SLICE_COUNT;
const int STEPS = STEP_COUNT;
const float PI_ = 3.14159265359;

vec3 viewPos(vec2 uv, float d) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float fastAcos(float x) {
  x = clamp(x, -1.0, 1.0); // evita sqrt de negativos (NaN) por error de redondeo
  float a = abs(x);
  float r = (-0.0187293 * a + 0.0742610) * a - 0.2121144;
  r = (r * a + 1.5707288) * sqrt(1.0 - a);
  return x >= 0.0 ? r : PI_ - r;
}

void main() {
  float d0 = texture2D(tDepth, vUv).r;
  if (d0 >= 0.99998) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
  vec3 P = viewPos(vUv, d0);
  vec2 px = 1.0 / uSize;
  // normal desde el depth: elegimos el vecino más cercano en cada eje
  float dl = texture2D(tDepth, vUv - vec2(px.x, 0.0)).r, dr = texture2D(tDepth, vUv + vec2(px.x, 0.0)).r;
  float du = texture2D(tDepth, vUv + vec2(0.0, px.y)).r, dd = texture2D(tDepth, vUv - vec2(0.0, px.y)).r;
  vec3 Pl = viewPos(vUv - vec2(px.x, 0.0), dl), Pr = viewPos(vUv + vec2(px.x, 0.0), dr);
  vec3 Pu = viewPos(vUv + vec2(0.0, px.y), du), Pd = viewPos(vUv - vec2(0.0, px.y), dd);
  vec3 ddx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 ddy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 Nc = cross(ddx, ddy);
  // Vecinos con la misma profundidad dan un producto cruz nulo: normalize() sería NaN y el desenfoque lo propaga por toda la fila/columna.
  if (!(dot(Nc, Nc) > 1e-18)) { gl_FragColor = vec4(1.0, -P.z, 0.0, 1.0); return; }
  vec3 N = normalize(Nc);
  if (N.z < 0.0) N = -N;
  vec3 V = normalize(-P);
  float viewZ = -P.z;
  // Más allá de ~45 m las normales reconstruidas del depth son ruidosas (escalones en pendientes): sin AO.
  if (viewZ > 45.0) { gl_FragColor = vec4(1.0, viewZ, 0.0, 1.0); return; }

  // radio en pantalla (uv) para este píxel
  vec2 rUv = uRadius * 0.5 * uProjScale / viewZ;
  float maxPx = 0.14 * uSize.y;
  float rPx = rUv.y * uSize.y;
  if (rPx > maxPx) rUv *= maxPx / rPx;
  if (rPx < 3.0) { gl_FragColor = vec4(1.0, viewZ, 0.0, 1.0); return; }

  float noise = ign(gl_FragCoord.xy);
  float noise2 = fract(noise * 7.31 + 0.37);
  float vis = 0.0;
  for (int s = 0; s < SLICES; s++) {
    float phi = (float(s) + noise) / float(SLICES) * PI_;
    vec2 om = vec2(cos(phi), sin(phi));
    vec3 dir3 = vec3(om, 0.0);
    vec3 ortho = dir3 - dot(dir3, V) * V;
    vec3 axis = normalize(cross(ortho, V));
    vec3 projN = N - axis * dot(N, axis);
    float projLen = length(projN);
    float signN = sign(dot(ortho, projN));
    float cosN = clamp(dot(projN, V) / max(projLen, 1e-4), 0.0, 1.0);
    float n = signN * fastAcos(cosN);
    float low0 = cos(n + PI_ * 0.5);
    float low1 = cos(n - PI_ * 0.5);
    float h0 = low0, h1 = low1;
    for (int t = 0; t < STEPS; t++) {
      float st = (float(t) + noise2) / float(STEPS);
      st = st * st + 0.02;
      vec2 off = om * rUv * st;
      vec2 uvA = vUv + off;
      vec2 uvB = vUv - off;
      float dA = texture2D(tDepth, uvA).r;
      float dB = texture2D(tDepth, uvB).r;
      if (dA < 0.99998) {
        vec3 dv = viewPos(uvA, dA) - P;
        float len = length(dv);
        float shc = dot(dv / max(len, 1e-4), V);
        float w = clamp((len - uRadius * uFalloff) / (uRadius * (1.0 - uFalloff)) , 0.0, 1.0);
        h0 = max(h0, mix(shc, low0, w));
      }
      if (dB < 0.99998) {
        vec3 dv = viewPos(uvB, dB) - P;
        float len = length(dv);
        float shc = dot(dv / max(len, 1e-4), V);
        float w = clamp((len - uRadius * uFalloff) / (uRadius * (1.0 - uFalloff)) , 0.0, 1.0);
        h1 = max(h1, mix(shc, low1, w));
      }
    }
    float a0 = -fastAcos(h1);
    float a1 = fastAcos(h0);
    a0 = n + clamp(a0 - n, -PI_ * 0.5, PI_ * 0.5);
    a1 = n + clamp(a1 - n, -PI_ * 0.5, PI_ * 0.5);
    float sn = sin(n);
    float arc0 = (cosN + 2.0 * a0 * sn - cos(2.0 * a0 - n)) * 0.25;
    float arc1 = (cosN + 2.0 * a1 * sn - cos(2.0 * a1 - n)) * 0.25;
    vis += projLen * (arc0 + arc1);
  }
  vis = clamp(vis / float(SLICES), 0.0, 1.0);
  vis = pow(vis, uIntensity);
  vis = mix(vis, 1.0, smoothstep(18.0, 45.0, viewZ)); // fundido con la distancia
  if (!(vis >= 0.0 && vis <= 1.0)) vis = 1.0; // cualquier NaN residual: sin oclusión
  gl_FragColor = vec4(vis, viewZ, 0.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir; // (1/w, 0) o (0, 1/h)
void main() {
  vec2 c = texture2D(tSrc, vUv).rg;
  if (!(c.y > 0.0) || !(c.x >= 0.0)) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
  float sum = c.x;
  float wsum = 1.0;
  for (int i = 1; i <= 4; i++) {
    float g = exp(-float(i * i) * 0.12);
    vec2 a = texture2D(tSrc, vUv + uDir * float(i)).rg;
    vec2 b = texture2D(tSrc, vUv - uDir * float(i)).rg;
    float wa = g * ((a.y > 0.0 && a.x >= 0.0) ? exp(-abs(a.y - c.y) / (0.05 * c.y + 0.03)) : 0.0);
    float wb = g * ((b.y > 0.0 && b.x >= 0.0) ? exp(-abs(b.y - c.y) / (0.05 * c.y + 0.03)) : 0.0);
    if (!(a.x >= 0.0)) a.x = 0.0;
    if (!(b.x >= 0.0)) b.x = 0.0;
    sum += a.x * wa + b.x * wb;
    wsum += wa + wb;
  }
  gl_FragColor = vec4(sum / wsum, c.y, 0.0, 1.0);
}
`;

const LEVELS = [
  null,
  { scale: 0.5, slices: 2, steps: 6, radius: 1.4 },  // medio
  { scale: 0.5, slices: 3, steps: 8, radius: 1.7 },  // alto
  { scale: 1.0, slices: 3, steps: 10, radius: 1.9 }, // ultra
];

export class AOEffect {
  constructor() {
    this.level = 0;
    this.quad = new FullScreenQuad(null);
    this.rtA = null; this.rtB = null;
    this.aoMat = null;
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    });
    this.w = 4; this.h = 4;
  }
  get texture() { return this.rtA?.texture ?? null; }

  configure(level) {
    if (level === this.level && this.aoMat) return;
    this.level = level;
    this.aoMat?.dispose();
    this.aoMat = null;
    const L = LEVELS[level];
    if (!L) return;
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
      defines: { SLICE_COUNT: L.slices, STEP_COUNT: L.steps },
      uniforms: {
        tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProjScale: { value: new THREE.Vector2(1, 1) },
        uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: L.radius }, uFalloff: { value: 0.6 }, uIntensity: { value: 1.15 },
      },
    });
    this.setSize(this.w, this.h);
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    const L = LEVELS[this.level];
    this.rtA?.dispose(); this.rtB?.dispose();
    this.rtA = this.rtB = null;
    if (!L) return;
    const sw = Math.max(2, Math.floor(w * L.scale)), sh = Math.max(2, Math.floor(h * L.scale));
    const mk = () => new THREE.WebGLRenderTarget(sw, sh, {
      type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.rtA = mk(); this.rtB = mk();
  }

  render(renderer, sceneRT, camera) {
    if (!this.aoMat || !this.rtA) return;
    const q = this.quad;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    const u = this.aoMat.uniforms;
    u.tDepth.value = sceneRT.depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uProjScale.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    u.uSize.value.set(sceneRT.width, sceneRT.height);
    q.material = this.aoMat;
    renderer.setRenderTarget(this.rtA);
    q.render(renderer);
    q.material = this.blurMat;
    this.blurMat.uniforms.tSrc.value = this.rtA.texture;
    this.blurMat.uniforms.uDir.value.set(1 / this.rtA.width, 0);
    renderer.setRenderTarget(this.rtB);
    q.render(renderer);
    this.blurMat.uniforms.tSrc.value = this.rtB.texture;
    this.blurMat.uniforms.uDir.value.set(0, 1 / this.rtA.height);
    renderer.setRenderTarget(this.rtA);
    q.render(renderer);
    renderer.autoClear = prevAuto;
  }

  dispose() {
    this.rtA?.dispose(); this.rtB?.dispose(); this.aoMat?.dispose(); this.blurMat.dispose(); this.quad.dispose();
  }
}
