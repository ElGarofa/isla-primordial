// Genera docs/ITEMS_RECETAS.md a partir de los datos reales (core/items.js): nunca se desactualiza respecto del juego.
//   uso: node tools/gen-items-doc.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS, TIPOS, RECIPES, RECOLECCION, COSECHA, HABILIDADES, CALIDADES, NIVEL_XP, RANURA_NOMBRE, CAPACIDAD_BASE } from '../src/core/items.js';
import { DETALLE } from '../src/fauna/catalogo.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'ITEMS_RECETAS.md');
const N = (id) => ITEMS[id]?.nombre ?? id;
const cos = (c) => Object.entries(c).map(([k, v]) => `${v}× ${N(k)}`).join(', ');
const aprende = (a) => (a === 'inicio' ? 'Desde el principio' : a.tiene ? `Al tener ${N(a.tiene)}` : a.despiece ? `Al despiezar ${DETALLE[a.despiece] ? a.despiece : a.despiece}` : a.receta ? `Al fabricar ${N(a.receta)}` : `Al llegar a ${HABILIDADES[a.nivel[0]].nombre} ${a.nivel[1]}`);
const HERR = { corta: 'algo que corte', perfora: 'punzón', talar: 'hacha', picar: 'pico', martillar: 'martillo' };
const grupos = [['recurso', 'Familia A — Recursos naturales y materiales'], ['herramienta', 'Familia B — Herramientas primitivas'], ['arma', 'Familia C — Armas (sin armas de fuego ni ballestas)'], ['municion', 'Familia D — Munición'], ['ropa', 'Familia E — Vestimenta y mochila'], ['comida', 'Comida y curación'], ['aparejo', 'Familia F — Equipo animal (Etapa 3)'], ['bebida', 'Bebida'], ['colocable', 'Colocables']];

let md = `# Objetos, recetas y aprendizaje (Etapas 2 y 3)

> Documento generado por \`node tools/gen-items-doc.mjs\` desde \`src/core/items.js\` (única fuente de verdad). No editar a mano.
> ${Object.keys(ITEMS).length} objetos · ${RECIPES.length} recetas · ${Object.keys(COSECHA).length} tablas de despiece.

## Cómo funciona

- **Un solo catálogo** (\`core/items.js\`, datos puros que también importan las pruebas en Node). El inventario, las recetas, la recolección y el despiece leen de él; no hay un segundo gestor.
- **Peso y volumen.** La mochila base carga **${CAPACIDAD_BASE.peso} kg** y **${CAPACIDAD_BASE.volumen} L**. El peso es un límite blando: por encima de la capacidad vas más lento (hasta −45 % de velocidad, a 1,6× la capacidad ya no entra nada más). El volumen es un límite duro. La mochila de cuero suma +30 kg y +60 L.
- **Durabilidad y estado.** Cada herramienta, arma y prenda es una instancia con \`dur\`, \`cal\` y \`rep\`. Se gasta al usarla (más si es la herramienta equivocada) y se rompe a 0. Estados: Nuevo > 75 % · Usado > 40 % · Desgastado > 15 % · Casi roto.
- **Calidad** (al fabricar): ${Object.entries(CALIDADES).map(([k, v]) => `${v.nombre} (×${v.mult} efecto, ×${v.durMult} durabilidad)`).join(' · ')}. Sale de tu nivel de oficio frente al que pide la receta, más un poco de azar.
- **Reparar.** Consume los materiales de la ficha del objeto y devuelve un 40 % de la durabilidad máxima; cada reparación resta un 10 % de ese máximo (tope de 4 remiendos).
- **Ropa.** Cinco ranuras (${Object.values(RANURA_NOMBRE).join(', ')}). La armadura reduce el daño de las criaturas con \`A/(A+30)\` y desgasta una prenda al azar; no protege del frío, el hambre ni las caídas. El abrigo sube la temperatura corporal con frío; algunas piezas cambian el ruido que haces (lo oyen las criaturas).
- **Armas.** Daño, alcance, velocidad, penetración (reduce la coraza natural de la criatura golpeada), aturdimiento y ruido salen de la ficha. Arco y honda gastan munición (con probabilidad de romperse al impactar; si no, queda en el suelo); la jabalina se arroja y se recoge con la durabilidad que le queda.
- **Aprendizaje.** No conoces todas las recetas. Se descubren **por tener** un material, **por despiezar** una especie, **por fabricar** algo previo o **por nivel de oficio** (Talla, Cuero, Caza, Cocina; niveles 0–5 a ${NIVEL_XP.join(' / ')} XP). Las recetas por descubrir aparecen como pistas.
- **Despiece.** Los cadáveres ya no sueltan botín solos: se usa "Despiezar" con un cuchillo (cuero, hueso, tendón…) o un hacha (cuerno, osteodermos). A mano solo se saca carne (la mitad). Lo que otros animales hayan devorado reduce la carne. Dura más que antes y desaparece poco después de despiezado.
- **Equipo animal (familia F).** Cabestro y collar para manejar animales ya confiados; arnés, sillas (ligera, de transporte, reforzada), alforjas, bolsas y protección. Qué admite cada especie depende de su anatomía (\`montura\` en \`fauna/catalogo.js\`): ver \`docs/DOMESTICACION.md\`. Se equipa desde el panel del animal, no desde la ropa del jugador.\n- **Partidas antiguas (v1)** se migran al cargar: los objetos reciben durabilidad completa y calidad normal, y se recalculan las recetas conocidas.

## Oficios

${Object.entries(HABILIDADES).map(([k, h]) => `- **${h.nombre}** (\`${k}\`): ${h.desc}`).join('\n')}

`;
for (const [tipo, titulo] of grupos) {
  const ids = Object.keys(ITEMS).filter((i) => ITEMS[i].tipo === tipo); if (!ids.length) continue;
  md += `## ${titulo}\n\n| Objeto | Peso | Vol. | Datos | Descripción |\n|---|---|---|---|---|\n`;
  for (const id of ids) {
    const it = ITEMS[id], d = [];
    if (it.apilable > 1) d.push(`pila ${it.apilable}`);
    if (it.dur) d.push(`dur ${it.dur}`);
    if (it.dano) d.push(`daño ${it.dano}`);
    if (it.alcance && it.tipo === 'arma' && !it.distancia) d.push(`alcance ${it.alcance} m`);
    if (it.penetra) d.push(`penetra ${Math.round(it.penetra * 100)} %`);
    if (it.aturde) d.push(`aturde ${Math.round(it.aturde * 100)} %`);
    if (it.municion) d.push(`usa ${it.municion}`); if (it.arrojadiza) d.push('arrojadiza');
    if (it.etiquetas?.length) d.push(`[${it.etiquetas.join(', ')}]`);
    if (it.ranura) d.push(`ranura ${it.ranura}`); if (it.armadura) d.push(`armadura ${it.armadura}`); if (it.abrigo) d.push(`abrigo ${it.abrigo}`);
    if (it.ruido && it.ruido !== 1) d.push(`ruido ×${it.ruido}`); if (it.impermeable) d.push('impermeable'); if (it.capacidad) d.push(`+${it.capacidad} kg, +${it.volumen} L`);
    if (it.aparejo) { const a = it.aparejo; d.push(`ranura animal ${a.ranura}`); if (a.manejo) d.push(a.collar ? 'collar de manejo' : 'cabestro de manejo'); if (a.arnes) d.push('arnés'); if (a.monta) d.push(`silla ${a.monta}`); if (a.carga) d.push(`carga ${a.carga.peso} kg / ${a.carga.vol} L (× factor de la especie)`); if (a.armadura) d.push(`−${Math.round(a.armadura * 100)} % de daño al animal`); }
    if (it.reparar) d.push(`repara con ${cos(it.reparar)}`);
    md += `| ${it.nombre} | ${it.peso} kg | ${it.vol} L | ${d.join(' · ')} | ${it.descripcion} |\n`;
  }
  md += '\n';
}
md += `## Recetas (${RECIPES.length})\n\n| Producto | Materiales | Requisitos | Oficio | XP | Se aprende |\n|---|---|---|---|---|---|\n`;
for (const r of RECIPES) {
  const req = [r.herramienta ? `herramienta: ${HERR[r.herramienta] ?? r.herramienta}` : '', r.estacion ? 'fogata encendida' : ''].filter(Boolean).join(', ') || '—';
  md += `| ${N(r.id)}${r.cantidad > 1 ? ` ×${r.cantidad}` : ''}${r.variante ? ` (${r.variante})` : ''} | ${cos(r.costo)} | ${req} | ${HABILIDADES[r.hab.tipo].nombre.split(' y ')[0]} ${r.hab.nivel} | ${r.xp} | ${aprende(r.aprende)} |\n`;
}
md += `\n## Recolección en el mundo\n\n| Fuente | Fase | Objeto | Cantidad | Prob. | Condición |\n|---|---|---|---|---|---|\n`;
for (const [tipo, fases] of Object.entries(RECOLECCION)) for (const [fase, tabla] of Object.entries(fases)) for (const e of tabla)
  md += `| ${tipo} | ${fase === 'golpe' ? 'cada golpe' : 'al caer/romperse'} | ${N(e.item)} | ${e.n[0] === e.n[1] ? e.n[0] : `${e.n[0]}–${e.n[1]}`} | ${Math.round(e.p * 100)} % | ${[e.req ? `herramienta ${e.req}` : '', e.sin ? `sin ${e.sin}` : '', e.bioma ? `bioma ${e.bioma}` : ''].filter(Boolean).join(', ') || '—'} |\n`;
md += `\n## Despiece por especie\n\n"Req." = etiqueta de herramienta que hace falta (sin ella se pierde y se avisa). Sin ninguna herramienta solo se obtiene carne, a la mitad.\n\n| Especie | Obtiene |\n|---|---|\n`;
for (const [esp, tabla] of Object.entries(COSECHA)) md += `| ${esp} | ${tabla.map((e) => `${N(e.item)} ${e.n[0] === e.n[1] ? e.n[0] : `${e.n[0]}–${e.n[1]}`}${e.req ? ` (req. ${e.req})` : ''}${e.p < 1 ? ` ${Math.round(e.p * 100)} %` : ''}`).join(' · ')} |\n`;
md += `
## Pruebas

- \`node tools/items-test.mjs\` — integridad de datos y **alcanzabilidad**: todos los objetos se pueden conseguir desde cero siguiendo el grafo real de aprendizaje.
- \`node tools/craft-test.mjs\` — en navegador: las ${RECIPES.length} recetas (consumo, producción, desgaste, XP, evento), rechazos, aprendizaje, oficios, rotura, reparación, carga, armadura, melé, arco, honda, jabalina, despiece, guardado v2 y migración desde v1.
`;
fs.writeFileSync(out, md);
console.log('escrito', out, md.length, 'bytes');
