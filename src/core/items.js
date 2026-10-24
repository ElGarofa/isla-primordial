// Catálogo de objetos, recetas, recolección y aprovechamiento de cadáveres. Fuente única de verdad para flora, fauna, supervivencia y UI.
// Módulo de DATOS puro (sin dependencias): lo importan también los scripts de prueba en Node. Todo el texto visible va en español.
//
// Campos de un objeto:
//   nombre, tipo ('recurso'|'comida'|'bebida'|'herramienta'|'arma'|'municion'|'ropa'|'colocable'), apilable, descripcion
//   peso (kg por unidad), vol (litros por unidad)
//   dur: usos máximos (solo objetos con desgaste; los apilables no tienen)   reparar: { material: n } para repararlo
//   etiquetas: capacidades ('corta', 'perfora', 'talar', 'picar', 'martillar', 'contundente', 'perforante')
//   armas: dano, alcance, cd (s entre golpes), penetra (0..1 ignora armadura), aturde (prob. 0..1)
//   distancia (arco, honda, jabalina): municion (id del tipo), vel (m/s), carga (s)
//   munición: dano, rotura (prob. de romperse al impactar), penetra, clase ('flecha'|'guijarro')
//   ropa: ranura ('cabeza'|'torso'|'piernas'|'pies'|'espalda'), armadura (puntos), abrigo (°C sentidos), ruido (multiplicador de ruido al moverse), capacidad (kg extra), volumen (L extra)
//   aparejos (equipo de criaturas, tipo 'aparejo'): aparejo { ranura:'cabeza'|'lomo'|'carga'|'proteccion', manejo?, collar?, monta?:'ligera'|'transporte'|'reforzada', carga?:{peso,vol}, armadura? }
//   color: tinte del icono por defecto (si no hay dibujo propio)

const I = (nombre, tipo, apilable, peso, vol, descripcion, extra = {}) => ({ nombre, tipo, apilable, peso, vol, descripcion, ...extra });

export const ITEMS = {
  // ------------------------------------------------------------------------------------------------ A. recursos naturales
  madera: I('Madera', 'recurso', 100, 0.6, 0.5, 'Troncos y ramas resistentes.', { color: '#9a6b3a' }),
  rama: I('Rama', 'recurso', 60, 0.15, 0.25, 'Vara recta y flexible: flechas, arcos y mangos.', { color: '#a98456' }),
  corteza: I('Corteza', 'recurso', 60, 0.08, 0.12, 'Tiras de corteza; se deshilachan en fibra.', { color: '#6e4a2a' }),
  resina: I('Resina', 'recurso', 30, 0.05, 0.03, 'Savia pegajosa que endurece: sirve de pegamento.', { color: '#d9a441' }),
  liana: I('Liana', 'recurso', 60, 0.06, 0.08, 'Enredadera larga y fuerte de la selva.', { color: '#4f7a3a' }),
  hoja_grande: I('Hoja grande', 'recurso', 40, 0.03, 0.1, 'Hoja ancha y resistente.', { color: '#3f8a3a' }),
  fibra: I('Fibra', 'recurso', 200, 0.03, 0.04, 'Fibras vegetales trenzables.', { color: '#c9b36a' }),
  piedra: I('Piedra', 'recurso', 100, 1.2, 0.5, 'Roca pesada, útil para herramientas.', { color: '#8f8c85' }),
  pedernal: I('Pedernal', 'recurso', 50, 0.3, 0.15, 'Produce chispas al golpearlo.', { color: '#5d6068' }),
  baya: I('Baya', 'comida', 50, 0.03, 0.04, 'Fruto silvestre comestible.', { comida: 8, sed: 3, color: '#c0305a' }),
  agua: I('Agua fresca', 'bebida', 10, 0.5, 0.5, 'Agua potable.', { sed: 45, color: '#4aa3df' }),
  carne_cruda: I('Carne cruda', 'comida', 20, 1, 0.8, 'Mejor cocinarla antes de comer.', { comida: 12, vida: -4, color: '#b3433f' }),
  carne_cocida: I('Carne cocida', 'comida', 20, 0.7, 0.6, 'Nutritiva y segura.', { comida: 38, vida: 6, color: '#8a4a2a' }),
  cuero: I('Cuero', 'recurso', 50, 0.8, 0.6, 'Piel de criatura lista para trabajar.', { color: '#8a5a32' }),
  hueso: I('Hueso', 'recurso', 50, 0.5, 0.4, 'Hueso duro, ideal para armas.', { color: '#e3dcc8' }),
  grasa: I('Grasa', 'recurso', 30, 0.3, 0.25, 'Grasa animal: impermeabiliza y conserva.', { color: '#e6d9a8' }),
  tendon: I('Tendón', 'recurso', 40, 0.05, 0.03, 'Cordón elástico y muy resistente.', { color: '#d8c3a0' }),
  pluma: I('Pluma', 'recurso', 80, 0.01, 0.03, 'Plumas para dar estabilidad a las flechas.', { color: '#c7b99e' }),
  diente: I('Diente grande', 'recurso', 30, 0.08, 0.04, 'Diente aserrado de un gran depredador.', { color: '#efe6cf' }),
  cuerno: I('Cuerno', 'recurso', 10, 1.4, 0.8, 'Cuerno macizo de un herbívoro acorazado.', { color: '#cdbb94' }),
  osteodermo: I('Osteodermo', 'recurso', 20, 1.1, 0.6, 'Placa ósea de la armadura de un anquilosaurio.', { color: '#a89a78' }),

  // ------------------------------------------------------------------------------------------------ materiales elaborados
  cuerda: I('Cuerda', 'recurso', 40, 0.1, 0.08, 'Cuerda trenzada de fibra o liana.', { color: '#bfa96a' }),
  guijarro: I('Guijarro', 'municion', 60, 0.15, 0.06, 'Piedra lisa para honda.', { clase: 'guijarro', dano: 9, rotura: 0.08, penetra: 0, color: '#9a978f' }),

  // ------------------------------------------------------------------------------------------------ B. herramientas primitivas
  hacha_piedra: I('Hacha de piedra', 'herramienta', 1, 2.2, 1.6, 'Tala árboles con eficacia.', { dano: 14, talar: 3, cd: 0.6, dur: 70, etiquetas: ['talar', 'contundente'], reparar: { piedra: 1, fibra: 1 } }),
  pico_piedra: I('Pico de piedra', 'herramienta', 1, 2.4, 1.6, 'Rompe rocas y mena.', { dano: 10, picar: 3, cd: 0.6, dur: 70, etiquetas: ['picar', 'contundente'], reparar: { piedra: 1, fibra: 1 } }),
  cuchillo_piedra: I('Cuchillo de piedra', 'herramienta', 1, 0.3, 0.2, 'Filo tosco para cortar y despiezar.', { dano: 8, cd: 0.4, dur: 45, etiquetas: ['corta'], reparar: { piedra: 1 } }),
  cuchillo_hueso: I('Cuchillo de hueso', 'herramienta', 1, 0.25, 0.2, 'Más fino y afilado que el de piedra.', { dano: 9, cd: 0.38, dur: 40, etiquetas: ['corta'], reparar: { hueso: 1 } }),
  cuchillo_diente: I('Cuchillo de diente', 'herramienta', 1, 0.3, 0.2, 'Un diente de depredador montado como cuchillo: corta casi todo.', { dano: 13, cd: 0.38, dur: 90, etiquetas: ['corta'], reparar: { resina: 1 } }),
  punzon_hueso: I('Punzón de hueso', 'herramienta', 1, 0.1, 0.1, 'Perfora cuero para coserlo.', { dano: 4, cd: 0.4, dur: 60, etiquetas: ['perfora'], reparar: { hueso: 1 } }),
  martillo_piedra: I('Martillo de piedra', 'herramienta', 1, 2.0, 1.2, 'Machaca y da forma a piedra y hueso.', { dano: 12, cd: 0.7, dur: 80, etiquetas: ['martillar', 'contundente'], reparar: { piedra: 1, fibra: 1 } }),
  antorcha: I('Antorcha', 'herramienta', 1, 0.6, 0.6, 'Ilumina la noche.', { dano: 6, cd: 0.55, luz: true, dur: 120, etiquetas: [] }),
  cantimplora: I('Cantimplora', 'herramienta', 1, 0.4, 0.8, 'Se llena en ríos y lagos.', {}),

  // ------------------------------------------------------------------------------------------------ C. armas (sin armas de fuego ni ballestas)
  lanza: I('Lanza', 'arma', 1, 1.6, 1.5, 'Alcance largo y buen daño.', { dano: 28, alcance: 2.6, cd: 0.7, dur: 50, penetra: 0.1, etiquetas: ['perforante'], reparar: { piedra: 1, fibra: 1 } }),
  lanza_hueso: I('Lanza de hueso', 'arma', 1, 1.5, 1.5, 'Punta de hueso: más ligera y penetrante.', { dano: 33, alcance: 2.7, cd: 0.65, dur: 55, penetra: 0.2, etiquetas: ['perforante'], reparar: { hueso: 1, cuerda: 1 } }),
  lanza_cuerno: I('Lanza de cuerno', 'arma', 1, 1.9, 1.6, 'Punta de cuerno macizo: perfora armaduras.', { dano: 42, alcance: 2.7, cd: 0.75, dur: 90, penetra: 0.4, etiquetas: ['perforante'], reparar: { resina: 1, cuerda: 1 } }),
  garrote: I('Garrote', 'arma', 1, 1.4, 1.2, 'Rama pesada. Aturde a veces.', { dano: 14, alcance: 2.0, cd: 0.5, dur: 80, penetra: 0, aturde: 0.15, etiquetas: ['contundente'], reparar: { madera: 1 } }),
  maza_piedra: I('Maza de piedra', 'arma', 1, 3.0, 1.6, 'Golpea con fuerza a través de la coraza.', { dano: 24, alcance: 2.1, cd: 0.85, dur: 75, penetra: 0.35, aturde: 0.25, etiquetas: ['contundente'], reparar: { piedra: 1, fibra: 1 } }),
  jabalina: I('Jabalina', 'arma', 1, 1.0, 1.0, 'Se arroja. Hay que recogerla después.', { dano: 30, alcance: 2.2, cd: 0.8, dur: 30, penetra: 0.15, etiquetas: ['perforante'], distancia: true, arrojadiza: true, vel: 24, carga: 0.0, reparar: { piedra: 1, fibra: 1 } }),
  arco: I('Arco', 'arma', 1, 0.9, 1.6, 'Arco de rama y cuerda. Dispara flechas.', { dano: 4, alcance: 1.6, cd: 0.9, dur: 130, distancia: true, municion: 'flecha', vel: 46, carga: 0.55, etiquetas: [], reparar: { cuerda: 1, resina: 1 } }),
  honda: I('Honda', 'arma', 1, 0.2, 0.2, 'Lanza guijarros a buena velocidad.', { dano: 2, alcance: 1.4, cd: 0.8, dur: 90, distancia: true, municion: 'guijarro', vel: 34, carga: 0.4, etiquetas: [], reparar: { cuerda: 1 } }),

  // ------------------------------------------------------------------------------------------------ D. munición
  flecha_madera: I('Flecha de madera', 'municion', 40, 0.03, 0.04, 'Punta endurecida al fuego. Barata y frágil.', { clase: 'flecha', dano: 12, rotura: 0.35, penetra: 0, color: '#b58a52' }),
  flecha_piedra: I('Flecha de piedra', 'municion', 40, 0.05, 0.04, 'Punta de piedra tallada.', { clase: 'flecha', dano: 19, rotura: 0.28, penetra: 0.1, color: '#8f8c85' }),
  flecha_hueso: I('Flecha de hueso', 'municion', 40, 0.04, 0.04, 'Punta de hueso: ligera y penetrante.', { clase: 'flecha', dano: 22, rotura: 0.22, penetra: 0.3, color: '#e3dcc8' }),

  // ------------------------------------------------------------------------------------------------ E. vestimenta y equipo personal
  capucha_cuero: I('Capucha de cuero', 'ropa', 1, 0.5, 0.6, 'Protege la cabeza del frío y los golpes leves.', { ranura: 'cabeza', armadura: 2, abrigo: 1.5, ruido: 1, dur: 90, reparar: { cuero: 1, fibra: 1 } }),
  casco_hueso: I('Casco de hueso', 'ropa', 1, 1.6, 1.4, 'Cráneo de criatura reforzado con cuero.', { ranura: 'cabeza', armadura: 5, abrigo: 0, ruido: 1, dur: 120, reparar: { hueso: 1, cuerda: 1 } }),
  chaleco_cuero: I('Chaleco de cuero', 'ropa', 1, 1.4, 1.6, 'Cuero cosido: abriga y amortigua.', { ranura: 'torso', armadura: 4, abrigo: 3, ruido: 1, dur: 110, reparar: { cuero: 1, cuerda: 1 } }),
  peto_osteodermo: I('Peto de osteodermos', 'ropa', 1, 8.5, 3.5, 'Placas óseas cosidas a cuero. Pesado, ruidoso, casi impenetrable.', { ranura: 'torso', armadura: 14, abrigo: 1, ruido: 1.35, dur: 200, reparar: { osteodermo: 1, tendon: 1 } }),
  pantalon_cuero: I('Pantalón de cuero', 'ropa', 1, 1.1, 1.3, 'Protege las piernas de espinas y mordiscos.', { ranura: 'piernas', armadura: 3, abrigo: 3, ruido: 1, dur: 110, reparar: { cuero: 1, cuerda: 1 } }),
  sandalias_cuero: I('Sandalias de cuero', 'ropa', 1, 0.4, 0.6, 'Pisadas más silenciosas y pies protegidos.', { ranura: 'pies', armadura: 1, abrigo: 0.5, ruido: 0.85, dur: 90, reparar: { cuero: 1, cuerda: 1 } }),
  capa_piel: I('Capa de piel', 'ropa', 1, 2.2, 2.2, 'Cuero engrasado: abriga mucho y repele la lluvia.', { ranura: 'espalda', armadura: 1, abrigo: 6, ruido: 1, impermeable: true, dur: 120, reparar: { cuero: 1, grasa: 1 } }),
  mochila_cuero: I('Mochila de cuero', 'ropa', 1, 1.0, 1.0, 'Aumenta lo que puedes cargar.', { ranura: 'espalda', armadura: 0, abrigo: 0.5, ruido: 1, capacidad: 30, volumen: 60, dur: 150, reparar: { cuero: 1, cuerda: 1 } }),

  // ------------------------------------------------------------------------------------------------ F. equipo de criaturas (se coloca en un animal desde su panel; cada especie solo admite lo que su anatomía permite)
  cabestro: I('Cabestro', 'aparejo', 1, 0.6, 0.7, 'Cabezada de cuerda y cuero: permite guiar a un animal grande que ya confía en ti.', { aparejo: { ranura: 'cabeza', manejo: true }, dur: 180, reparar: { cuerda: 1, cuero: 1 }, color: '#a8773f' }),
  collar_id: I('Collar de identificación', 'aparejo', 1, 0.1, 0.1, 'Tira de cuero con un hueso grabado: sirve para manejar animales pequeños y reconocer al tuyo.', { aparejo: { ranura: 'cabeza', manejo: true, collar: true }, dur: 200, reparar: { cuero: 1 }, color: '#8a5a32' }),
  arnes_cuero: I('Arnés de cuero', 'aparejo', 1, 2.5, 2.2, 'Correas cruzadas sobre el lomo: base para las alforjas y las bolsas de carga.', { aparejo: { ranura: 'lomo', arnes: true }, dur: 160, reparar: { cuero: 1, cuerda: 1 }, color: '#7d5530' }),
  alforjas: I('Alforjas', 'aparejo', 1, 3.0, 3.0, 'Dos grandes bolsas de cuero a los costados: llevan mucho peso. Solo en animales robustos.', { aparejo: { ranura: 'carga', carga: { peso: 70, vol: 140 } }, dur: 150, reparar: { cuero: 1, cuerda: 1 }, color: '#92623a' }),
  bolsa_carga: I('Bolsa de carga', 'aparejo', 1, 1.2, 1.6, 'Bolsa pequeña atada al arnés: para animales ligeros.', { aparejo: { ranura: 'carga', carga: { peso: 25, vol: 50 } }, dur: 120, reparar: { cuero: 1, cuerda: 1 }, color: '#a8773f' }),
  montura_ligera: I('Montura ligera', 'aparejo', 1, 4.0, 3.5, 'Silla baja y estribos de cuerda para un corredor veloz de dos patas. Sirve de arnés.', { aparejo: { ranura: 'lomo', arnes: true, monta: 'ligera' }, dur: 150, reparar: { cuero: 1, tendon: 1 }, color: '#8a5a32' }),
  montura_transporte: I('Montura de transporte', 'aparejo', 1, 7.0, 5.0, 'Silla ancha con respaldo, hecha para un animal pesado y de paso firme. Sirve de arnés.', { aparejo: { ranura: 'lomo', arnes: true, monta: 'transporte' }, dur: 200, reparar: { cuero: 1, tendon: 1 }, color: '#7d5530' }),
  montura_reforzada: I('Montura reforzada', 'aparejo', 1, 12.0, 7.0, 'Armazón de madera y hueso con correas dobles: aguanta a un animal que embiste y recibe golpes.', { aparejo: { ranura: 'lomo', arnes: true, monta: 'reforzada' }, dur: 280, reparar: { hueso: 1, tendon: 1 }, color: '#6e4a2a' }),
  proteccion_animal: I('Protección para animal', 'aparejo', 1, 9.0, 5.0, 'Placas de hueso y osteodermos cosidas sobre cuero: reduce el daño que recibe el animal.', { aparejo: { ranura: 'proteccion', armadura: 0.28 }, dur: 220, reparar: { hueso: 1, cuero: 1 }, color: '#a89a78' }),

  // ------------------------------------------------------------------------------------------------ consumibles y colocables
  vendaje: I('Vendaje de hojas', 'comida', 10, 0.06, 0.1, 'Cura heridas leves.', { comida: 0, vida: 25, verbo: 'Usar', color: '#7ab06a' }),
  fogata: I('Fogata', 'colocable', 5, 3.0, 2.0, 'Cocina, da calor y luz.', {}),
};

export const TIPOS = { recurso: 'Recurso', comida: 'Comida', bebida: 'Bebida', herramienta: 'Herramienta', arma: 'Arma', municion: 'Munición', ropa: 'Vestimenta', colocable: 'Colocable', aparejo: 'Equipo animal' };

export const RANURAS_ANIMAL = ['cabeza', 'lomo', 'carga', 'proteccion'];
export const RANURA_ANIMAL_NOMBRE = { cabeza: 'Cabeza (cabestro / collar)', lomo: 'Lomo (arnés / montura)', carga: 'Carga (alforjas)', proteccion: 'Protección' };
export const RANURAS = ['cabeza', 'torso', 'piernas', 'pies', 'espalda'];
export const RANURA_NOMBRE = { cabeza: 'Cabeza', torso: 'Torso', piernas: 'Piernas', pies: 'Pies', espalda: 'Espalda' };

// ------------------------------------------------------------------------------------------------ habilidades de oficio
export const HABILIDADES = {
  talla: { nombre: 'Talla y carpintería', desc: 'Herramientas de piedra, madera y hueso.' },
  cuero: { nombre: 'Cuero y costura', desc: 'Despiece, curtido, ropa y mochilas.' },
  caza: { nombre: 'Caza y proyectiles', desc: 'Arcos, hondas, flechas y jabalinas.' },
  cocina: { nombre: 'Cocina y primeros auxilios', desc: 'Cocinar y vendar.' },
  manejo: { nombre: 'Manejo de animales', desc: 'Habituar, ganar confianza, domar y equipar criaturas. Se aprende tratando con ellas, no fabricando.', fuente: 'acciones' },
};
export const NIVEL_XP = [0, 15, 45, 110, 230, 420]; // XP acumulada necesaria para cada nivel (0..5)
export const nivelDeXp = (xp) => { let n = 0; for (let i = 1; i < NIVEL_XP.length; i++) if (xp >= NIVEL_XP[i]) n = i; return n; };

export const CALIDADES = [
  { id: 0, nombre: 'Tosca', mult: 0.85, durMult: 0.8, color: '#a89a86' },
  { id: 1, nombre: 'Normal', mult: 1, durMult: 1, color: '#e8e2d2' },
  { id: 2, nombre: 'Buena', mult: 1.12, durMult: 1.25, color: '#7fd07f' },
  { id: 3, nombre: 'Excelente', mult: 1.25, durMult: 1.5, color: '#7fb6ff' },
];

// ------------------------------------------------------------------------------------------------ recetas
// herramienta: etiqueta que debe haber en la mochila (no se gasta el objeto, pero sufre desgaste de 1 uso)
// hab: { tipo, nivel } oficio y nivel mínimo   xp: experiencia que da   estacion: null | 'fogata'
// aprende: cómo se descubre la receta:
//   'inicio'            ya se conoce
//   { tiene: item }     al tener ese objeto por primera vez
//   { despiece: id }    al despiezar por primera vez esa especie
//   { receta: id }      al fabricar por primera vez esa otra receta (por id de producto)
//   { nivel: [hab, n] } al alcanzar ese nivel de oficio
// pista: lo que se muestra mientras es desconocida
// clave: identificador único de la receta (un mismo producto puede tener varias, p. ej. cuerda de fibra o de liana)
const R = (id, cantidad, costo, o = {}) => ({ id, clave: o.variante ? `${id}:${o.variante}` : id, cantidad, costo, estacion: null, herramienta: null, hab: { tipo: 'talla', nivel: 0 }, xp: 3, aprende: 'inicio', pista: '', ...o });
export const RECIPES = [
  // básicas (conocidas al empezar)
  R('hacha_piedra', 1, { madera: 3, piedra: 2, fibra: 4 }, { xp: 4 }),
  R('pico_piedra', 1, { madera: 3, piedra: 3, fibra: 4 }, { xp: 4 }),
  R('lanza', 1, { madera: 4, piedra: 1, fibra: 3 }, { xp: 4 }),
  R('antorcha', 1, { madera: 2, fibra: 2 }, { xp: 2 }),
  R('cantimplora', 1, { cuero: 2, fibra: 3 }, { hab: { tipo: 'cuero', nivel: 0 }, xp: 3 }),
  R('fogata', 1, { madera: 6, piedra: 4, pedernal: 1 }, { xp: 3 }),
  R('carne_cocida', 1, { carne_cruda: 1 }, { estacion: 'fogata', hab: { tipo: 'cocina', nivel: 0 }, xp: 1 }),
  R('cuerda', 1, { fibra: 4 }, { xp: 1 }),
  R('cuchillo_piedra', 1, { piedra: 1, madera: 1, fibra: 2 }, { xp: 3 }),
  R('garrote', 1, { rama: 2, fibra: 1 }, { xp: 2 }),
  R('guijarro', 4, { piedra: 1 }, { hab: { tipo: 'caza', nivel: 0 }, xp: 1 }),

  // se descubren al conseguir materiales
  R('cuerda', 2, { liana: 2 }, { xp: 1, aprende: { tiene: 'liana' }, pista: 'Las lianas de la selva se trenzan mejor que la fibra.', variante: 'liana' }),
  R('fibra', 3, { corteza: 2 }, { herramienta: 'corta', xp: 1, aprende: { tiene: 'corteza' }, pista: 'La corteza se deshilacha con un filo.' }),
  R('vendaje', 2, { hoja_grande: 2, fibra: 1, resina: 1 }, { hab: { tipo: 'cocina', nivel: 0 }, xp: 2, aprende: { tiene: 'hoja_grande' }, pista: 'Hojas anchas y resina cierran heridas.' }),
  R('cuchillo_hueso', 1, { hueso: 1, fibra: 2, resina: 1 }, { herramienta: 'corta', xp: 3, aprende: { tiene: 'hueso' }, pista: 'El hueso se afila como la piedra.' }),
  R('punzon_hueso', 1, { hueso: 1 }, { herramienta: 'corta', xp: 2, aprende: { tiene: 'hueso' }, pista: 'Un hueso fino y aguzado perfora cuero.' }),
  R('martillo_piedra', 1, { madera: 2, piedra: 2, fibra: 2 }, { xp: 3, aprende: { receta: 'cuchillo_piedra' }, pista: 'Una piedra bien atada a un mango golpea más fuerte.' }),
  R('cuchillo_diente', 1, { diente: 1, madera: 1, resina: 1 }, { herramienta: 'corta', hab: { tipo: 'talla', nivel: 1 }, xp: 5, aprende: { tiene: 'diente' }, pista: 'Un diente de depredador ya viene afilado.' }),
  R('arco', 1, { rama: 3, cuerda: 2 }, { herramienta: 'corta', hab: { tipo: 'caza', nivel: 0 }, xp: 5, aprende: { tiene: 'rama' }, pista: 'Una rama flexible y una cuerda tensa lanzan lejos.' }),
  R('honda', 1, { cuero: 1, cuerda: 2 }, { hab: { tipo: 'caza', nivel: 0 }, xp: 3, aprende: { receta: 'cuerda' }, pista: 'Una tira de cuero y cuerda hacen girar una piedra.' }),
  R('jabalina', 1, { madera: 3, piedra: 1, fibra: 2 }, { hab: { tipo: 'caza', nivel: 0 }, xp: 4, aprende: { receta: 'lanza' }, pista: 'Una lanza más corta y balanceada se puede arrojar.' }),
  R('flecha_madera', 2, { rama: 1, pluma: 1 }, { herramienta: 'corta', hab: { tipo: 'caza', nivel: 0 }, xp: 2, aprende: { receta: 'arco' }, pista: 'Un arco pide flechas: vara recta con plumas.' }),
  R('flecha_piedra', 2, { rama: 1, piedra: 1, pluma: 1, resina: 1 }, { herramienta: 'corta', hab: { tipo: 'caza', nivel: 1 }, xp: 3, aprende: { receta: 'flecha_madera' }, pista: 'Una punta de piedra pegada con resina hace más daño.' }),
  R('flecha_hueso', 2, { rama: 1, hueso: 1, pluma: 1, resina: 1 }, { herramienta: 'corta', hab: { tipo: 'caza', nivel: 1 }, xp: 3, aprende: { receta: 'flecha_piedra' }, pista: 'El hueso afilado penetra mejor que la piedra.' }),
  R('lanza_hueso', 1, { hueso: 1, madera: 4, cuerda: 1 }, { herramienta: 'corta', hab: { tipo: 'talla', nivel: 1 }, xp: 5, aprende: { receta: 'cuchillo_hueso' }, pista: 'Una punta de hueso sobre un buen asta.' }),
  R('maza_piedra', 1, { madera: 3, piedra: 3, fibra: 4 }, { hab: { tipo: 'talla', nivel: 1 }, xp: 5, aprende: { receta: 'garrote' }, pista: 'Un garrote con una piedra atada rompe corazas.' }),
  R('lanza_cuerno', 1, { cuerno: 1, madera: 4, cuerda: 1 }, { herramienta: 'corta', hab: { tipo: 'talla', nivel: 2 }, xp: 8, aprende: { despiece: 'triceratops' }, pista: 'Los cuernos de un gran herbívoro hacen la mejor punta.' }),

  // vestimenta (se aprende al conseguir un punzón)
  R('capucha_cuero', 1, { cuero: 2, fibra: 2 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 0 }, xp: 4, aprende: { receta: 'punzon_hueso' }, pista: 'Con un punzón se cose cuero.' }),
  R('sandalias_cuero', 1, { cuero: 2, cuerda: 1 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 0 }, xp: 4, aprende: { receta: 'punzon_hueso' }, pista: 'Con un punzón se cose cuero.' }),
  R('chaleco_cuero', 1, { cuero: 4, cuerda: 2 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 1 }, xp: 6, aprende: { receta: 'punzon_hueso' }, pista: 'Con un punzón se cose cuero.' }),
  R('pantalon_cuero', 1, { cuero: 3, cuerda: 2 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 1 }, xp: 6, aprende: { receta: 'punzon_hueso' }, pista: 'Con un punzón se cose cuero.' }),
  R('mochila_cuero', 1, { cuero: 6, cuerda: 3 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 2 }, xp: 8, aprende: { receta: 'chaleco_cuero' }, pista: 'Si sabes coser un chaleco, sabes coser una mochila.' }),
  R('capa_piel', 1, { cuero: 5, grasa: 1, cuerda: 2 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 2 }, xp: 8, aprende: { tiene: 'grasa' }, pista: 'La grasa impermeabiliza el cuero.' }),
  R('casco_hueso', 1, { hueso: 5, cuero: 1, cuerda: 2 }, { herramienta: 'corta', hab: { tipo: 'cuero', nivel: 2 }, xp: 7, aprende: { nivel: ['cuero', 2] }, pista: 'Con oficio en cuero y hueso, un casco.' }),
  R('peto_osteodermo', 1, { osteodermo: 6, cuero: 3, tendon: 4 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 3 }, xp: 14, aprende: { despiece: 'ankylosaurus' }, pista: 'Las placas óseas de un anquilosaurio forman una coraza.' }),

  // equipo de criaturas (el manejo se gana tratando con animales: ver docs/DOMESTICACION.md)
  R('cabestro', 1, { cuerda: 2, cuero: 1 }, { hab: { tipo: 'cuero', nivel: 0 }, xp: 3, aprende: { tiene: 'cuerda' }, pista: 'Cuerda y cuero bastan para guiar a un animal confiado.' }),
  R('collar_id', 1, { cuero: 1, cuerda: 1, hueso: 1 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 0 }, xp: 3, aprende: { receta: 'cabestro' }, pista: 'Para un animal pequeño, un collar en lugar de un cabestro.' }),
  R('arnes_cuero', 1, { cuero: 5, cuerda: 3, tendon: 2 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 1 }, xp: 6, aprende: { receta: 'cabestro' }, pista: 'Correas anchas sobre el lomo reparten el peso.' }),
  R('bolsa_carga', 1, { cuero: 3, cuerda: 2 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 1 }, xp: 5, aprende: { receta: 'arnes_cuero' }, pista: 'Un arnés puede sostener una bolsa.' }),
  R('alforjas', 1, { cuero: 6, cuerda: 3, fibra: 4 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 2 }, xp: 8, aprende: { receta: 'arnes_cuero' }, pista: 'Dos bolsas grandes, una a cada lado.' }),
  R('montura_ligera', 1, { cuero: 6, madera: 2, tendon: 3, cuerda: 3 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 2 }, xp: 10, aprende: { nivel: ['manejo', 1] }, pista: 'Quien ya domó a un animal sabe cómo sentarse sobre él.' }),
  R('montura_transporte', 1, { cuero: 8, madera: 4, tendon: 4, cuerda: 4 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 2 }, xp: 12, aprende: { receta: 'montura_ligera' }, pista: 'Un animal pesado pide una silla más ancha.' }),
  R('montura_reforzada', 1, { cuero: 8, hueso: 6, tendon: 5, cuerda: 4 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 3 }, xp: 16, aprende: { receta: 'montura_transporte' }, pista: 'Para un animal que embiste hace falta un armazón más duro.' }),
  R('proteccion_animal', 1, { cuero: 8, hueso: 6, osteodermo: 2, cuerda: 3 }, { herramienta: 'perfora', hab: { tipo: 'cuero', nivel: 3 }, xp: 16, aprende: { nivel: ['manejo', 2] }, pista: 'Con experiencia de manejo, una coraza para tu animal.' }),
];

// ------------------------------------------------------------------------------------------------ recolección en flora
// Cada entrada: item, n [min,max], p (probabilidad), req (etiqueta de la herramienta equipada), sin (se omite si la herramienta tiene esa etiqueta), bioma
export const RECOLECCION = {
  arbol: {
    golpe: [
      { item: 'madera', n: [1, 1], p: 1, sin: 'talar' }, // a mano (o con herramienta que no es hacha)
      { item: 'madera', n: [2, 2], p: 1, req: 'talar' }, // con hacha (sustituye a la de mano)
      { item: 'fibra', n: [1, 1], p: 0.3 },
      { item: 'rama', n: [1, 2], p: 0.4 },
      { item: 'corteza', n: [1, 1], p: 0.25, req: 'talar' },
      { item: 'resina', n: [1, 1], p: 0.08 },
      { item: 'liana', n: [1, 1], p: 0.14, bioma: 'selva' },
    ],
    caida: [{ item: 'madera', n: [5, 5], p: 1 }, { item: 'rama', n: [2, 4], p: 1 }, { item: 'corteza', n: [2, 3], p: 1, req: 'talar' }],
  },
  roca: {
    golpe: [
      { item: 'piedra', n: [2, 2], p: 1, req: 'picar' },
      { item: 'pedernal', n: [1, 1], p: 0.15, req: 'picar' },
      { item: 'piedra', n: [1, 1], p: 0.3, sin: 'picar' },
    ],
    caida: [{ item: 'piedra', n: [4, 4], p: 1 }, { item: 'pedernal', n: [1, 1], p: 1 }],
  },
  baya: {
    golpe: [{ item: 'baya', n: [3, 5], p: 1 }, { item: 'fibra', n: [1, 1], p: 1 }, { item: 'hoja_grande', n: [1, 2], p: 0.5 }],
    caida: [],
  },
};

/** Tira la tabla de recolección de una planta/roca. `tags` = etiquetas de la herramienta equipada (o []). */
export function recolectar(tipo, fase, tags = [], bioma = null, rnd = Math.random) {
  const tabla = RECOLECCION[tipo]?.[fase] ?? [];
  const tiene = (t) => tags.includes(t);
  const out = [];
  for (const e of tabla) {
    if (e.req && !tiene(e.req)) continue;
    if (e.sin && tiene(e.sin)) continue; // con la herramienta adecuada manda la otra entrada
    if (e.bioma && bioma !== e.bioma) continue;
    if (rnd() > e.p) continue;
    const n = e.n[0] + Math.floor(rnd() * (e.n[1] - e.n[0] + 1));
    out.push({ item: e.item, cantidad: n });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ aprovechamiento de cadáveres
// n [min,max]; req: null (a mano, mitad de rendimiento) | etiqueta de herramienta ('corta' | 'talar'); p: probabilidad
const T = (item, n, req = null, p = 1) => ({ item, n, req, p });
export const COSECHA = {
  compsognatus: [T('carne_cruda', [1, 1]), T('cuero', [1, 1], 'corta', 0.7), T('hueso', [1, 1], 'corta', 0.8), T('pluma', [1, 2], 'corta')],
  gallimimus: [T('carne_cruda', [3, 4]), T('cuero', [1, 2], 'corta'), T('hueso', [2, 3], 'corta'), T('pluma', [3, 6], 'corta'), T('tendon', [1, 2], 'corta', 0.5)],
  raptor: [T('carne_cruda', [2, 3]), T('cuero', [1, 2], 'corta'), T('hueso', [1, 2], 'corta'), T('pluma', [2, 4], 'corta', 0.8), T('diente', [1, 2], 'corta', 0.5), T('tendon', [1, 1], 'corta', 0.4)],
  parasaurolophus: [T('carne_cruda', [6, 9]), T('cuero', [3, 4], 'corta'), T('hueso', [3, 5], 'corta'), T('grasa', [1, 2], 'corta'), T('tendon', [1, 3], 'corta')],
  stegosaurus: [T('carne_cruda', [8, 12]), T('cuero', [4, 5], 'corta'), T('hueso', [5, 7], 'corta'), T('grasa', [2, 3], 'corta'), T('tendon', [2, 3], 'corta')],
  ankylosaurus: [T('carne_cruda', [7, 10]), T('cuero', [3, 4], 'corta'), T('hueso', [4, 6], 'corta'), T('osteodermo', [3, 5], 'talar'), T('grasa', [1, 2], 'corta'), T('tendon', [1, 2], 'corta')],
  triceratops: [T('carne_cruda', [8, 12]), T('cuero', [4, 6], 'corta'), T('hueso', [5, 8], 'corta'), T('cuerno', [1, 2], 'talar'), T('grasa', [2, 3], 'corta'), T('tendon', [2, 3], 'corta')],
  tyrannosaurus: [T('carne_cruda', [14, 20]), T('cuero', [5, 7], 'corta'), T('hueso', [8, 12], 'corta'), T('diente', [2, 5], 'corta', 0.9), T('grasa', [3, 5], 'corta'), T('tendon', [3, 5], 'corta')],
  braquiosaurio: [T('carne_cruda', [20, 30]), T('cuero', [8, 10], 'corta'), T('hueso', [10, 15], 'corta'), T('grasa', [5, 8], 'corta'), T('tendon', [4, 6], 'corta')],
  pteranodon: [T('carne_cruda', [2, 3]), T('cuero', [1, 2], 'corta'), T('hueso', [1, 2], 'corta')],
};

/**
 * Rendimiento de un cadáver. tags = etiquetas de las herramientas disponibles; calidad = multiplicador de la mejor herramienta de corte (1 = normal);
 * comido = fracción devorada por otros animales (0..1: solo afecta a la carne); nivel = nivel de oficio de cuero (+4 % por nivel).
 */
export function despiezar(especie, tags = [], calidad = 1, comido = 0, nivel = 0, rnd = Math.random) {
  const tabla = COSECHA[especie] ?? [];
  const out = [], perdidos = [];
  for (const e of tabla) {
    const ok = !e.req || tags.includes(e.req);
    if (rnd() > e.p) continue;
    let n = e.n[0] + rnd() * (e.n[1] - e.n[0] + 0.999);
    n *= e.req ? calidad * (1 + 0.04 * nivel) : (tags.includes('corta') ? calidad : 0.5);
    if (e.item === 'carne_cruda') n *= 1 - 0.85 * Math.min(1, Math.max(0, comido));
    n = Math.floor(n);
    if (!ok) { if (n > 0) perdidos.push({ item: e.item, req: e.req }); continue; }
    if (n >= 1) out.push({ item: e.item, cantidad: n });
  }
  return { items: out, perdidos };
}

// ------------------------------------------------------------------------------------------------ utilidades de objeto
export const esDesgastable = (id) => !!ITEMS[id]?.dur;
export const tieneEtiqueta = (id, tag) => !!ITEMS[id]?.etiquetas?.includes(tag);
/** Estado visible a partir de la fracción de durabilidad restante. */
export function estadoDur(f) { return f > 0.75 ? 'Nuevo' : f > 0.4 ? 'Usado' : f > 0.15 ? 'Desgastado' : 'Casi roto'; }

// Pesos y volúmenes base de la mochila
export const CAPACIDAD_BASE = { peso: 60, volumen: 150 };
