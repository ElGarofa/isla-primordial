// Pruebas de DATOS de objetos, recetas, recolección, despiece y aprendizaje (Node puro, sin navegador).
// Comprueba integridad (referencias, claves únicas, etiquetas) y ALCANZABILIDAD: que todo objeto del catálogo se pueda obtener
// partiendo de las manos vacías, siguiendo el grafo real de aprendizaje (descubrir por tener, fabricar, despiezar o subir de oficio).
//   uso: node tools/items-test.mjs
import { ITEMS, TIPOS, RANURAS, RECIPES, RECOLECCION, COSECHA, HABILIDADES, CALIDADES, NIVEL_XP, nivelDeXp, recolectar, despiezar } from '../src/core/items.js';
import { createSaber, tirarCalidad } from '../src/survival/saber.js';
import { DETALLE } from '../src/fauna/catalogo.js';

let fallos = 0, ok = 0;
const check = (cond, msg) => { if (cond) { ok++; } else { fallos++; console.log('  ✗', msg); } };
const seccion = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------- 1. integridad de objetos
seccion('1. Integridad de objetos');
const claseMunicion = new Set(Object.values(ITEMS).filter((i) => i.tipo === 'municion').map((i) => i.clase));
for (const [id, it] of Object.entries(ITEMS)) {
  check(typeof it.nombre === 'string' && it.nombre.length > 1, `${id}: nombre`);
  check(it.tipo in TIPOS, `${id}: tipo desconocido ${it.tipo}`);
  check(it.peso > 0 && it.vol > 0, `${id}: peso/volumen deben ser > 0`);
  check(typeof it.descripcion === 'string' && it.descripcion.length > 5, `${id}: descripción`);
  check(it.apilable >= 1 && Number.isInteger(it.apilable), `${id}: apilable`);
  if (it.dur) check(it.apilable === 1, `${id}: un objeto con durabilidad no debe apilarse`);
  if (it.tipo === 'ropa') { check(RANURAS.includes(it.ranura), `${id}: ranura inválida`); check(it.dur > 0, `${id}: la ropa necesita durabilidad`); }
  if (it.tipo === 'arma' || it.tipo === 'herramienta') check(it.apilable === 1, `${id}: herramientas y armas no se apilan`);
  if (it.tipo === 'arma') check(it.dano > 0 && it.cd > 0, `${id}: arma sin daño/cd`);
  if (it.municion) check(claseMunicion.has(it.municion), `${id}: munición '${it.municion}' sin objeto de esa clase`);
  if (it.tipo === 'municion') check(it.dano > 0 && it.rotura >= 0 && it.rotura <= 1, `${id}: munición sin daño/rotura`);
  if (it.distancia && !it.municion) check(it.arrojadiza, `${id}: arma a distancia sin munición debe ser arrojadiza`);
  for (const m of Object.keys(it.reparar ?? {})) check(m in ITEMS, `${id}: material de reparación '${m}' inexistente`);
  if (it.reparar) check(it.dur > 0, `${id}: reparable sin durabilidad`);
}
console.log(`  ${Object.keys(ITEMS).length} objetos`);

// ---------------------------------------------------------------- 2. integridad de recetas
seccion('2. Integridad de recetas');
const claves = new Set();
const etiquetasExistentes = new Set(Object.values(ITEMS).flatMap((i) => i.etiquetas ?? []));
const idsConReceta = new Set(RECIPES.map((r) => r.id));
for (const r of RECIPES) {
  check(!claves.has(r.clave), `clave duplicada ${r.clave}`); claves.add(r.clave);
  check(r.id in ITEMS, `${r.clave}: producto '${r.id}' inexistente`);
  check(r.cantidad >= 1, `${r.clave}: cantidad`);
  check(Object.keys(r.costo).length > 0, `${r.clave}: sin materiales`);
  for (const [m, n] of Object.entries(r.costo)) { check(m in ITEMS, `${r.clave}: material '${m}' inexistente`); check(n >= 1 && Number.isInteger(n), `${r.clave}: cantidad de ${m}`); check(m !== r.id || r.cantidad > n, `${r.clave}: se consume a sí mismo`); }
  if (r.herramienta) check(etiquetasExistentes.has(r.herramienta), `${r.clave}: ninguna herramienta tiene la etiqueta '${r.herramienta}'`);
  if (r.estacion) check(r.estacion === 'fogata', `${r.clave}: estación desconocida ${r.estacion}`);
  check(r.hab.tipo in HABILIDADES, `${r.clave}: oficio '${r.hab.tipo}'`);
  check(r.hab.nivel >= 0 && r.hab.nivel < NIVEL_XP.length, `${r.clave}: nivel`);
  check(r.xp > 0, `${r.clave}: xp`);
  const a = r.aprende;
  if (a !== 'inicio') {
    if (a.tiene) check(a.tiene in ITEMS, `${r.clave}: aprende por tener '${a.tiene}' inexistente`);
    if (a.despiece) check(a.despiece in COSECHA, `${r.clave}: aprende por despiece de '${a.despiece}' sin tabla`);
    if (a.receta) check(idsConReceta.has(a.receta), `${r.clave}: aprende de la receta '${a.receta}' inexistente`);
    if (a.nivel) check(a.nivel[0] in HABILIDADES, `${r.clave}: aprende por nivel de oficio inválido`);
    check(r.pista && r.pista.length > 8, `${r.clave}: una receta que se descubre necesita pista`);
  }
}
console.log(`  ${RECIPES.length} recetas`);

// ---------------------------------------------------------------- 3. recolección y despiece
seccion('3. Recolección y despiece');
for (const [tipo, fases] of Object.entries(RECOLECCION)) for (const [fase, tabla] of Object.entries(fases)) for (const e of tabla) {
  check(e.item in ITEMS, `recolección ${tipo}/${fase}: '${e.item}' inexistente`);
  check(e.n[0] >= 1 && e.n[1] >= e.n[0] && e.p > 0 && e.p <= 1, `recolección ${tipo}/${fase}/${e.item}: n/p`);
}
for (const [esp, tabla] of Object.entries(COSECHA)) for (const e of tabla) {
  check(e.item in ITEMS, `cosecha ${esp}: '${e.item}' inexistente`);
  check(e.req == null || etiquetasExistentes.has(e.req) || e.req === 'talar', `cosecha ${esp}/${e.item}: etiqueta '${e.req}'`);
}
check(Object.keys(DETALLE).every((id) => id in COSECHA), 'toda especie jugable tiene tabla de despiece: faltan ' + Object.keys(DETALLE).filter((id) => !(id in COSECHA)).join(','));
check(Object.keys(COSECHA).every((id) => id in DETALLE), 'tabla de despiece de una especie inexistente');
// a mano rinde menos que con cuchillo; sin herramienta se pierden cuero y hueso; lo devorado reduce la carne
const fijo = (v) => () => v;
const mano = despiezar('stegosaurus', [], 1, 0, 0, fijo(0)), cuch = despiezar('stegosaurus', ['corta'], 1, 0, 0, fijo(0));
const nCarne = (r) => r.items.find((d) => d.item === 'carne_cruda')?.cantidad ?? 0;
check(nCarne(cuch) > nCarne(mano), `con cuchillo se saca más carne (${nCarne(cuch)} vs ${nCarne(mano)})`);
check(!mano.items.some((d) => d.item === 'cuero') && mano.perdidos.some((d) => d.item === 'cuero'), 'a mano no se obtiene cuero y se avisa de lo perdido');
check(nCarne(despiezar('stegosaurus', ['corta'], 1, 1, 0, fijo(0))) < nCarne(cuch) / 2, 'una carcasa devorada rinde mucha menos carne');
check(despiezar('triceratops', ['corta'], 1, 0, 0, fijo(0)).perdidos.some((d) => d.item === 'cuerno'), 'el cuerno exige un hacha (se avisa si falta)');
check(despiezar('triceratops', ['corta', 'talar'], 1, 0, 0, fijo(0)).items.some((d) => d.item === 'cuerno'), 'con hacha sí se saca el cuerno');
check(despiezar('stegosaurus', ['corta'], 1.25, 0, 3, fijo(0)).items.find((d) => d.item === 'cuero').cantidad > despiezar('stegosaurus', ['corta'], 1, 0, 0, fijo(0)).items.find((d) => d.item === 'cuero').cantidad, 'calidad y oficio aumentan el cuero');
check(recolectar('arbol', 'golpe', [], null, fijo(0)).some((d) => d.item === 'madera' && d.cantidad === 1), 'a mano un árbol da 1 madera');
check(recolectar('arbol', 'golpe', ['talar'], null, fijo(0)).filter((d) => d.item === 'madera').every((d) => d.cantidad === 2), 'con hacha un árbol da 2 madera');
check(!recolectar('roca', 'golpe', [], null, fijo(0)).some((d) => d.item === 'pedernal'), 'sin pico no hay pedernal');
check(recolectar('arbol', 'golpe', [], 'selva', fijo(0)).some((d) => d.item === 'liana') && !recolectar('arbol', 'golpe', [], 'playa', fijo(0)).some((d) => d.item === 'liana'), 'la liana solo en selva');

// ---------------------------------------------------------------- 4. alcanzabilidad (grafo real de aprendizaje)
seccion('4. Alcanzabilidad: todo objeto se puede conseguir desde cero');
{
  const saber = createSaber();
  const tengo = new Set(['madera']); // a mano un árbol da madera; la lista crece por punto fijo
  const herr = () => new Set([...tengo].flatMap((i) => ITEMS[i]?.etiquetas ?? []));
  const fogata = () => tengo.has('fogata');
  const tags = () => { const h = herr(); return [...h]; };
  const orden = [];
  const matar = new Set(); // especies que se pueden cazar (hace falta un arma)
  const hechas = new Map();
  let cambio = true, vueltas = 0;
  const dar = (i, por) => { if (!tengo.has(i)) { tengo.add(i); saber.verItem(i); orden.push(`${i} ← ${por}`); cambio = true; } };
  saber.verItem('madera');
  while (cambio && vueltas++ < 400) {
    cambio = false;
    // recolección según las herramientas que ya tiene (los biomas existen en el mapa: se asume que se puede llegar a todos)
    for (const tipo of Object.keys(RECOLECCION)) for (const fase of Object.keys(RECOLECCION[tipo])) for (const e of RECOLECCION[tipo][fase]) {
      if ((!e.req || herr().has(e.req)) && (!e.sin || !herr().has(e.sin))) dar(e.item, `${tipo}/${fase}`);
    }
    // caza: con cualquier arma de melé o a distancia se puede matar y despiezar
    const puedeCazar = [...tengo].some((i) => ITEMS[i]?.tipo === 'arma');
    if (puedeCazar) for (const esp of Object.keys(COSECHA)) {
      if (!matar.has(esp)) { matar.add(esp); orden.push(`(caza ${esp})`); }
      saber.despiece(esp);
      const r = despiezar(esp, tags(), 1, 0, saber.nivel('cuero'), () => 0);
      for (const d of r.items) dar(d.item, `despiece ${esp}`);
    }
    // el agua y la comida básica se toman del mundo
    dar('agua', 'río'); dar('baya', 'arbusto');
    // fabricar: cualquier receta conocida y posible (se repite para subir de nivel)
    for (const r of RECIPES) {
      if (!saber.conoce(r.clave)) continue;
      if (saber.nivel(r.hab.tipo) < r.hab.nivel) continue;
      if (r.herramienta && !herr().has(r.herramienta)) continue;
      if (r.estacion && !fogata()) continue;
      if (!Object.keys(r.costo).every((m) => tengo.has(m))) continue;
      dar(r.id, `receta ${r.clave}`);
      saber.fabricar(r.id);
      // repetir recetas da experiencia: materiales renovables, hasta 60 repeticiones por receta (tope razonable de farmeo)
      const n = (hechas.get(r.clave) ?? 0);
      if (n < 60) { hechas.set(r.clave, n + 1); saber.ganar(r.hab.tipo, r.xp); cambio = true; }
    }
    // manejo de animales: la experiencia sale de tratar con criaturas (ofrendas, cabestro, domesticación). Hasta 5 ejemplares por especie.
    for (const [id, d] of Object.entries(DETALLE)) {
      const dm = d.doma; if (!dm || dm.max < 4 || !dm.manejo) continue;
      if (!tengo.has(dm.manejo.equipo) || saber.nivel('manejo') < dm.manejo.nivel || !Object.keys(dm.comida).some((i) => tengo.has(i))) continue;
      const k = `doma:${id}`, n = hechas.get(k) ?? 0;
      if (n < 5) { hechas.set(k, n + 1); saber.ganar('manejo', xpDoma(dm)); cambio = true; }
    }
  }
  const sin = Object.keys(ITEMS).filter((i) => !tengo.has(i));
  check(sin.length === 0, `objetos inalcanzables: ${sin.join(', ') || '—'}`);
  const noApren = RECIPES.filter((r) => !saber.conoce(r.clave)).map((r) => r.clave);
  check(noApren.length === 0, `recetas imposibles de aprender: ${noApren.join(', ') || '—'}`);
  console.log(`  alcanzados ${tengo.size}/${Object.keys(ITEMS).length} objetos en ${vueltas} pasadas`);
}

// XP de manejo que da domar un ejemplar: ofrendas (1 c/u) + cabestro (4) + domesticación (12, solo si la especie llega a nivel 5)
function xpDoma(dm) { return dm.ofrendas + 4 + (dm.max >= 5 ? 12 : 0); }

// ---------------------------------------------------------------- 5. progresión de oficios sin atajos
seccion('5. Los niveles de oficio se pueden ganar paso a paso');
for (const hab of Object.keys(HABILIDADES)) {
  const reqs = RECIPES.filter((r) => r.hab.tipo === hab);
  const nMax = Math.max(...reqs.map((r) => r.hab.nivel), 0);
  for (let n = 1; n <= nMax; n++) {
    // para alcanzar el nivel n hace falta XP de recetas del oficio con nivel exigido < n
    const fuentes = reqs.filter((r) => r.hab.nivel < n);
    check(fuentes.length > 0, `oficio ${hab}: no hay recetas de nivel < ${n} que den experiencia para subir a ${n}`);
    const mejor = Math.max(...fuentes.map((r) => r.xp));
    const veces = Math.ceil(NIVEL_XP[n] / mejor);
    check(veces <= 60, `oficio ${hab}: subir a nivel ${n} exige ${veces} fabricaciones de la mejor receta (demasiado)`);
  }
}

// ---------------------------------------------------------------- 6. aprendizaje y calidad
// manejo: los niveles que piden las recetas de equipo y el cabestro de cada especie se ganan tratando con animales más sencillos
{
  const niveles = [...RECIPES.map((r) => r.aprende?.nivel).filter((a) => a && a[0] === 'manejo').map((a) => a[1]), ...Object.values(DETALLE).map((d) => d.doma?.manejo?.nivel ?? 0)];
  for (let n = 1; n <= Math.max(0, ...niveles); n++) {
    const fuentes = Object.values(DETALLE).filter((d) => d.doma?.max >= 4 && d.doma.manejo && d.doma.manejo.nivel < n);
    check(fuentes.length > 0, `manejo ${n}: no hay especie de nivel inferior que dé experiencia`);
    const total = fuentes.reduce((a, d) => a + 5 * xpDoma(d.doma), 0);
    check(total >= NIVEL_XP[n], `manejo ${n}: las especies más sencillas dan ${total} XP y hacen falta ${NIVEL_XP[n]}`);
  }
  // el equipo de manejo y la comida de cada especie existen
  for (const [id, d] of Object.entries(DETALLE)) {
    const dm = d.doma; if (!dm) { check(false, `${id}: falta doma`); continue; }
    check(dm.max >= 0 && dm.max <= 6, `${id}: doma.max fuera de rango`);
    for (const it of Object.keys(dm.comida)) check(!!ITEMS[it] && dm.comida[it] > 0, `${id}: comida inválida ${it}`);
    if (dm.max >= 4) check(dm.manejo && ITEMS[dm.manejo.equipo]?.aparejo?.manejo, `${id}: max ≥ 4 exige equipo de manejo`);
    if (dm.max >= 5) check(dm.cuidado?.dias > 0 && dm.cuidado.biomas.length, `${id}: max ≥ 5 exige cuidado`);
    if (dm.max >= 6) check(!!d.montura, `${id}: nivel 6 exige anatomía de montura`);
    if (d.montura) {
      check(d.montura.ancla?.length === 3, `${id}: ancla de montura`);
      for (const t of d.montura.tipos) check(Object.values(ITEMS).some((i) => i.aparejo?.monta === t), `${id}: no existe montura ${t}`);
      for (const it of d.montura.carga?.items ?? []) check(ITEMS[it]?.aparejo?.ranura === 'carga', `${id}: carga inválida ${it}`);
    }
    if ((d.caza?.length ?? 0) > 0) check(dm.max <= 3, `${id}: un gran depredador no puede pasar de habituado`);
  }
}

seccion('6. Aprendizaje y calidad');
{
  const s = createSaber();
  check(s.conoce('hacha_piedra') && s.conoce('lanza') && s.conoce('fogata'), 'se empieza sabiendo las recetas básicas');
  check(!s.conoce('arco') && !s.conoce('chaleco_cuero'), 'no se empieza sabiendo el arco ni la ropa');
  check(s.verItem('rama').some((r) => r.clave === 'arco'), 'tener una rama enseña el arco');
  check(s.fabricar('arco').some((r) => r.clave === 'flecha_madera'), 'fabricar el arco enseña las flechas');
  check(s.fabricar('flecha_madera').some((r) => r.clave === 'flecha_piedra'), 'y de ahí las de piedra');
  check(s.despiece('triceratops').some((r) => r.clave === 'lanza_cuerno'), 'despiezar un triceratops enseña la lanza de cuernos');
  check(s.ganar('cuero', NIVEL_XP[2]).nuevas.some((r) => r.clave === 'casco_hueso'), 'llegar a cuero 2 enseña el casco de hueso');
  check(s.ganar('talla', 14).nivel === 0 && s.ganar('talla', 1).nivel === 1, 'el nivel sube justo en el umbral de XP');
  const copia = createSaber(); copia.restore(JSON.parse(JSON.stringify(s.serialize())));
  check(copia.conoce('lanza_cuerno') && copia.nivel('cuero') === 2 && copia.nivel('talla') === 1, 'guardar y restaurar conserva lo aprendido');
  const vieja = createSaber(); vieja.restore(null);
  check(vieja.conoce('hacha_piedra') && !vieja.conoce('arco'), 'restaurar sin datos (partida v1) deja el estado inicial');
  // calidad: más oficio → mejor; nunca fuera de 0..3; rango razonable
  const media = (nivelOficio, nivelReceta) => { let t = 0; const N = 4000; for (let i = 0; i < N; i++) t += tirarCalidad(nivelOficio, nivelReceta); return t / N; };
  check(media(0, 2) < media(2, 2) && media(2, 2) < media(4, 2), `la calidad mejora con el oficio (${media(0, 2).toFixed(2)} < ${media(2, 2).toFixed(2)} < ${media(4, 2).toFixed(2)})`);
  check(media(0, 0) >= 0.4 && media(0, 0) <= 1.6, `un novato en recetas básicas hace calidad normal (${media(0, 0).toFixed(2)})`);
  for (let i = 0; i < 2000; i++) { const q = tirarCalidad(Math.floor(Math.random() * 6) - 1, Math.floor(Math.random() * 4)); if (!(q >= 0 && q <= 3 && Number.isInteger(q))) { check(false, `calidad fuera de rango ${q}`); break; } }
  check(Object.keys(CALIDADES).length === 4 && CALIDADES[3].mult > CALIDADES[1].mult && CALIDADES[0].mult < CALIDADES[1].mult, 'tabla de calidades coherente');
  check(nivelDeXp(0) === 0 && nivelDeXp(NIVEL_XP[5]) === 5 && nivelDeXp(1e9) === 5, 'nivelDeXp en los extremos');
}

console.log(`\n${fallos === 0 ? '✔' : '✘'} ${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
