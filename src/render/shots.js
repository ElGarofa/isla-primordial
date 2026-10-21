// Presets de captura del módulo render (prefijo render_). Formato: ver src/debug/index.js.
// Cada preset restablece luna, clima y calidad para no heredar el estado del anterior.
import * as THREE from 'three';

const DEFAULT_WEATHER = { rain: 0, storm: 0, cloudCover: 0.35, windStrength: 0.35, wetness: 0 };

const sunDirAt = (hour) => {
  const ang = ((hour - 6) / 24) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.28).normalize();
};
const moonDirAt = (hour) => {
  const ang = ((hour - 6) / 24) * Math.PI * 2;
  return new THREE.Vector3(-Math.cos(ang + 0.35), -Math.sin(ang + 0.35), -0.2).normalize();
};

/** Cámara en la playa del spawn mirando hacia un azimut (rad, 0 = +x) con cierto cabeceo (grados). */
function beachCam(ctx, azimuth, pitchDeg, { eye = 2.0, back = 0, side = 0 } = {}) {
  const s = ctx.world.spawn;
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const x = s.x - ca * back - sa * side, z = s.z - sa * back + ca * side;
  const y = Math.max(ctx.world.getHeight(x, z), 0) + eye;
  const p = (pitchDeg * Math.PI) / 180;
  const d = 600;
  return { pos: [x, y, z], look: [x + ca * Math.cos(p) * d, y + Math.sin(p) * d, z + sa * Math.cos(p) * d] };
}

const azOf = (v) => Math.atan2(v.z, v.x);

/** Crea un preset que parte de un estado limpio. opts: hour, weather, quality, setup, camera(ctx). */
function P(opts) {
  return (ctx) => {
    ctx.__q0 = ctx.__q0 ?? ctx.settings.quality;
    return {
      hour: opts.hour,
      camera: opts.camera(ctx),
      setup(c) {
        c.lighting?.setMoonEnabled?.(true);
        c.lighting?.setMoonPhase?.(opts.phase ?? 0.5);
        Object.assign(c.time.weather, DEFAULT_WEATHER, opts.weather ?? {});
        c.settings.quality = opts.quality ?? c.__q0;
        opts.setup?.(c);
      },
    };
  };
}

/** Busca el pico más alto de la isla (para el plano de sombras largas). */
function findPeak(ctx) {
  let best = { h: -1e9, x: 0, z: 0 };
  for (let x = -700; x <= 700; x += 20) for (let z = -700; z <= 700; z += 20) {
    const h = ctx.world.getHeight(x, z);
    if (h > best.h) best = { h, x, z };
  }
  return best;
}

export const shots = {
  render_cielo_mediodia: P({
    hour: 12.0, weather: { cloudCover: 0.5 },
    camera: (ctx) => beachCam(ctx, Math.PI / 2 + 0.5, 13),
  }),
  render_cielo_cenit: P({
    hour: 11.0, weather: { cloudCover: 0.55 },
    camera: (ctx) => beachCam(ctx, Math.PI / 2, 52),
  }),
  render_cielo_despejado: P({
    hour: 10.0, weather: { cloudCover: 0.08 },
    camera: (ctx) => beachCam(ctx, Math.PI / 2 - 0.4, 10),
  }),
  render_dia_nublado: P({
    hour: 13.0, weather: { cloudCover: 0.88, windStrength: 0.5 },
    camera: (ctx) => beachCam(ctx, Math.PI / 2 + 0.2, 12),
  }),
  render_amanecer: P({
    hour: 6.2, weather: { cloudCover: 0.5 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(6.2)) + 0.25, 6),
  }),
  render_atardecer: P({
    hour: 17.85, weather: { cloudCover: 0.55 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(17.85)) - 0.2, 6),
  }),
  render_hora_dorada: P({
    hour: 17.0, weather: { cloudCover: 0.4 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(17.0)) + 1.0, 8),
  }),
  render_hora_azul: P({
    hour: 18.6, weather: { cloudCover: 0.45 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(18.6)) + 0.4, 12),
  }),
  render_noche_luna: P({
    hour: 19.8, weather: { cloudCover: 0.3 },
    camera: (ctx) => {
      const m = moonDirAt(19.8);
      return beachCam(ctx, azOf(m) + 0.15, Math.asin(m.y) * 57.3 - 16);
    },
  }),
  render_noche_sin_luna: P({
    hour: 2.0, phase: 0, weather: { cloudCover: 0.1 },
    setup: (c) => c.lighting.setMoonEnabled(false),
    camera: (ctx) => beachCam(ctx, Math.PI / 2 - 0.9, 38),
  }),
  render_tormenta: P({
    hour: 15.0, weather: { storm: 1, rain: 1, cloudCover: 1, windStrength: 0.9, wetness: 1 },
    camera: (ctx) => beachCam(ctx, Math.PI / 2 + 0.3, 9),
  }),
  render_bajo_agua: P({
    hour: 11.0, weather: { cloudCover: 0.3 },
    camera: (ctx) => {
      const s = ctx.world.spawn;
      const len = Math.hypot(s.x, s.z) || 1;
      const ox = s.x / len, oz = s.z / len;
      let d = 30;
      while (d < 400 && ctx.world.getHeight(s.x + ox * d, s.z + oz * d) > -7) d += 5;
      const x = s.x + ox * d, z = s.z + oz * d;
      const sd = sunDirAt(11.0);
      const az = azOf(sd);
      return { pos: [x, -2.4, z], look: [x + Math.cos(az) * 40, 4, z + Math.sin(az) * 40] };
    },
  }),
  render_contraluz: P({
    hour: 17.35, weather: { cloudCover: 0.35 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(17.35)) + 0.05, 7, { eye: 2.2 }),
  }),
  render_sombras_largas: P({
    hour: 16.9, weather: { cloudCover: 0.25 },
    camera: (ctx) => {
      const pk = findPeak(ctx);
      const sd = sunDirAt(16.9);
      const az = azOf(sd) + Math.PI / 2; // perpendicular al sol
      const x = pk.x + Math.cos(az) * 360, z = pk.z + Math.sin(az) * 360;
      const y = Math.max(ctx.world.getHeight(x, z), 0) + 70;
      return { pos: [x, y, z], look: [pk.x - Math.cos(azOf(sd)) * 160, pk.h * 0.35, pk.z - Math.sin(azOf(sd)) * 160] };
    },
  }),
  render_vista_aerea: P({
    hour: 15.0, weather: { cloudCover: 0.45 },
    camera: (ctx) => {
      const s = ctx.world.spawn;
      return { pos: [s.x * 0.4, 380, s.z * 1.5 + 360], look: [0, 10, 0] };
    },
  }),
  render_calidad_low: P({
    hour: 16.5, quality: 'low', weather: { cloudCover: 0.4 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(16.5)) + 0.9, 8),
  }),
  render_calidad_ultra: P({
    hour: 16.5, quality: 'ultra', weather: { cloudCover: 0.4 },
    camera: (ctx) => beachCam(ctx, azOf(sunDirAt(16.5)) + 0.9, 8),
  }),
};
