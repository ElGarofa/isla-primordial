// Dificultad (GDD §6: «opciones de dificultad para evitar tareas repetitivas excesivas»). Se elige al empezar la partida, se puede
// cambiar en Ajustes y se guarda con la partida. Multiplica consumo (hambre, sed y sueño), daño recibido y lo que rinde recolectar,
// y fija la regla de pérdida al morir (ver survival/index.js, bolsa de pertenencias).
export const DIFICULTADES = {
  facil: {
    nombre: 'Fácil', consumo: 0.65, dano: 0.6, recoleccion: 1.5, perdida: 'conserva',
    desc: 'Menos hambre, sed y cansancio; menos daño; recolectar rinde un 50 % más. Al morir conservas la ropa puesta y la barra rápida, y la bolsa anterior no se pierde.',
  },
  normal: {
    nombre: 'Normal', consumo: 1, dano: 1, recoleccion: 1, perdida: 'bolsa',
    desc: 'La experiencia prevista. Al morir, todo lo que llevas queda en una bolsa donde caíste; si vuelves a morir antes de recogerla, se pierde.',
  },
  dificil: {
    nombre: 'Difícil', consumo: 1.3, dano: 1.4, recoleccion: 1, perdida: 'temporal',
    desc: 'Más hambre, sed y cansancio; los golpes duelen más. La bolsa de pertenencias además desaparece al cabo de un día de juego.',
  },
};
export const DIFICULTAD_DEFECTO = 'normal';
