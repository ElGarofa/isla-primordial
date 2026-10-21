// Bloom "físico" por cadena de submuestreo/sobremuestreo (estilo Call of Duty: AW / Jimenez):
// sin umbral duro (conserva energía), filtro de 13 taps con promedio de Karis en el primer nivel para evitar
// "fireflies", y sobremuestreo con filtro de tienda 3x3 acumulado. Devuelve la textura del resultado: el pase de
// gradación la suma a la escena (así no hace falta un pase extra de composición).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel; // 1 / tamaño de la fuente
uniform float uKaris;
uniform float uClamp;
vec3 fetch(vec2 uv) { return min(texture2D(tSrc, uv).rgb, vec3(uClamp)); }
float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main() {
  vec2 t = uTexel;
  vec3 a = fetch(vUv + t * vec2(-2.0,  2.0));
  vec3 b = fetch(vUv + t * vec2( 0.0,  2.0));
  vec3 c = fetch(vUv + t * vec2( 2.0,  2.0));
  vec3 d = fetch(vUv + t * vec2(-2.0,  0.0));
  vec3 e = fetch(vUv);
  vec3 f = fetch(vUv + t * vec2( 2.0,  0.0));
  vec3 g = fetch(vUv + t * vec2(-2.0, -2.0));
  vec3 h = fetch(vUv + t * vec2( 0.0, -2.0));
  vec3 i = fetch(vUv + t * vec2( 2.0, -2.0));
  vec3 j = fetch(vUv + t * vec2(-1.0,  1.0));
  vec3 k = fetch(vUv + t * vec2( 1.0,  1.0));
  vec3 l = fetch(vUv + t * vec2(-1.0, -1.0));
  vec3 m = fetch(vUv + t * vec2( 1.0, -1.0));
  vec3 r;
  if (uKaris > 0.5) {
    // 5 grupos de 4 taps, cada uno ponderado por 1/(1+luma)
    vec3 g0 = (a + b + d + e) * 0.25;
    vec3 g1 = (b + c + e + f) * 0.25;
    vec3 g2 = (d + e + g + h) * 0.25;
    vec3 g3 = (e + f + h + i) * 0.25;
    vec3 g4 = (j + k + l + m) * 0.25;
    r = g0 * (0.125 * kw(g0)) + g1 * (0.125 * kw(g1)) + g2 * (0.125 * kw(g2)) + g3 * (0.125 * kw(g3)) + g4 * (0.5 * kw(g4));
    float wsum = 0.125 * (kw(g0) + kw(g1) + kw(g2) + kw(g3)) + 0.5 * kw(g4);
    r /= wsum;
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(r, 1.0);
}
`;

const UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel; // 1 / tamaño de la fuente (nivel más pequeño)
uniform float uRadius;
uniform float uWeight;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2( t.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0,  t.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2( t.x, -t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(-t.x,  t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2( t.x,  t.y)).rgb;
  gl_FragColor = vec4(s * (uWeight / 16.0), 1.0);
}
`;

export class Bloom {
  constructor(levels = 6) {
    this.levels = levels;
    this.rts = [];
    this.scatter = 0.72;
    this.radius = 1.0;
    this.quad = new FullScreenQuad(null);
    this.downMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 }, uClamp: { value: 2000 } },
    });
    this.upMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: UP_FRAG, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } },
    });
    this.width = 4; this.height = 4;
  }

  setLevels(n) { this.levels = n; this.setSize(this.width, this.height); }

  setSize(w, h) {
    this.width = w; this.height = h;
    for (const rt of this.rts) rt.dispose();
    this.rts.length = 0;
    let cw = Math.max(2, Math.floor(w / 2)), ch = Math.max(2, Math.floor(h / 2));
    for (let i = 0; i < this.levels; i++) {
      const rt = new THREE.WebGLRenderTarget(cw, ch, {
        type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
      this.rts.push(rt);
      cw = Math.max(2, Math.floor(cw / 2)); ch = Math.max(2, Math.floor(ch / 2));
    }
  }

  get texture() { return this.rts[0].texture; }

  /** src: textura HDR de entrada (a resolución completa). */
  render(renderer, src, srcW, srcH) {
    const q = this.quad;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    // bajada
    let input = src, iw = srcW, ih = srcH;
    q.material = this.downMat;
    for (let i = 0; i < this.levels; i++) {
      const rt = this.rts[i];
      this.downMat.uniforms.tSrc.value = input;
      this.downMat.uniforms.uTexel.value.set(1 / iw, 1 / ih);
      this.downMat.uniforms.uKaris.value = i === 0 ? 1 : 0;
      renderer.setRenderTarget(rt);
      q.render(renderer);
      input = rt.texture; iw = rt.width; ih = rt.height;
    }
    // subida (acumulativa, aditiva sobre el nivel más fino)
    q.material = this.upMat;
    for (let i = this.levels - 2; i >= 0; i--) {
      const small = this.rts[i + 1];
      this.upMat.uniforms.tSrc.value = small.texture;
      this.upMat.uniforms.uTexel.value.set(1 / small.width, 1 / small.height);
      this.upMat.uniforms.uRadius.value = this.radius;
      this.upMat.uniforms.uWeight.value = this.scatter;
      renderer.setRenderTarget(this.rts[i]);
      q.render(renderer);
    }
    renderer.autoClear = prevAuto;
  }

  dispose() {
    for (const rt of this.rts) rt.dispose();
    this.downMat.dispose(); this.upMat.dispose(); this.quad.dispose();
  }
}
