// Catálogo de objetos y recetas. Fuente única de verdad para flora, fauna, supervivencia y UI.
// Todo el texto es visible para el jugador: va en español.

export const ITEMS = {
  madera: { nombre: 'Madera', tipo: 'recurso', apilable: 100, descripcion: 'Troncos y ramas resistentes.' },
  piedra: { nombre: 'Piedra', tipo: 'recurso', apilable: 100, descripcion: 'Roca pesada, útil para herramientas.' },
  fibra: { nombre: 'Fibra', tipo: 'recurso', apilable: 200, descripcion: 'Fibras vegetales trenzables.' },
  pedernal: { nombre: 'Pedernal', tipo: 'recurso', apilable: 50, descripcion: 'Produce chispas al golpearlo.' },
  baya: { nombre: 'Baya', tipo: 'comida', apilable: 50, comida: 8, sed: 3, descripcion: 'Fruto silvestre comestible.' },
  carne_cruda: { nombre: 'Carne cruda', tipo: 'comida', apilable: 20, comida: 12, vida: -4, descripcion: 'Mejor cocinarla antes de comer.' },
  carne_cocida: { nombre: 'Carne cocida', tipo: 'comida', apilable: 20, comida: 38, vida: 6, descripcion: 'Nutritiva y segura.' },
  cuero: { nombre: 'Cuero', tipo: 'recurso', apilable: 50, descripcion: 'Piel curtida de criaturas.' },
  hueso: { nombre: 'Hueso', tipo: 'recurso', apilable: 50, descripcion: 'Hueso duro, ideal para armas.' },
  agua: { nombre: 'Agua fresca', tipo: 'bebida', apilable: 10, sed: 45, descripcion: 'Agua potable.' },

  hacha_piedra: { nombre: 'Hacha de piedra', tipo: 'herramienta', apilable: 1, dano: 14, talar: 3, descripcion: 'Tala árboles con eficacia.' },
  pico_piedra: { nombre: 'Pico de piedra', tipo: 'herramienta', apilable: 1, dano: 10, picar: 3, descripcion: 'Rompe rocas y mena.' },
  lanza: { nombre: 'Lanza', tipo: 'arma', apilable: 1, dano: 28, alcance: 2.6, descripcion: 'Alcance largo y buen daño.' },
  antorcha: { nombre: 'Antorcha', tipo: 'herramienta', apilable: 1, dano: 6, luz: true, descripcion: 'Ilumina la noche.' },
  cantimplora: { nombre: 'Cantimplora', tipo: 'herramienta', apilable: 1, descripcion: 'Se llena en ríos y lagos.' },

  fogata: { nombre: 'Fogata', tipo: 'colocable', apilable: 5, descripcion: 'Cocina, da calor y luz.' },
};

// Cada receta: producto, cantidad producida y costo. `estacion`: null = a mano, 'fogata' = junto al fuego.
export const RECIPES = [
  { id: 'hacha_piedra', cantidad: 1, costo: { madera: 3, piedra: 2, fibra: 4 }, estacion: null },
  { id: 'pico_piedra', cantidad: 1, costo: { madera: 3, piedra: 3, fibra: 4 }, estacion: null },
  { id: 'lanza', cantidad: 1, costo: { madera: 4, piedra: 1, fibra: 3 }, estacion: null },
  { id: 'antorcha', cantidad: 1, costo: { madera: 2, fibra: 2 }, estacion: null },
  { id: 'cantimplora', cantidad: 1, costo: { cuero: 2, fibra: 3 }, estacion: null },
  { id: 'fogata', cantidad: 1, costo: { madera: 6, piedra: 4, pedernal: 1 }, estacion: null },
  { id: 'carne_cocida', cantidad: 1, costo: { carne_cruda: 1 }, estacion: 'fogata' },
];
