// Constantes globales del juego. Las unidades son METROS y SEGUNDOS.
export const CONFIG = {
  nombre: 'Isla Primordial',
  seed: 1337,
  world: {
    size: 12288, // lado del cuadrado de mundo (m): 151 km², de los que ≈ 80 km² son tierra; el mar abierto se extiende más allá
    macro: 768, // celdas por lado de la rejilla macro (16 m)
    seaLevel: 0,
    maxHeight: 460,
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
    near: 0.15,
    far: 9000, // alcance de dibujo en el suelo; la niebla del horizonte funde todo entre el 72 % y el 96 % de este valor
    shadowMapSize: 4096,
    maxPixelRatio: 2,
  },
  quality: 'high', // 'low' | 'medium' | 'high' | 'ultra'
};
