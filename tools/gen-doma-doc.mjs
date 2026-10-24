// Genera docs/DOMESTICACION.md: la tabla por especie sale de los datos reales (fauna/catalogo.js); el texto describe las reglas de fauna/vinculo.js.
//   uso: node tools/gen-doma-doc.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../src/core/items.js';
import { DETALLE } from '../src/fauna/catalogo.js';
import { CONFIG } from '../src/core/config.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'DOMESTICACION.md');
const DIA = CONFIG.time.dayLengthSec;
const N = (id) => ITEMS[id]?.nombre ?? id;
const min = (s) => (s >= 90 ? `${(s / 60).toFixed(s % 60 ? 1 : 0).replace('.', ',')} min` : `${s} s`);
const filas = Object.entries(DETALLE).filter(([, v]) => v.doma).map(([id, v]) => {
  const d = v.doma, m = v.montura;
  const come = Object.entries(d.comida ?? {}).map(([k, f]) => `${N(k)} (${Math.round(f * 100)} %)`).join(', ') || '—';
  const manejo = d.max >= 4 && d.manejo ? `${N(d.manejo.equipo)}${d.manejo.nivel ? ` · manejo ${d.manejo.nivel}` : ''}` : '—';
  const cuidado = d.max >= 5 && d.cuidado ? `${d.cuidado.dias} días (${d.cuidado.biomas.join(', ')})` : '—';
  const monta = m && m.jinete ? `sillas ${m.tipos.join('/')}${m.arnes ? ' + arnés' : ''}${m.carga ? ` · carga ${m.carga.items.map(N).join('/')} ×${m.carga.mul}` : ''}${m.proteccion ? ' · protección' : ''}` : m ? 'solo carga' : '—';
  return `| ${id} | ${d.max} | ${min(d.hab.seg)}${d.hab.dMin ? ` (≥ ${d.hab.dMin} m)` : ''} | ${d.ofrendas} | ${come} | ${manejo} | ${cuidado} | ${monta} |`;
});

const md = `# Domesticación, equipo y monturas (Etapa 3)

> Capturas en \`docs/capturas/etapa3/\`. La tabla por especie la genera \`node tools/gen-doma-doc.mjs\` desde \`src/fauna/catalogo.js\`. Las reglas viven en \`src/fauna/vinculo.js\`, la montura en \`src/player/montura.js\`, el panel en \`src/ui/animal.js\`.
> Pruebas: \`node tools/doma-test.mjs\` (simulación en navegador, 21 escenarios) y los apartados de domesticación de \`tools/items-test.mjs\`.

## Los seis niveles

| Nivel | Nombre | Qué significa en el juego |
|---|---|---|
| 1 | Salvaje | No se ha hecho nada. Te trata como a cualquier intruso. |
| 2 | Alertado | Derivado: te ha detectado y está en alerta o huyendo. Se disipa solo. |
| 3 | Habituado | Toleró tu presencia tranquila el tiempo que pide su especie. **Habituación no es domesticación**: sigue siendo salvaje. |
| 4 | Bajo manejo | Confía en ti (ofrendas de su comida) y acepta cabestro o collar. Puede seguirte o quedarse. |
| 5 | Domesticado | Cuidado correcto durante varios **días de juego** (1 día = ${DIA} s). Ya no te teme. |
| 6 | Equipado | Domesticado y con silla, bolsas o coraza, **solo si su anatomía lo permite**. |

Cada especie declara hasta qué nivel puede llegar (\`doma.max\`). Los grandes depredadores no pasan del 3. Un animal con \`max 0\` (pteranodon) no admite trato.

## Cómo se avanza (todo pasa por la IA real)

**1 → 3 · Habituación.** La habituación (0–1) sube mientras se cumplan *todas* estas condiciones, evaluadas cada 0,28 s con los sentidos reales de la criatura:
la criatura está en un estado tranquilo; te percibe (confianza de percepción > 0,05); no ha tenido una amenaza reciente ni está provocada; tú estás quieto o andando despacio (no corres, no haces ruido, no nadas, no vas montado); no está hambriento (su hambre está por debajo del umbral en que empezaría a buscar comida o presa); y estás **más lejos** de la distancia mínima de su especie (grandes depredadores: 18–32 m). Avanza \`1 / segundos\` por segundo de calma (ver tabla). Si no te ve durante más de 90 s, la olvida despacio. Si huye de ti por algo que *tú* hiciste (correr, hacer ruido, acercarte rápido) pierde 0,25; correr o hacer ruido cerca además hace que un animal ya habituado vuelva a temerte (su distancia de huida pasa del 5 % al 60 % de la normal). Si el animal pasea hasta pegarse a un jugador quieto y se sobresalta, **no** se penaliza. Mientras se habitúa, su distancia de huida se encoge (curva en raíz cuadrada con una zona muerta del 3 % inicial); al llegar a 1 pasa al nivel 3.

**Depredadores habituados.** Un tiranosaurio o raptor habituado deja de verte como presa o intruso, pero **sigue siendo un depredador**: si tiene hambre (por encima de su umbral de caza) o lo provocas, te caza igual. Saciado no te sigue el rastro ni te acecha. No existe forma de que llegue a nivel 4: no admite cabestro.

**3 → 4 · Confianza y manejo.** Con el animal habituado, pulsa **E** para ofrecerle su comida (mira la ficha: "Come"). El alimento incorrecto lo rechaza y resta confianza; el correcto la sube \`1 / ofrendas\`, baja su hambre y tiene 20 s de enfriamiento; si no tiene hambre, no come. Con la confianza completa, **E** pasa a *Colocar cabestro* (o collar en el compsognatus). Hace falta el cabestro/collar en la mochila, estar a menos de 6 m y el nivel de **Manejo de animales** que pide la especie (estegosaurio y triceratops: 1; anquilosaurio: 2). Manejo se gana tratando con animales (ofrendas, domar, cabalgar), no fabricando. Bajo manejo el animal acepta tres órdenes: **Seguir** (te acompaña con una correa suelta), **Quedarse** (queda atado a su sitio) y **Libre**.

**4 → 5 · Domesticación.** El tiempo de cuidado solo corre mientras el animal: tiene hambre baja (< 75 %), vida > 50 %, está tranquilo (o montado), estrés < 60 %, está en un bioma que su especie tolera, estás a menos de 150 m, y no hay tormenta sin fogata a 12 m (la tormenta además lo estresa). Se necesitan \`doma.cuidado.dias\` días de juego (tabla). Al terminar se domestica y ganas experiencia de manejo. El cuidado **solo cuenta mientras el animal está dentro del radio de simulación del juego** (320 m); si te alejas más, queda congelado y no avanza ni progresa.

**5 → 6 · Equipo.** En el panel del animal (E sobre un animal propio) se equipa lo que su anatomía admite: arnés/silla (lomo), alforjas o bolsa (carga) y protección. Las bolsas necesitan arnés o silla debajo; la carga solo admite lo que la ficha de la especie permite y respeta **peso y volumen reales** (multiplicados por el factor de la especie). La protección reduce un 28 % el daño que recibe el animal y gasta durabilidad. Al llevar equipo de silla, carga o protección se alcanza el nivel 6.

## Consecuencias

- **Maltrato.** Golpear a un animal propio (o a uno habituado) baja la habituación 0,6 y, si es propio, la confianza 0,6 y sube su estrés. Con la confianza por debajo de 0,5 pierde un nivel: domesticado → bajo manejo → deja de estar bajo manejo, y entonces **suelta el cabestro y todo el equipo y la carga al suelo**.
- **Abandono.** Con hambre extrema durante más de 150 s la confianza se erosiona; al cruzar 0,5 pierde un nivel igual que arriba.
- **Muerte.** La carga cae al suelo; si llevabas montado al animal, caes y te haces 6 de daño.
- **Liberar.** Devuelve el equipo a la mochila (si no cabe, cae al suelo) y deja la carga en el suelo; el animal vuelve a ser salvaje con la mitad de su habituación como máximo.
- **Alimento.** Un animal bajo tu cuidado sigue necesitando comer: pasta o come por su cuenta en el mundo, y puedes ofrecerle su comida desde el panel. Si pasa hambre, el cuidado deja de contar y, con hambre extrema prolongada, pierde la confianza. Seguirte consume su energía.

## Monturas

Solo las especies con \`montura.jinete\` en los datos: **gallimimus** (silla ligera, bolsa pequeña), **parasaurolophus** (silla de transporte, alforjas o bolsa) y **triceratops** (silla de transporte o reforzada, alforjas, protección). El resto no tiene espalda, tamaño o marcha para cargar a una persona (estegosaurio, anquilosaurio, braquiosaurio, depredadores, pteranodon). La silla debe ser del tipo que admite su especie; el arnés solo no basta.

| Control | Acción |
|---|---|
| **G** (cerca del animal propio y equipado) | Montar / desmontar |
| **W** | Trote |
| **Mayús** | Galope (gasta energía del animal; sin energía no galopa) |
| **S** | Frenar |
| **A / D** | Desviar a los lados (±0,9 rad respecto de la mirada) |
| Ratón | Dirige: el animal gira hacia donde miras sin poder girar en seco |

El jugador va anclado a un punto de silla de la especie y la cámara va a esa altura. El animal sigue siendo la misma criatura: usa su marcha, su energía y su límite de terreno (**no entra al agua ni sube pendientes imposibles**; se verificó en una orilla real). No se puede montar en el agua, con el animal asustado, con hambre extrema (≥ 95 %) o malherido (< 25 % de vida). Mientras estás montado, el animal no puede ser apuntado por tus golpes. Si muere, caes (6 de daño). Cabalgar da experiencia de manejo.

## Panel del animal

Se abre con **E** sobre un animal propio. Muestra nombre editable, el nivel entre los seis, vida, hambre, confianza, progreso de cuidado en días, estrés, órdenes, ofrecer comida, montar, liberar, las cuatro ranuras de equipo (con por qué no se puede equipar lo que no se puede) y la carga con peso y volumen. Se cierra solo si el animal muere o te alejas más de 14 m. La línea de objetivo del HUD muestra nivel, habituación y confianza y la acción de **E** y **G**.

## Por especie (generado de los datos)

"Habituación" = tiempo de presencia tranquila necesario; "Ofrendas" = comidas correctas para la confianza completa.

| Especie | Nivel máx. | Habituación | Ofrendas | Come (baja el hambre) | Manejo | Cuidado | Montura / carga |
|---|---|---|---|---|---|---|---|
${filas.join('\n')}

## Guardado

Se guardan los animales propios y los habituados (especie, posición, vida, hambre, relación completa, equipo y carga). Los animales salvajes cualesquiera **no** se guardan: reaparecen según el ecosistema. Las partidas anteriores (sin fauna) cargan sin problema.

## Qué no está hecho (a propósito, y por qué)

- **Reproducción y crianza.** La especificación la pedía solo "si se implementa". No se implementó: hacerlo bien exige compatibilidad, edad, huevos/incubación, crecimiento, mortalidad y herencia sin porcentajes inventados, y eso es otra etapa entera. Mejor ausente que falsa.
- **Arnés de tiro y carros**, **monturas voladoras o acuáticas**, **montar sin silla**: no existen.
- **Animación del jinete.** Vas en primera persona: no hay modelo de jinete ni animaciones de montar y desmontar.
- **Comportamientos de granja** (sed, sueño, corrales, producción de recursos): fuera de alcance.
- **Cuidado fuera del radio de simulación** (> 320 m): el animal se congela y no progresa.
- No se midió con jugadores humanos: los tiempos de habituación y cuidado salen de las pruebas simuladas, no del ritmo de juego real.

## Capturas (Chromium headless con render por software)

\`docs/capturas/etapa3/\`: \`hud-habituado.png\` (línea de objetivo: nivel 3, habituación, confianza y acción de E), \`hud-propio.png\` (animal propio: E atender, G montar), \`panel-animal.png\`, \`inv-aparejos.png\` y \`inv-detalle.png\` (equipo animal en la mochila), \`montado.png\` y \`montado-trote.png\` (vista del jinete y aviso de controles).
`;
fs.writeFileSync(out, md);
console.log('escrito', out, md.length, 'bytes');
