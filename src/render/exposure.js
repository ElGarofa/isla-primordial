// Auto-exposición (adaptación del ojo) en GPU, sin lecturas a CPU:
//  1) luminancia logarítmica de la escena HDR a 64x64 (ponderada al centro)  2) 64 -> 8  3) 8 -> 1 con adaptación temporal.
// El resultado (un multiplicador de exposición) vive en una textura 1x1 que lee el pase de gradación.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const LOG_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
void main() {
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float s = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 o = (vec2(float(x), float(y)) + 0.5) / 4.0 - 0.5;
    vec2 uv = vUv + o / 64.0;
    vec3 c = texture2D(tSrc, uv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    s += log2(clamp(l, 1e-3, 24.0));
  }
  s /= 16.0;
  // peso hacia el centro de la pantalla
  vec2 d = vUv - 0.5;
  float w = exp(-dot(d, d) * 5.0);
  gl_FragColor = vec4(s * w, w, 0.0, 1.0);
}
`;
const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uN; // lado del bloque a promediar
void main() {
  vec2 acc = vec2(0.0);
  float texel = 1.0 / (uN * 8.0);
  for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
    vec2 uv = vUv + ((vec2(float(x), float(y)) + 0.5) / 8.0 - 0.5) / 8.0;
    acc += texture2D(tSrc, uv).rg;
  }
  gl_FragColor = vec4(acc / 64.0, 0.0, 1.0);
}
`;
const ADAPT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;   // 8x8 (log lum ponderada, peso)
uniform sampler2D tPrev;  // exposición previa 1x1
uniform float uKey;
uniform float uMin;
uniform float uMax;
uniform float uDt;
uniform float uSnap;
uniform float uSpeedUp;
uniform float uSpeedDown;
void main() {
  vec2 acc = vec2(0.0);
  for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
    acc += texture2D(tSrc, (vec2(float(x), float(y)) + 0.5) / 8.0).rg;
  }
  float avgLog = acc.x / max(acc.y, 1e-4);
  float target = clamp(uKey / exp2(avgLog), uMin, uMax);
  float prev = texture2D(tPrev, vec2(0.5)).r;
  float speed = target > prev ? uSpeedUp : uSpeedDown;
  float cur = uSnap > 0.5 ? target : mix(prev, target, 1.0 - exp(-uDt * speed));
  gl_FragColor = vec4(cur, avgLog, 0.0, 1.0);
}
`;

export class ExposureEffect {
  constructor() {
    const opts = (w, h) => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.rt64 = opts(64, 64);
    this.rt8 = opts(8, 8);
    this.pp = [opts(1, 1), opts(1, 1)];
    this.cur = 0;
    this.quad = new FullScreenQuad(null);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.logMat = mk(LOG_FRAG, { tSrc: { value: null } });
    this.downMat = mk(DOWN_FRAG, { tSrc: { value: null }, uN: { value: 8 } });
    this.adaptMat = mk(ADAPT_FRAG, {
      tSrc: { value: null }, tPrev: { value: null }, uKey: { value: 0.18 }, uMin: { value: 0.3 }, uMax: { value: 4 },
      uDt: { value: 0.016 }, uSnap: { value: 1 }, uSpeedUp: { value: 1.6 }, uSpeedDown: { value: 2.6 },
    });
    // exposición inicial = 1
    this.snap = true;
    this.params = { key: 0.18, min: 0.3, max: 4 };
  }

  get texture() { return this.pp[this.cur].texture; }

  /** Fuerza que el próximo cálculo salte directo al valor objetivo (primer frame, cambios de hora bruscos, capturas). */
  forceSnap() { this.snap = true; }

  render(renderer, src, dt) {
    const q = this.quad;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    q.material = this.logMat;
    this.logMat.uniforms.tSrc.value = src;
    renderer.setRenderTarget(this.rt64);
    q.render(renderer);

    q.material = this.downMat;
    this.downMat.uniforms.tSrc.value = this.rt64.texture;
    renderer.setRenderTarget(this.rt8);
    q.render(renderer);

    const next = 1 - this.cur;
    q.material = this.adaptMat;
    const u = this.adaptMat.uniforms;
    u.tSrc.value = this.rt8.texture;
    u.tPrev.value = this.pp[this.cur].texture;
    u.uKey.value = this.params.key;
    u.uMin.value = this.params.min;
    u.uMax.value = this.params.max;
    u.uDt.value = Math.min(dt, 0.25);
    u.uSnap.value = this.snap ? 1 : 0;
    renderer.setRenderTarget(this.pp[next]);
    q.render(renderer);
    this.cur = next;
    this.snap = false;
    renderer.autoClear = prevAuto;
  }

  dispose() {
    this.rt64.dispose(); this.rt8.dispose(); this.pp[0].dispose(); this.pp[1].dispose();
    this.logMat.dispose(); this.downMat.dispose(); this.adaptMat.dispose(); this.quad.dispose();
  }
}
