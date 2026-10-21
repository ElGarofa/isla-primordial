// Constantes globales del juego. Las unidades son METROS y SEGUNDOS.
export const CONFIG = {
  nombre: 'Isla Primordial',
  seed: 1337,
  world: {
    size: 1536, // diámetro de la isla jugable (m); el mar se extiende más allá
    seaLevel: 0,
    maxHeight: 190,
  },
  time: {
    dayLengthSec: 1500, // un día completo dura 25 minutos reales
    startHour: 9.0,
  },
  physics: {
    fixedDt: 1 / 60,
    gravity: 18,
  },
  player: {
    height: 1.8,
    radius: 0.35,
    eyeHeight: 1.65,
    walkSpeed: 4.2,
    sprintSpeed: 7.6,
    crouchSpeed: 2.0,
    swimSpeed: 3.0,
    jumpSpeed: 7.0,
    reach: 3.2, // alcance de interacción (m)
  },
  render: {
    fov: 70,
    near: 0.1,
    far: 3500,
    shadowMapSize: 4096,
    maxPixelRatio: 2,
  },
  quality: 'high', // 'low' | 'medium' | 'high' | 'ultra'
};
