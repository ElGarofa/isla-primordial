// Modelo de iluminación en CPU: a partir de la hora (ctx.time) y el clima calcula, sin tocar la GPU, todo lo que el
// resto del render necesita: color/intensidad de la luz principal (sol o luna), colores de ambiente, niebla,
// parámetros de exposición y gradación. Los colores salen del mismo modelo atmosférico que dibuja el cielo
// (atmosphere.js), así que niebla, ambiente y horizonte coinciden.
import * as THREE from 'three';
import { ATM, skyRadianceJS, sunTransmittanceJS } from './atmosphere.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const OBS = new THREE.Vector3(0, ATM.Rg + ATM.obsAlt, 0);
const _tmpDir = new THREE.Vector3();
const _rad = [0, 0, 0];
const _ts = [0, 0, 0];

export class LightingModel {
  constructor() {
    this.s = {
      // luz principal (sol de día, luna de noche)
      keyDir: new THREE.Vector3(0, 1, 0),
      keyColor: new THREE.Color(1, 1, 1),
      keyIntensity: 3,
      isMoonKey: false,
      sunIntensity: 3,           // intensidad del sol sin ponderar por la selección sol/luna
      sunTrans: new THREE.Color(1, 1, 1), // transmitancia (color) de la luz solar a nivel del suelo
      sunDisc: new THREE.Color(1, 1, 1),  // radiancia del disco solar (HDR)
      moonIntensity: 0,
      moonColor: new THREE.Color(0.6, 0.72, 1.0),
      // ambiente
      skyAmbient: new THREE.Color(0.2, 0.3, 0.5),
      groundColor: new THREE.Color(0.1, 0.1, 0.08),
      hemiIntensity: 1,
      envIntensity: 1,
      // niebla
      fogColor: new THREE.Color(0.6, 0.7, 0.8),
      fogSunColor: new THREE.Color(0.8, 0.8, 0.8),
      fogUniform: 1.6e-5,
      fogHeightDensity: 2.2e-4,
      fogFalloff: 0.005,
      fogBase: 0,
      fogLobe: 0.7,
      // cielo
      mie: 1,
      overcast: 0,
      overcastColor: new THREE.Color(0.5, 0.55, 0.62),
      // exposición y gradación
      expKey: 0.18, expMin: 0.35, expMax: 4,
      sat: 1.08, contrast: 0.16, bloomI: 0.05, vignette: 0.3,
      shadowTint: new THREE.Vector3(0.94, 1.0, 1.07),
      highlightTint: new THREE.Vector3(1.05, 1.0, 0.95),
      lift: new THREE.Vector3(0, 0, 0),
      gain: new THREE.Vector3(1, 1, 1),
      rayStrength: 0,
      sunElev: 0.5,
      moonElev: -0.5,
      night: 0,
      daylight: 1,
    };
    this._cache = { elev: 9, mie: -1 };
    this.moonPhase = 0.5; // 0 nueva, .25 cuarto creciente, .5 llena, .75 cuarto menguante
    this.moonEnabled = true;
  }

  /** Muestrea el cielo despejado en (azimut relativo al sol, elevación). */
  _sample(sunDir, sunH, az, el, mie, steps = 16) {
    const ca = Math.cos(az), sa = Math.sin(az);
    const hx = sunH.x * ca - sunH.y * sa;
    const hz = sunH.x * sa + sunH.y * ca;
    _tmpDir.set(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el));
    skyRadianceJS(_tmpDir, sunDir, mie, _rad, steps);
    return _rad;
  }

  update(time, weather, dt) {
    const s = this.s;
    const sunDir = time.sunDir;
    const elev = Math.asin(clamp(sunDir.y, -1, 1));
    const cover = clamp(weather.cloudCover ?? 0), storm = clamp(weather.storm ?? 0), rain = clamp(weather.rain ?? 0);
    const mie = 1 + 1.3 * cover + 1.4 * storm + 0.8 * rain;
    s.sunElev = elev;
    s.mie = mie;
    const night = time.nightFactor;
    s.night = night;
    s.daylight = 1 - night;

    // ---- transmitancia del sol y luz directa ----
    sunTransmittanceJS(OBS, sunDir, mie, _ts, 14);
    const m = Math.max(_ts[0], _ts[1], _ts[2], 1e-6);
    const sunVis = smooth(-0.035, 0.03, elev);
    const wAtten = (1 - 0.86 * Math.pow(cover, 1.25)) * (1 - 0.55 * storm);
    s.sunTrans.setRGB(_ts[0] / m, _ts[1] / m, _ts[2] / m);
    s.sunIntensity = ATM.sunI * m * sunVis * wAtten;
    // el disco se ve aunque el sol esté oculto tras nubes ligeras; la cúpula lo atenúa con la cobertura real de nubes
    s.sunDisc.setRGB(_ts[0], _ts[1], _ts[2]).multiplyScalar(26 * smooth(-0.04, 0.02, elev));

    // ---- luna ----
    const moonDir = time.moonDir;
    const moonElev = Math.asin(clamp(moonDir.y, -1, 1));
    s.moonElev = moonElev;
    const phaseIllum = 0.5 - 0.5 * Math.cos(this.moonPhase * Math.PI * 2);
    const moonUp = smooth(-0.02, 0.12, moonElev);
    const moonFade = 1 - smooth(-0.16, -0.06, elev); // la luna solo ilumina cuando el sol ya se fue
    s.moonIntensity = this.moonEnabled ? 0.6 * moonUp * moonFade * (0.04 + 0.96 * phaseIllum) * (1 - 0.7 * cover) * (1 - 0.5 * storm) : 0;

    // ---- selección de luz principal (el cambio ocurre cuando ambas valen ~0: sin saltos) ----
    const useMoon = elev < -0.05;
    s.isMoonKey = useMoon;
    if (useMoon) {
      s.keyDir.copy(moonDir);
      s.keyColor.copy(s.moonColor);
      s.keyIntensity = s.moonIntensity;
    } else {
      s.keyDir.copy(sunDir);
      s.keyColor.copy(s.sunTrans);
      s.keyIntensity = s.sunIntensity;
    }

    // ---- ambiente y niebla (se recalculan solo si el sol se movió o cambió la turbidez) ----
    const c = this._cache;
    if (Math.abs(elev - c.elev) > 0.0015 || Math.abs(mie - c.mie) > 0.03) {
      c.elev = elev; c.mie = mie;
      this._computeSky(sunDir, elev, mie);
    }
    const sc = ATM.sunI;
    // ambiente: mezcla de cielo y, de noche, el brillo de la luna
    s.groundColor.setRGB(0, 0, 0);
    const alb = ATM.groundAlbedo;
    const sy = Math.max(sunDir.y, 0) * sunVis;
    s.groundColor.r = alb[0] * (_ts[0] * ATM.sunI * sy / Math.PI * wAtten + this._amb[0]);
    s.groundColor.g = alb[1] * (_ts[1] * ATM.sunI * sy / Math.PI * wAtten + this._amb[1]);
    s.groundColor.b = alb[2] * (_ts[2] * ATM.sunI * sy / Math.PI * wAtten + this._amb[2]);
    const cloudy = cover * 0.65 + storm * 0.25;
    const aL = lum(this._amb[0], this._amb[1], this._amb[2]);
    s.skyAmbient.setRGB(
      lerp(this._amb[0], aL * 0.95, cloudy) * (1 - 0.35 * storm),
      lerp(this._amb[1], aL * 1.0, cloudy) * (1 - 0.35 * storm),
      lerp(this._amb[2], aL * 1.1, cloudy) * (1 - 0.35 * storm),
    );
    // piso nocturno: luz de luna difusa + resplandor del cielo (evita que la sombra sea negra pura)
    const moonFill = s.moonIntensity * 0.055;
    s.skyAmbient.r += moonFill * 0.7 + 0.0016;
    s.skyAmbient.g += moonFill * 0.85 + 0.0026;
    s.skyAmbient.b += moonFill * 1.2 + 0.006;
    s.groundColor.r += moonFill * 0.25; s.groundColor.g += moonFill * 0.3; s.groundColor.b += moonFill * 0.4;

    // ---- niebla ----
    const morning = time.hour < 12 ? 1 : 0.35;
    const mist = smooth(0.45, -0.02, elev) * smooth(-0.3, -0.02, elev) * morning; // bruma al amanecer
    const wet = 1 + 2.4 * rain + 1.8 * storm + 1.0 * cover;
    s.fogColor.setRGB(this._fogAway[0], this._fogAway[1], this._fogAway[2]);
    s.fogSunColor.setRGB(this._fogSun[0], this._fogSun[1], this._fogSun[2]);
    if (cloudy > 0) {
      // bajo nubes la niebla se vuelve gris azulada y pierde el lóbulo solar
      const fl = lum(s.fogColor.r, s.fogColor.g, s.fogColor.b);
      s.fogColor.lerp(_gray.setRGB(fl * 0.92, fl * 0.97, fl * 1.05), cloudy * 0.75);
      s.fogSunColor.lerp(s.fogColor, cloudy * 0.8);
    }
    s.fogUniform = 1.5e-5 * (1 + 3.5 * rain + 2.5 * storm);
    s.fogHeightDensity = 2.0e-4 * wet * (1 + 3.2 * mist);
    s.fogFalloff = 0.0048 / (1 + 0.6 * mist + 0.4 * rain);
    s.fogBase = 0;
    s.fogLobe = 0.85 * (1 - cloudy * 0.8);

    // ---- cielo cubierto ----
    s.overcast = smooth(0.62, 1.0, cover) * 0.5 + storm * 0.42;
    const ol = aL * 1.35 * (1 - 0.5 * storm);
    s.overcastColor.setRGB(ol * 0.93, ol * 0.98, ol * 1.08);

    // ---- exposición y gradación ----
    const golden = smooth(0.35, 0.05, elev) * smooth(-0.1, 0.0, elev);
    s.expKey = lerp(0.19, 0.045, night) * (1 - 0.1 * storm);
    s.expMin = 0.3;
    s.expMax = lerp(3.0, 9.0, night);
    s.sat = lerp(1.1, 0.82, night) * lerp(1, 0.78, storm) + 0.06 * golden;
    s.contrast = 0.15 + 0.06 * golden;
    s.bloomI = lerp(0.045, 0.09, night) + 0.02 * golden;
    s.vignette = 0.28 + 0.1 * night;
    s.shadowTint.set(lerp(0.94, 0.8, night), lerp(1.0, 0.95, night), lerp(1.07, 1.22, night));
    s.highlightTint.set(lerp(1.03, 1.1, golden), 1.0, lerp(0.97, 0.86, golden));
    s.rayStrength = smooth(0.0, 0.25, elev) * (1 - smooth(0.75, 1.1, elev) * 0.5) * (1 - cover * 0.6) * (1 - storm) * 1.0;
    s.hemiIntensity = 1;
    return s;
  }

  _computeSky(sunDir, elev, mie) {
    const sunH = { x: sunDir.x, y: sunDir.z };
    const hl = Math.hypot(sunH.x, sunH.y);
    if (hl > 1e-4) { sunH.x /= hl; sunH.y /= hl; } else { sunH.x = 1; sunH.y = 0; }
    const sc = ATM.sunI;
    const amb = [0, 0, 0];
    const add = (w, r) => { amb[0] += w * r[0]; amb[1] += w * r[1]; amb[2] += w * r[2]; };
    let r = skyRadianceJS(_tmpDir.set(0, 1, 0), sunDir, mie, _rad, 16);
    add(0.28, r);
    for (let i = 0; i < 4; i++) add(0.46 / 4, this._sample(sunDir, sunH, (i * Math.PI) / 2, 0.7, mie));
    for (let i = 0; i < 4; i++) add(0.26 / 4, this._sample(sunDir, sunH, (i * Math.PI) / 2 + 0.4, 0.1, mie));
    this._amb = [amb[0] * sc, amb[1] * sc, amb[2] * sc];
    // niebla: color del cielo en el horizonte (lejos del sol y hacia el sol)
    const away = [0, 0, 0];
    for (const az of [Math.PI, Math.PI * 0.55, -Math.PI * 0.55]) {
      const v = this._sample(sunDir, sunH, az, 0.05, mie, 20);
      away[0] += v[0] / 3; away[1] += v[1] / 3; away[2] += v[2] / 3;
    }
    this._fogAway = [away[0] * sc, away[1] * sc, away[2] * sc];
    const toward = this._sample(sunDir, sunH, 0, 0.05, mie, 20);
    const tl = lum(toward[0], toward[1], toward[2]) * sc;
    const lim = Math.min(1, 5 / Math.max(tl, 1e-4)); // evita HDR desbocado
    this._fogSun = [toward[0] * sc * lim, toward[1] * sc * lim, toward[2] * sc * lim];
  }
}
const _gray = new THREE.Color();
