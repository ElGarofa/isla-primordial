// Postproceso del juego. Cadena (EffectComposer):
//   ScenePass (HDR, MSAA opcional, depth texture) -> Composite (AO) -> Viewmodel -> Bloom -> Grade (exposición, efectos de
//   cámara, tone mapping, gradación, viñeta; salida sRGB) -> FXAA/SMAA -> Final (grano, nitidez, dither).
// Todo trabaja en HDR lineal (half float) hasta el pase de gradación.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { Bloom } from './bloom.js';
import { AOEffect } from './ao.js';
import { ExposureEffect } from './exposure.js';
import { GodRays } from './godrays.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const mkMat = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
  vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending, ...extra,
});

// ---------------------------------------------------------------------------------------------
class ScenePass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.needsSwap = false;
    this.rt = null;
    this.samples = 0;
    this.w = 4; this.h = 4;
  }
  build(w, h, samples) {
    this.w = w; this.h = h; this.samples = samples;
    this.rt?.depthTexture?.dispose();
    this.rt?.dispose();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    depth.format = THREE.DepthFormat;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.rt.texture.name = 'render.scene';
  }
  setSize(w, h) { this.build(w, h, this.samples); }
  render(renderer) {
    const { ctx, hooks } = this.pipe;
    hooks.beforeScene?.();
    renderer.setRenderTarget(this.rt);
    renderer.render(ctx.scene, ctx.camera);
  }
}

// ---------------------------------------------------------------------------------------------
const COMPOSITE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
#ifdef USE_AO
uniform sampler2D tAO;
uniform float uAOStrength;
#endif
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
#ifdef USE_AO
  float ao = texture2D(tAO, vUv).r;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // el AO ambiental pesa menos donde llega mucha luz directa
  float k = uAOStrength * mix(1.0, 0.45, smoothstep(0.4, 2.2, lum));
  vec3 a = vec3(pow(ao, 1.0 + 1.6 * k));
  // multi-bounce (Jimenez 2016): aclara el AO en superficies claras
  vec3 albedoish = clamp(c / (lum + 0.35) * 0.6 + 0.2, 0.0, 1.0);
  vec3 aa = 2.0404 * albedoish - 0.3324;
  vec3 bb = -4.7951 * albedoish + 0.6417;
  vec3 cc = 2.7552 * albedoish + 0.6903;
  a = max(a, ((a * aa + bb) * a + cc) * a);
  c *= mix(vec3(1.0), a, min(1.0, k));
#endif
  gl_FragColor = vec4(c, 1.0);
}
`;

class CompositePass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.needsSwap = true;
    this.uniforms = { tColor: { value: null }, tAO: { value: null }, uAOStrength: { value: 1 } };
    this.mat = mkMat(COMPOSITE_FRAG, this.uniforms);
    this.quad = new FullScreenQuad(this.mat);
    this.useAO = false;
  }
  setAO(on) {
    if (on !== this.useAO) { this.useAO = on; this.mat.defines = on ? { USE_AO: '' } : {}; this.mat.needsUpdate = true; }
  }
  render(renderer, writeBuffer) {
    const p = this.pipe;
    if (this.useAO) {
      p.ao.render(renderer, p.scenePass.rt, p.ctx.camera);
      this.uniforms.tAO.value = p.ao.texture;
      this.uniforms.uAOStrength.value = p.aoStrength;
    }
    this.uniforms.tColor.value = p.scenePass.rt.texture;
    renderer.setRenderTarget(writeBuffer);
    this.quad.render(renderer);
  }
}

// ---------------------------------------------------------------------------------------------
class ViewmodelPass extends Pass {
  constructor(pipe) { super(); this.pipe = pipe; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const vm = this.pipe.ctx.viewmodel;
    if (!vm || !vm.scene || !vm.camera) return;
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    renderer.clearDepth();
    renderer.render(vm.scene, vm.camera);
    renderer.autoClear = prev;
  }
}

// ---------------------------------------------------------------------------------------------
class BloomPass extends Pass {
  // Calcula bloom, exposición automática y god rays a partir del buffer actual (no escribe en la cadena principal).
  constructor(pipe) { super(); this.pipe = pipe; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer, deltaTime) {
    const p = this.pipe;
    p.bloom.render(renderer, readBuffer.texture, readBuffer.width, readBuffer.height);
    p.exposure.render(renderer, readBuffer.texture, p.ctx.time.realDt || deltaTime || 0.016);
    const st = p.state;
    p.godrays.render(renderer, p.scenePass.rt, p.ctx.camera, st.sunDir, st.rayStrength, p.gradePass.uniforms.uAspect.value);
    const gu = p.gradePass.uniforms;
    gu.uRayI.value = p.godrays.intensity;
  }
}

// ---------------------------------------------------------------------------------------------
const GRADE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform sampler2D tExposure;
uniform sampler2D tRays;
uniform float uBloomI;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uVignette;
uniform float uAspect;
uniform float uDamage;
uniform float uFlash;
uniform float uUnder;
uniform vec3 uUnderColor;
uniform vec3 uUnderAbsorb;
uniform float uUnderDepth;
uniform float uTime;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uSunDir;
uniform float uSeaLevel;
uniform vec3 uRayColor;
uniform float uRayI;
uniform float uAutoExp;

#include <tonemapping_pars_fragment>

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float causticPattern(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  vec2 uv = vUv;
  // distorsión leve bajo el agua
  if (uUnder > 0.001) {
    vec2 w = vec2(sin(uv.y * 22.0 + uTime * 1.7), cos(uv.x * 18.0 + uTime * 1.3));
    uv += w * 0.0022 * uUnder;
  }
  vec3 col = texture2D(tColor, uv).rgb;
  float depth = texture2D(tDepth, uv).r;

  // ---- bajo el agua: absorción por distancia, color de dispersión y cáusticas ----
  if (uUnder > 0.001) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 vp = uInvProj * clip;
    vp.xyz /= vp.w;
    float dist = depth > 0.99998 ? 400.0 : length(vp.xyz);
    vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
    float below = max(uSeaLevel - wp.y, 0.0);
    // cáusticas proyectadas a lo largo del sol sobre superficies sumergidas
    if (depth < 0.99998) {
      vec2 cp = (wp.xz + uSunDir.xz / max(uSunDir.y, 0.2) * below) * 0.55;
      float ca = causticPattern(cp, uTime * 0.9);
      col *= 1.0 + ca * 1.6 * exp(-below * 0.12) * smoothstep(0.0, 0.5, uSunDir.y);
    }
    vec3 tr = exp(-uUnderAbsorb * dist);
    vec3 scat = uUnderColor * exp(-uUnderDepth * 0.045);
    col = col * tr + scat * (vec3(1.0) - tr);
    col = mix(texture2D(tColor, vUv).rgb, col, uUnder);
  }

  // ---- bloom + rayos de luz ----
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  col += bloom * uBloomI;
  col += texture2D(tRays, vUv).rgb * uRayColor * uRayI;

  // ---- relámpago ----
  col = col * (1.0 + uFlash * 1.2) + uFlash * vec3(0.10, 0.13, 0.2);

  // ---- exposición ----
  float ex = texture2D(tExposure, vec2(0.5)).r;
  float expo = mix(1.0, ex, uAutoExp);
  col *= expo;

  // ---- daño: viñeta roja ----
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uAspect * 0.75;
  float r = length(p);
  if (uDamage > 0.001) {
    float v = smoothstep(0.25, 1.45, r);
    col = mix(col, col * vec3(1.0, 0.35, 0.3), uDamage * v * 0.8);
    col += uDamage * v * vec3(0.55, 0.015, 0.01);
  }

  // ---- tone mapping ----
#if defined(TONEMAP_AGX)
  col = AgXToneMapping(col);
#elif defined(TONEMAP_NEUTRAL)
  col = NeutralToneMapping(col);
#else
  col = ACESFilmicToneMapping(col);
#endif
  col = clamp(col, 0.0, 1.0);

  // ---- gradación (en espacio perceptual) ----
  vec3 s = toSRGB(col);
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s += uLift * (1.0 - s);
  s *= uGain;
  s = mix(s, s * uShadowTint * 1.0, (1.0 - smoothstep(0.0, 0.55, l)) * 0.6);
  s = mix(s, s * uHighlightTint, smoothstep(0.35, 1.0, l) * 0.6);
  s = mix(vec3(dot(s, vec3(0.2126, 0.7152, 0.0722))), s, uSat);
  s = mix(s, s * s * (3.0 - 2.0 * s), uContrast);
  // viñeta suave
  float vig = 1.0 - uVignette * smoothstep(0.45, 1.5, r);
  s *= vig;
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;

class GradePass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.needsSwap = true;
    this.uniforms = {
      tColor: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tExposure: { value: null }, tRays: { value: null },
      toneMappingExposure: { value: 1 },
      uBloomI: { value: 0.06 }, uSat: { value: 1.05 }, uContrast: { value: 0.18 },
      uLift: { value: new THREE.Vector3(0, 0, 0) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Vector3(0.94, 1.0, 1.08) }, uHighlightTint: { value: new THREE.Vector3(1.05, 1.0, 0.95) },
      uVignette: { value: 0.32 }, uAspect: { value: 1.78 },
      uDamage: { value: 0 }, uFlash: { value: 0 },
      uUnder: { value: 0 }, uUnderColor: { value: new THREE.Vector3(0.02, 0.18, 0.2) },
      uUnderAbsorb: { value: new THREE.Vector3(0.35, 0.09, 0.06) }, uUnderDepth: { value: 0 },
      uTime: { value: 0 }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSeaLevel: { value: 0 },
      uRayColor: { value: new THREE.Vector3(1, 1, 1) }, uRayI: { value: 0 }, uAutoExp: { value: 1 },
    };
    this.mat = mkMat(GRADE_FRAG, this.uniforms, { defines: { TONEMAP_ACES: '' } });
    this.quad = new FullScreenQuad(this.mat);
    this.tone = 'aces';
  }
  setTone(name) {
    if (name === this.tone) return;
    this.tone = name;
    this.mat.defines = name === 'agx' ? { TONEMAP_AGX: '' } : name === 'neutral' ? { TONEMAP_NEUTRAL: '' } : { TONEMAP_ACES: '' };
    this.mat.needsUpdate = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const p = this.pipe;
    const u = this.uniforms;
    u.tColor.value = readBuffer.texture;
    u.tBloom.value = p.bloom.texture;
    u.tDepth.value = p.scenePass.rt.depthTexture;
    u.tExposure.value = p.exposure.texture;
    u.tRays.value = p.godrays.texture;
    const cam = p.ctx.camera;
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    renderer.setRenderTarget(writeBuffer);
    this.quad.render(renderer);
  }
}

// ---------------------------------------------------------------------------------------------
const FINAL_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uTexel;
uniform float uGrain;
uniform float uTime;
uniform float uSharpen;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  if (uSharpen > 0.001) {
    // nitidez adaptativa suave (estilo CAS): realza detalle sin halos fuertes
    vec3 n = texture2D(tColor, vUv + vec2(0.0, -uTexel.y)).rgb;
    vec3 s = texture2D(tColor, vUv + vec2(0.0,  uTexel.y)).rgb;
    vec3 w = texture2D(tColor, vUv + vec2(-uTexel.x, 0.0)).rgb;
    vec3 e = texture2D(tColor, vUv + vec2( uTexel.x, 0.0)).rgb;
    vec3 mn = min(min(min(n, s), min(w, e)), c);
    vec3 mx = max(max(max(n, s), max(w, e)), c);
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-3)), 0.0, 1.0));
    vec3 wgt = -amp * mix(0.125, 0.2, uSharpen);
    c = clamp((c + (n + s + w + e) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
  }
  // grano de película muy leve, más visible en sombras
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 311.0) - 0.5;
  c += g * uGrain * (1.0 - 0.6 * l);
  // dither para evitar bandas en degradados suaves del cielo
  c += (hash(gl_FragCoord.xy * 1.37 + 17.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

class FinalPass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.uniforms = { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uGrain: { value: 0.018 }, uTime: { value: 0 }, uSharpen: { value: 0 } };
    this.mat = mkMat(FINAL_FRAG, this.uniforms);
    this.quad = new FullScreenQuad(this.mat);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// ---------------------------------------------------------------------------------------------
export class Pipeline {
  constructor(ctx, renderer, hooks = {}) {
    this.ctx = ctx;
    this.renderer = renderer;
    this.hooks = hooks;
    this.aoStrength = 1;
    this.state = { sunDir: new THREE.Vector3(0, 1, 0), rayStrength: 0 };

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.composer = new EffectComposer(renderer, rt);
    this.bloom = new Bloom(6);
    this.ao = new AOEffect();
    this.exposure = new ExposureEffect();
    this.godrays = new GodRays();

    this.scenePass = new ScenePass(this);
    this.compositePass = new CompositePass(this);
    this.viewmodelPass = new ViewmodelPass(this);
    this.bloomPass = new BloomPass(this);
    this.gradePass = new GradePass(this);
    this.fxaaPass = new FXAAPass();
    this.smaaPass = new SMAAPass();
    this.finalPass = new FinalPass(this);
    const c = this.composer;
    for (const p of [this.scenePass, this.compositePass, this.viewmodelPass, this.bloomPass, this.gradePass, this.fxaaPass, this.smaaPass, this.finalPass]) c.addPass(p);
    this.config = null;
    this.scale = 1;
  }

  /** Aplica una configuración de calidad (ver QUALITY en index.js). */
  configure(cfg) {
    this.config = cfg;
    this.scenePass.samples = cfg.msaa;
    this.scenePass.build(this.scenePass.w, this.scenePass.h, cfg.msaa);
    this.compositePass.setAO(cfg.ao > 0);
    this.ao.configure(cfg.ao);
    this.bloom.setLevels(cfg.bloomLevels);
    this.fxaaPass.enabled = cfg.aa === 'fxaa';
    this.smaaPass.enabled = cfg.aa === 'smaa';
    this.godrays.enabled = !!cfg.godrays;
    this.finalPass.uniforms.uSharpen.value = cfg.sharpen ?? 0;
    this.resize();
  }

  setSizes(w, h, pixelRatio) {
    this.cssW = w; this.cssH = h; this.pr = pixelRatio;
    this.resize();
  }

  resize() {
    if (!this.cssW) return;
    const pr = this.pr * this.scale;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.cssW, this.cssH);
    const iw = Math.max(2, Math.floor(this.cssW * pr)), ih = Math.max(2, Math.floor(this.cssH * pr));
    this.bloom.setSize(iw, ih);
    this.ao.setSize(iw, ih);
    this.godrays.setSize(iw, ih);
    this.gradePass.uniforms.uAspect.value = this.cssW / this.cssH;
  }

  setScale(s) {
    if (Math.abs(s - this.scale) < 1e-3) return;
    this.scale = s;
    this.resize();
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose?.();
    this.bloom.dispose();
    this.ao.dispose();
    this.exposure.dispose();
    this.godrays.dispose();
  }
}
