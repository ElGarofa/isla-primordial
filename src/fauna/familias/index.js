// FAMILIAS DE ESPECIES — genera las especies del catálogo que no tienen modelo hecho a mano. Se llama una vez desde species.js.
// Cada familia aporta filas {id, g (geometría), e (ecología)}; aquí se ensamblan, se registran en SPECIES/DETALLE/COSECHA y se resuelven las relaciones depredador–presa.
import { POR_ID } from '../catalogo.js';
import { COSECHA } from '../../core/items.js';
import { ensamblar, resolverRelaciones } from './nucleo.js';
import { TABLA_BIPEDOS, prepararBipedo } from './bipedos.js';
import { TABLA_CUADRUPEDOS, prepararCuadrupedo } from './cuadrupedos.js';
import { TABLA_PTEROSAURIOS, prepararPterosaurio } from './pterosaurios.js';
import { TABLA_COCODRILOS, TABLA_MAMIFEROS, TABLA_ANFIBIOS } from './otros-cuadrupedos.js';
import { TABLA_ACUATICOS, prepararAcuatico } from './acuaticos.js';
import { ESTATICOS } from '../estaticos.js';
import { construirEstatico } from '../estatico.js';

const FAMILIAS = [
  { nombre: 'bipedos', filas: () => TABLA_BIPEDOS.map((f) => prepararBipedo(f, POR_ID)) },
  { nombre: 'cuadrupedos', filas: () => TABLA_CUADRUPEDOS.map((f) => prepararCuadrupedo(f, POR_ID)) },
  { nombre: 'pterosaurios', filas: () => TABLA_PTEROSAURIOS.map((f) => prepararPterosaurio(f, POR_ID)) },
  { nombre: 'cocodrilomorfos', filas: () => TABLA_COCODRILOS.map((f) => prepararCuadrupedo(f, POR_ID)) },
  { nombre: 'mamiferos', filas: () => TABLA_MAMIFEROS.map((f) => prepararCuadrupedo(f, POR_ID)) },
  { nombre: 'anfibios', filas: () => TABLA_ANFIBIOS.map((f) => prepararCuadrupedo(f, POR_ID)) },
  { nombre: 'acuaticos', filas: () => TABLA_ACUATICOS.map((f) => prepararAcuatico(f, POR_ID)) },
];

export const FAMILIAS_INFO = {}; // familia → ids (para pruebas y documentación)

/**
 * Engancha el modelo 3D estático (estaticos.js) a TODAS las especies que lo declaran, hechas a mano o generadas: mientras no esté cargado
 * (o si falla) vale la malla procedural. Las pieles generadas con prioridad sustituyen también al GLB animado antiguo (`sp.glb`).
 */
export function engancharEstaticos(SPECIES) {
  for (const [id, sp] of Object.entries(SPECIES)) {
    const e = ESTATICOS[id];
    if (!e || sp.estatico) continue;
    if (sp.glb && !e.prioridad) continue;
    if (sp.glb) { sp.glbAnterior = sp.glb; delete sp.glb; }
    const proc = sp.build; sp.estatico = { ...e }; sp.buildProcedural = proc;
    sp.build = function () { return this.estatico?.datos ? construirEstatico(this) : proc.call(this); };
  }
}

/**
 * Añade a `SPECIES` y `DETALLE` las especies generadas y a `COSECHA` su tabla de despiece; después completa `caza`/`teme` de TODAS las especies
 * (las hechas a mano conservan sus listas y reciben las nuevas del mismo ecosistema).
 */
export function generarFamilias(SPECIES, DETALLE) {
  const creadas = [];
  for (const fam of FAMILIAS) {
    FAMILIAS_INFO[fam.nombre] = [];
    for (const { id, g, e } of fam.filas()) {
      if (SPECIES[id]) throw new Error(`Especie duplicada: ${id}`);
      const { sp, det, cos } = ensamblar(id, g, e);
      SPECIES[id] = sp; DETALLE[id] = det;
      COSECHA[id] = cos.map(([item, n, req, p]) => ({ item, n, req: req ?? null, p: p ?? 1 }));
      FAMILIAS_INFO[fam.nombre].push(id);
      creadas.push(id);
    }
  }
  // relaciones ecológicas (todas las especies)
  const todos = new Map();
  for (const [id, sp] of Object.entries(SPECIES)) {
    const det = DETALLE[id], cat = POR_ID[id];
    if (!det || !cat) continue;
    todos.set(id, {
      det, masa: cat.masa, eco: cat.ecosistema, tipo: sp.tipo === 'depredador' ? 'depredador' : 'otro', manada: !!sp.ai?.manada,
      defensivo: !!sp.ai?.defiende || sp.tipo === 'herbivoro' && cat.masa > 3000, acuatico: cat.tipoAnimal === 'reptil_marino' || cat.tipoAnimal === 'pez', volador: cat.tipoAnimal === 'pterosaurio',
      sinCaza: !!sp.sinCaza,
    });
  }
  resolverRelaciones(todos);
  return creadas;
}
