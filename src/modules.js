// Orden de arranque de módulos. Cada carpeta exporta `create(ctx)` desde su index.js.
// El orden importa: un módulo puede usar la API de los anteriores en create().
export const MODULES = [
  { name: 'render', label: 'Preparando el motor gráfico', load: () => import('./render/index.js') },
  { name: 'world', label: 'Esculpiendo la isla', load: () => import('./world/index.js') },
  { name: 'flora', label: 'Plantando la selva', load: () => import('./flora/index.js') },
  { name: 'player', label: 'Despertando al superviviente', load: () => import('./player/index.js') },
  { name: 'fauna', label: 'Despertando a las criaturas', load: () => import('./fauna/index.js') },
  { name: 'survival', label: 'Preparando la supervivencia', load: () => import('./survival/index.js') },
  { name: 'fx', label: 'Encendiendo efectos y clima', load: () => import('./fx/index.js') },
  { name: 'audio', label: 'Afinando los sonidos de la isla', load: () => import('./audio/index.js') },
  { name: 'ui', label: 'Armando la interfaz', load: () => import('./ui/index.js') },
];
