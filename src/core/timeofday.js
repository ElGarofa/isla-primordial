// Ciclo día/noche base. El módulo render puede refinar colores, pero la posición del sol vive aquí.
import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Actualiza ctx.time.{dayFraction, sunDir, moonDir, nightFactor, isNight} a partir de ctx.time.hour. */
export function updateTimeOfDay(time) {
  const hour = ((time.hour % 24) + 24) % 24;
  time.dayFraction = hour / 24;
  // 6h: sol en el horizonte este (+x). 12h: cenit. 18h: horizonte oeste (-x).
  const ang = ((hour - 6) / 24) * Math.PI * 2;
  time.sunDir.set(Math.cos(ang), Math.sin(ang), 0.28).normalize();
  time.moonDir.set(-Math.cos(ang + 0.35), -Math.sin(ang + 0.35), -0.2).normalize();
  time.nightFactor = smooth(0.06, -0.14, time.sunDir.y); // 0 = día pleno, 1 = noche cerrada
  time.isNight = time.nightFactor > 0.5;
  return time;
}

export function createTimeState(startHour) {
  return {
    dt: 0, // dt de simulación (0 en pausa)
    realDt: 0, // dt real
    elapsed: 0,
    hour: startHour,
    locked: false, // true = la hora no avanza (capturas / depuración)
    dayFraction: 0,
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, -1, 0),
    nightFactor: 0,
    isNight: false,
    weather: {
      rain: 0, // 0..1
      storm: 0, // 0..1 (relámpagos, viento fuerte)
      cloudCover: 0.35, // 0..1
      wind: new THREE.Vector2(1, 0.3).normalize(), // dirección en el plano XZ
      windStrength: 0.35, // 0..1
    },
  };
}
