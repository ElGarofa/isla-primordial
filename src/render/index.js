// MÓDULO RENDER — la imagen final de Isla Primordial.
//
// Qué hace:
//  - Renderer + cadena de postproceso HDR (post.js): AO tipo GTAO, bloom físico, auto-exposición, tone mapping ACES/AgX,
//    gradación por hora/clima, FXAA/SMAA, viñeta, grano, efectos de cámara (bajo el agua, relámpago, daño).
//  - Cielo atmosférico (sky.js): dispersión Rayleigh/Mie, sol, luna, estrellas, nubes volumétricas.
//  - Iluminación (lighting.js): luz principal con sombras en cascada (cascades.js), ambiente IBL desde el cielo (PMREM),
//    niebla atmosférica con perspectiva aérea (parche global de ShaderChunk en chunks.js).
//
// API para los demás módulos (contrato; no cambiar las firmas):
//   ctx.renderer, ctx.composer, ctx.render(dt), ctx.render.setQuality(q)
//   ctx.lighting.sun              SunLight (luz principal: sol de día, luna de noche). position = dirección hacia la luz (×500),
//                                 .color y .intensity al día. NO tiene .target útil: la dirección es solo la posición.
//   ctx.lighting.hemi             HemisphereLight con el ambiente del cielo (colores e intensidad al día).
//   ctx.lighting.ambient          { sky: Color, ground: Color } ambiente actual en unidades de three (para luces propias).
//   ctx.lighting.uniforms         uniforms THREE compartidos: uTime, uSunDir, uSunColor, uAmbientSky, uAmbientGround,
//                                 uWind (x,z = dirección, y = intensidad), uNight, uWetness.
//   ctx.lighting.setupMaterial(m) integra un material (ver comentario en la función). Es OPCIONAL para materiales de
//                                 three estándar (los parches de shader son globales), pero hay que llamarla igual.
//   ctx.lighting.setMoonPhase(p)  0 nueva .. 0.5 llena. ctx.lighting.flash(intensidad) fuerza un destello.
//   ctx.lighting.state            lectura del estado calculado (fog, key light, exposición...).
import * as THREE from 'three';
import { installShaderPatches, shared, sharedUniforms } from './chunks.js';
import { CascadedSunLight } from './cascades.js';
import { createSky } from './sky.js';
import { Pipeline } from './post.js';
import { LightingModel } from './lighting.js';
import { ATM } from './atmosphere.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Presets de calidad.
 *  DEFECTO CONOCIDO: el AO (ao.js) está desactivado (ao: 0) en todos los niveles porque en las pruebas con SwiftShader
 *  producía un cuadrado negro y escalones en pendientes; no se pudo verificar en GPU real. Reactivar con ao: 1..3 tras depurar. */
export const QUALITY = {
  low:    { pr: 1,   scale: 0.8, msaa: 0, shadowSize: 1024, shadowDist: 110, shadowRadius: 1.4, ao: 0, bloomLevels: 4, godrays: false, aa: 'fxaa', sharpen: 0.55, envSize: 64,  cloudSteps: 10, cloudScale: 0.3,  motionBlur: false },
  medium: { pr: 1.25, scale: 1, msaa: 0, shadowSize: 1536, shadowDist: 170, shadowRadius: 1.7, ao: 0, bloomLevels: 5, godrays: false, aa: 'smaa', sharpen: 0.2,  envSize: 96,  cloudSteps: 16, cloudScale: 0.4,  motionBlur: false },
  high:   { pr: 1.5, scale: 1, msaa: 2, shadowSize: 2048, shadowDist: 230, shadowRadius: 2.0, ao: 0, bloomLevels: 6, godrays: true,  aa: 'smaa', sharpen: 0.1,  envSize: 128, cloudSteps: 24, cloudScale: 0.5,  motionBlur: false },
  ultra:  { pr: 2,   scale: 1, msaa: 4, shadowSize: 3072, shadowDist: 300, shadowRadius: 2.4, ao: 0, bloomLevels: 7, godrays: true,  aa: 'smaa', sharpen: 0.1,  envSize: 192, cloudSteps: 36, cloudScale: 0.6,  motionBlur: true },
};

export async function create(ctx) {
  installShaderPatches();

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
  renderer.info.autoReset = false; // contamos draw calls de TODO el frame (sombras + escena + postproceso)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // el tone mapping lo hace el pase de gradación
  renderer.setClearColor(0x000000, 1);
  ctx.container.appendChild(renderer.domElement);

  // ------------------------------------------------------------------ luces
  const sun = new CascadedSunLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 1.6;
  sun.name = 'luz_principal';
  sun.target = new THREE.Object3D(); // compatibilidad: no se usa (la dirección es la posición)
  ctx.scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x445533, 0.6);
  hemi.name = 'ambiente';
  ctx.scene.add(hemi);

  const fog = new THREE.Fog(0xaec8e0, 1, 100000); // near/far no se usan: el parche de niebla usa uFogA/B/C
  ctx.scene.fog = fog;
  ctx.scene.background = new THREE.Color(0x87b4d8);
  ctx.scene.environmentIntensity = 1;

  // uniforms compartidos (para shaders propios de otros módulos)
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbientSky: { value: new THREE.Color(0.2, 0.3, 0.5) },
    uAmbientGround: { value: new THREE.Color(0.1, 0.1, 0.1) },
    uWind: { value: new THREE.Vector3(1, 0.35, 0) },
    uNight: { value: 0 },
    uWetness: { value: 0 },
  };

  // ------------------------------------------------------------------ cielo y modelo de luz
  const model = new LightingModel();
  const sky = createSky(ctx, renderer);

  // ------------------------------------------------------------------ postproceso
  const pipe = new Pipeline(ctx, renderer, {});

  // ------------------------------------------------------------------ estado de efectos
  const fx = { flash: 0, flash2: 0, flash2T: 0, damage: 0, under: 0, underDepth: 0, camSurfaceY: 0 };
  let appliedQuality = null;
  let cfg = QUALITY.high;
  let basePR = 1;
  let adaptScale = 1;
  let slowFrames = 0, fastFrames = 0, emaDt = 1 / 60;
  let lastEnv = { elev: 9, cover: -1, storm: -1, t: -1e9 };
  let firstFrame = true;
  let prevHour = ctx.time.hour;

  const sizeNow = () => ({ w: ctx.container.clientWidth || window.innerWidth, h: ctx.container.clientHeight || window.innerHeight });

  function applyQuality(q) {
    const name = QUALITY[q] ? q : 'high';
    appliedQuality = q;
    cfg = QUALITY[name];
    ctx.settings.quality = q;
    const dpr = window.devicePixelRatio || 1;
    basePR = Math.min(dpr, cfg.pr, ctx.config.render.maxPixelRatio);
    const { w, h } = sizeNow();
    renderer.setPixelRatio(basePR);
    renderer.setSize(w, h);
    adaptScale = cfg.scale;
    pipe.scale = adaptScale;
    pipe.setSizes(w, h, basePR);
    pipe.configure(cfg);
    // sombras
    const sh = sun.shadow;
    const maxTex = renderer.capabilities.maxTextureSize || 4096;
    const size = Math.min(cfg.shadowSize, Math.floor(maxTex / 4));
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      if (sh.map) { sh.map.dispose(); sh.map = null; }
    }
    sh.radius = cfg.shadowRadius;
    sh.shadowDistance = cfg.shadowDist;
    sh.splitDistances = [0.05, 0.15, 0.4].map((f) => f * cfg.shadowDist);
    lastEnv.t = -1e9; // fuerza regenerar el entorno
    firstFrame = true;
  }

  // ------------------------------------------------------------------ eventos
  const offs = [];
  offs.push(ctx.events.on('resize', ({ width, height }) => {
    renderer.setPixelRatio(basePR);
    renderer.setSize(width, height);
    pipe.setSizes(width, height, basePR);
    ctx.camera.aspect = width / height;
    ctx.camera.updateProjectionMatrix();
  }));
  const flash = (intensity = 1) => {
    fx.flash = Math.max(fx.flash, clamp(intensity, 0, 1.5));
    fx.flash2 = clamp(intensity, 0, 1.5) * 0.7; // segundo destello (parpadeo del relámpago)
    fx.flash2T = 0.11 + Math.random() * 0.08;
  };
  offs.push(ctx.events.on('weather:lightning', (e) => flash(e?.intensity ?? 1)));
  offs.push(ctx.events.on('player:damage', (e) => { fx.damage = clamp(Math.max(fx.damage, 0.45 + (e?.cantidad ?? 10) * 0.012), 0, 1); }));

  // ------------------------------------------------------------------ API de iluminación
  const lighting = {
    sun, hemi, uniforms, fog,
    ambient: { sky: model.s.skyAmbient, ground: model.s.groundColor },
    state: model.s,
    /**
     * Integra un material con el render. IMPORTANTE para los demás módulos: llamar SIEMPRE tras crear el material.
     *  - Materiales estándar de three (MeshStandard/Physical/Lambert/Phong/Basic/Points/Sprite...): ya reciben sombras en
     *    cascada, niebla atmosférica (con altura y color del cielo) e IBL por parches globales de shader; aquí solo se
     *    marca el material (userData.renderSetup) y se asegura `fog = true` si no se indicó lo contrario.
     *  - ShaderMaterial propios: se añaden los uniforms compartidos de niebla (uFogA/B/C, uFogSun) y, si usa fog, los
     *    uniforms base de three (fogColor...). Deben incluir los chunks <fog_pars_vertex>, <fog_vertex>,
     *    <fog_pars_fragment> y <fog_fragment> (en ese orden habitual) y declarar fog: true.
     *  - Para recibir sombras el mesh debe tener receiveShadow = true; para proyectarlas, castShadow = true.
     * Devuelve el mismo material (se puede encadenar: mesh.material = ctx.lighting.setupMaterial(new ...)).
     * opts: { fog?: boolean, envIntensity?: number }.
     */
    setupMaterial(material, opts = {}) {
      if (!material) return material;
      const mats = Array.isArray(material) ? material : [material];
      for (const m of mats) {
        if (opts.fog !== undefined) m.fog = opts.fog;
        if (m.isShaderMaterial && m.fog) {
          m.uniforms = m.uniforms || {};
          const base = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
          for (const k of Object.keys(base)) if (!(k in m.uniforms)) m.uniforms[k] = base[k];
          for (const k of Object.keys(sharedUniforms)) m.uniforms[k] = sharedUniforms[k];
        }
        if (opts.envIntensity !== undefined && 'envMapIntensity' in m) m.envMapIntensity = opts.envIntensity;
        m.userData.renderSetup = true;
      }
      return material;
    },
    setMoonPhase(p) { model.moonPhase = ((p % 1) + 1) % 1; },
    setMoonEnabled(on) { model.moonEnabled = !!on; },
    flash,
    /** Fuerza regenerar entorno y exposición (cambios bruscos de hora/clima). */
    refresh() { lastEnv.t = -1e9; pipe.exposure.forceSnap(); },
    get quality() { return appliedQuality; },
  };

  ctx.renderer = renderer;
  ctx.composer = pipe.composer;
  ctx.lighting = lighting;

  // ------------------------------------------------------------------ aplicar estado al motor
  /** Decaimiento de los efectos transitorios (relámpago, daño). Una vez por paso de simulación. */
  function updateFx(dt) {
    if (fx.flash2T > 0) { fx.flash2T -= dt; if (fx.flash2T <= 0) fx.flash = Math.max(fx.flash, fx.flash2); }
    fx.flash *= Math.exp(-dt * 9);
    if (fx.flash < 0.002) fx.flash = 0;
    fx.damage *= Math.exp(-dt * 2.4);
    if (fx.damage < 0.002) fx.damage = 0;
  }

  function applyLighting() {
    const s = model.s;
    const t = ctx.time;
    uniforms.uTime.value = t.elapsed;
    uniforms.uSunDir.value.copy(t.sunDir);
    uniforms.uSunColor.value.copy(s.sunTrans).multiplyScalar(s.sunIntensity);
    uniforms.uAmbientSky.value.copy(s.skyAmbient);
    uniforms.uAmbientGround.value.copy(s.groundColor);
    uniforms.uWind.value.set(t.weather.wind?.x ?? 1, t.weather.windStrength ?? 0.3, t.weather.wind?.y ?? 0);
    uniforms.uNight.value = s.night;
    uniforms.uWetness.value = t.weather.wetness ?? 0;

    const fl = fx.flash;

    // luz principal
    sun.position.copy(s.keyDir).multiplyScalar(500);
    sun.color.copy(s.keyColor);
    sun.intensity = s.keyIntensity * (1 - fx.under * 0.55);
    sun.shadow.autoUpdate = s.keyIntensity > 0.003;
    // ambiente
    hemi.color.copy(s.skyAmbient);
    hemi.groundColor.copy(s.groundColor);
    hemi.intensity = s.hemiIntensity * (1 + fl * 3);
    ctx.scene.environmentIntensity = 1 + fl * 2.5;
  }

  function applyFog() {
    const s = model.s;
    const u = fx.under;
    const wc = underwaterColor();
    fog.color.copy(s.fogColor).lerp(wc, u);
    shared.fogA[0] = lerp(s.fogUniform, 0.006, u);
    shared.fogA[1] = s.fogHeightDensity * (1 - u);
    shared.fogA[2] = s.fogFalloff;
    shared.fogA[3] = s.fogBase;
    shared.fogB[0] = ctx.time.sunDir.x; shared.fogB[1] = ctx.time.sunDir.y; shared.fogB[2] = ctx.time.sunDir.z;
    shared.fogB[3] = s.fogLobe * (1 - u);
    shared.fogC[0] = 2300; shared.fogC[1] = u > 0.5 ? 0 : 3300;
    shared.fogSun[0] = lerp(s.fogSunColor.r, wc.r, u);
    shared.fogSun[1] = lerp(s.fogSunColor.g, wc.g, u);
    shared.fogSun[2] = lerp(s.fogSunColor.b, wc.b, u);
    ctx.scene.background.copy(fog.color);
  }

  const _wc = new THREE.Color();
  function underwaterColor() {
    const s = model.s;
    const level = clamp(lum(s.skyAmbient.r, s.skyAmbient.g, s.skyAmbient.b) * 2.4 + s.sunIntensity * 0.16, 0.02, 1.3);
    return _wc.setRGB(0.02 * level, 0.2 * level, 0.22 * level);
  }

  function updateUnderwater(dt) {
    const cam = ctx.camera;
    const sea = ctx.world?.seaLevel ?? 0;
    let surf = sea;
    const w = ctx.world?.water;
    if (w?.getWaveHeight) {
      const h = w.getWaveHeight(cam.position.x, cam.position.z, ctx.time.elapsed);
      if (Number.isFinite(h)) surf = sea + (Math.abs(h) < 50 ? h : 0);
    }
    fx.camSurfaceY = surf;
    const depth = surf - cam.position.y;
    const target = clamp((depth + 0.04) / 0.14);
    fx.under = ctx.debug?.enabled ? target : lerp(fx.under, target, 1 - Math.exp(-dt * 24));
    fx.underDepth = Math.max(0, depth);
  }

  function applyPost() {
    const s = model.s;
    const g = pipe.gradePass.uniforms;
    const t = ctx.time;
    const u = fx.under;
    g.toneMappingExposure.value = 1;
    g.uBloomI.value = s.bloomI * (1 + 0.5 * u);
    g.uSat.value = s.sat * (1 - 0.12 * u);
    g.uContrast.value = s.contrast;
    g.uVignette.value = s.vignette;
    g.uShadowTint.value.copy(s.shadowTint);
    g.uHighlightTint.value.copy(s.highlightTint);
    g.uLift.value.copy(s.lift);
    g.uGain.value.copy(s.gain);
    g.uDamage.value = fx.damage;
    g.uFlash.value = fx.flash;
    g.uUnder.value = u;
    const wc = underwaterColor();
    g.uUnderColor.value.set(wc.r, wc.g, wc.b);
    g.uUnderDepth.value = fx.underDepth;
    g.uTime.value = t.elapsed;
    g.uSunDir.value.copy(t.sunDir);
    g.uSeaLevel.value = fx.camSurfaceY;
    const rayCol = s.sunTrans;
    g.uRayColor.value.set(rayCol.r, rayCol.g, rayCol.b);
    g.uAutoExp.value = 1;
    pipe.state.sunDir.copy(t.sunDir);
    pipe.state.rayStrength = s.rayStrength * (1 - u) * 0.9;
    pipe.exposure.params.key = s.expKey * (1 + 0.0 * u);
    pipe.exposure.params.min = s.expMin;
    pipe.exposure.params.max = s.expMax;
    pipe.finalPass.uniforms.uTime.value = t.elapsed;
    pipe.finalPass.uniforms.uGrain.value = 0.016 + 0.01 * s.night;
    pipe.aoStrength = 1;
  }

  function updateShadowParams() {
    const sh = sun.shadow;
    const s = model.s;
    const sinE = Math.max(s.keyDir.y, 0.1);
    const casterH = (ctx.config.world?.maxHeight ?? 190) + 70;
    sh.casterExtent = clamp(casterH / sinE, 150, 2600);
    sh.bias = -1.0 / Math.max(sh.depthRange || 1000, 100);
  }

  function updateEnvironment(force) {
    const s = model.s;
    const w = ctx.time.weather;
    const now = performance.now();
    const dE = Math.abs(s.sunElev - lastEnv.elev);
    const changed = dE > 0.012 || Math.abs((w.cloudCover ?? 0) - lastEnv.cover) > 0.1 || Math.abs((w.storm ?? 0) - lastEnv.storm) > 0.1;
    if (!force && !(changed && now - lastEnv.t > 800)) return false;
    lastEnv = { elev: s.sunElev, cover: w.cloudCover ?? 0, storm: w.storm ?? 0, t: now };
    sky.envMat.uniforms.uSkyScale.value = ATM.sunI;
    sky.updateEnvironment(cfg.envSize);
    return true;
  }

  // ------------------------------------------------------------------ render por frame
  ctx.render = (dt) => {
    if (ctx.settings.quality !== appliedQuality) applyQuality(ctx.settings.quality);
    const s = model.s;
    renderer.info.reset();

    updateUnderwater(ctx.time.realDt ?? dt);
    applyLighting();
    updateShadowParams();
    applyFog();
    applyPost();

    // cielo: LUT (solo si el sol se movió) y entorno IBL (con límite de frecuencia)
    sky.setState({
      sunDir: ctx.time.sunDir, sunDisc: s.sunDisc, ground: s.groundColor, overcast: s.overcast,
      overcastColor: s.overcastColor, flash: fx.flash * 0.6,
    });
    const hDelta = Math.abs(ctx.time.hour - prevHour);
    prevHour = ctx.time.hour;
    const jumped = hDelta > 0.2 && hDelta < 23.8;
    const lutChanged = sky.updateLUT(s.sunElev, s.mie, firstFrame);
    updateEnvironment(firstFrame || jumped || ctx.debug?.enabled);
    if (firstFrame || jumped || ctx.debug?.enabled) pipe.exposure.forceSnap();
    firstFrame = false;

    renderer.info.reset(); // desde aquí: lo que cuesta el frame real
    pipe.render(dt);

    // resolución dinámica (solo en juego real, no en capturas)
    if (!ctx.debug?.enabled && ctx.state === 'playing') {
      const rd = ctx.time.realDt || dt;
      emaDt = lerp(emaDt, Math.min(rd, 0.1), 0.05);
      if (emaDt > 0.0215) { slowFrames++; fastFrames = 0; } else if (emaDt < 0.0155) { fastFrames++; slowFrames = 0; } else { slowFrames = fastFrames = 0; }
      if (slowFrames > 45 && adaptScale > 0.62) { adaptScale = Math.max(0.62, adaptScale - 0.06); pipe.setScale(adaptScale); slowFrames = 0; }
      if (fastFrames > 240 && adaptScale < cfg.scale) { adaptScale = Math.min(cfg.scale, adaptScale + 0.04); pipe.setScale(adaptScale); fastFrames = 0; }
    }
  };
  ctx.render.setQuality = (q) => { ctx.settings.quality = q; if (q !== appliedQuality) applyQuality(q); };

  // estado inicial coherente antes del primer frame
  applyQuality(ctx.settings.quality);
  model.update(ctx.time, ctx.time.weather, 0);

  return {
    name: 'render',
    update(dt) {
      model.update(ctx.time, ctx.time.weather, dt);
      updateFx(dt);
      applyLighting();
    },
    dispose() {
      for (const off of offs) off?.();
      sky.dispose();
      pipe.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
