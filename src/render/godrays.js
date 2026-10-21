// Rayos de luz (god rays) en espacio de pantalla: desenfoque radial hacia la posición del sol sobre una máscara de
// cielo brillante (disco, aureola, bordes de nubes). La silueta del terreno, los árboles y los huecos entre nubes
// producen los haces. Se calcula a media resolución.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSun;      // posición del sol en uv
uniform float uDensity;
uniform float uThreshold;
uniform float uAspect;
const int N = SAMPLES;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 delta = (uSun - vUv) * uDensity / float(N);
  vec2 uv = vUv + delta * ign(gl_FragCoord.xy);
  float acc = 0.0;
  float decay = 1.0;
  float wsum = 0.0;
  for (int i = 0; i < N; i++) {
    uv += delta;
    float d = texture2D(tDepth, uv).r;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    if (d >= 0.99998 && inside > 0.5) {
      vec3 c = texture2D(tColor, uv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      acc += decay * clamp((l - uThreshold) / (uThreshold * 3.0 + 1.0), 0.0, 3.0);
    }
    wsum += decay;
    decay *= 0.965;
  }
  float v = acc / max(wsum, 1e-3);
  // atenuación con la distancia al sol en pantalla
  vec2 d2 = (uSun - vUv) * vec2(uAspect, 1.0);
  v *= 1.0 / (1.0 + dot(d2, d2) * 1.2);
  gl_FragColor = vec4(vec3(v), 1.0);
}
`;

export class GodRays {
  constructor() {
    this.enabled = false;
    this.quad = new FullScreenQuad(null);
    this.rt = null;
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.mat = null;
    this.w = 4; this.h = 4;
    this.sunUV = new THREE.Vector2(0.5, 0.5);
    this.intensity = 0;
  }
  get texture() { return this.enabled && this.rt && this.intensity > 0 ? this.rt.texture : this.black; }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), {
      type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
  }

  /** Calcula la posición del sol en pantalla. Devuelve la fracción visible (0 si está detrás de la cámara). */
  project(camera, sunDir) {
    const v = new THREE.Vector3().copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    // detrás de la cámara: z > 1 tras project() en perspectiva
    const e = camera.matrixWorldInverse.elements;
    const viewZ = e[2] * (camera.position.x + sunDir.x) + e[6] * (camera.position.y + sunDir.y) + e[10] * (camera.position.z + sunDir.z) + e[14];
    this.sunUV.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    return viewZ < 0 ? 1 : 0;
  }

  render(renderer, sceneRT, camera, sunDir, strength, aspect) {
    if (!this.enabled || !this.rt) return;
    const front = this.project(camera, sunDir);
    // se desvanece cuando el sol sale mucho de cuadro
    const ox = Math.max(0, Math.abs(this.sunUV.x - 0.5) - 0.5), oy = Math.max(0, Math.abs(this.sunUV.y - 0.5) - 0.5);
    const offscreen = Math.hypot(ox, oy);
    this.intensity = strength * front * Math.max(0, 1 - offscreen * 1.6);
    if (this.intensity <= 0.001) return;
    if (!this.mat) {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, defines: { SAMPLES: 40 },
        uniforms: {
          tColor: { value: null }, tDepth: { value: null }, uSun: { value: this.sunUV }, uDensity: { value: 0.95 },
          uThreshold: { value: 1.6 }, uAspect: { value: 1.78 },
        },
      });
    }
    const u = this.mat.uniforms;
    u.tColor.value = sceneRT.texture;
    u.tDepth.value = sceneRT.depthTexture;
    u.uAspect.value = aspect;
    this.quad.material = this.mat;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    renderer.autoClear = prevAuto;
  }

  dispose() { this.rt?.dispose(); this.mat?.dispose(); this.black.dispose(); this.quad.dispose(); }
}
