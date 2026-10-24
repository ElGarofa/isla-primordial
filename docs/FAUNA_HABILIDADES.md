# Fauna: catálogo, sentidos, habilidades e IA (Etapa 1)

Todo vive en `src/fauna/`. No hay un segundo controlador: las especies nuevas usan el mismo `Creature`, esqueleto, IK y gestor que las antiguas.

## Archivos

| Archivo | Qué hace |
|---|---|
| `catalogo.js` | Base de datos de especies (162 filas: id, nombre, científico, grupo, período, región, dieta, tamaño, masa, confianza, ecosistema) + ficha detallada de las 10 implementadas (sentidos, energía, hambre, presas, miedos, habilidades y parámetros, aprovechamiento, domesticable/montura, confianza del dato, licencia). Ecosistemas coherentes: `isla_ficcion` (por defecto), `hell_creek`, `morrison`, `nemegt` (`?eco=`). |
| `sentidos.js` | Percepción real: vista con cono central + periférica (solo lo que se mueve), oclusión por terreno, vegetación (según bioma) y colliders; oído según ruido (la lluvia y el viento lo enmascaran); olfato según viento; rastro de huellas del jugador (vida 150 s, menos con lluvia). Nadie conoce la posición del jugador: cada criatura percibe con sus propios sentidos. |
| `habilidades.js` | Tabla `HAB` (datos + `puede()` + `usar()` + `tick()`). Cada criatura evalúa sus habilidades de forma autónoma cada ~0,2 s. |
| `cerebro.js` | Metabolismo (energía, hambre), percepción periódica (cada 0,28 s), sospecha acumulativa, reacción por rol y máquina de estados: `idle graze wander rest alert flee stalk chase charge search feed defend`. |
| `modelos.js` | Modelos procedurales de T. rex, Parasaurolophus, Stegosaurus, Ankylosaurus y Gallimimus (mismo contrato que `species.js`). |
| `color.js` / `skin.js` | Colorizador por vértice (con partes `cresta` y `placa`) y texturas de piel. |

## Especies implementadas (10)

Raptor, Compsognatus, Triceratops, Braquiosaurio, Pteranodon (existentes, migrados al sistema de habilidades) y **Tyrannosaurus, Parasaurolophus, Stegosaurus, Ankylosaurus, Gallimimus** (nuevas, con modelo propio, sonido propio y ficha completa).

La base de datos tiene 162 filas porque la primera versión pide un conjunto reducido y funcional; el resto de filas son datos (sin modelo) para ampliar. No se mezclan períodos ni regiones incompatibles dentro de un mismo ecosistema.

**Licencia de ficción (`isla_ficcion`)**: en la misma isla conviven animales de períodos y regiones distintos (p. ej. Tyrannosaurus del Cretácico tardío de Norteamérica con Stegosaurus del Jurásico). Es una decisión de juego, documentada en la ficha de cada especie (`licencia`). El raptor es una criatura de ficción (tamaño y plumaje no corresponden a *Velociraptor*). Los ecosistemas `hell_creek`, `morrison` y `nemegt` filtran la población para que solo convivan especies coherentes.

## Habilidades (tabla real, generada desde `HAB`)

Columnas: id · nombre · tipo · coste de energía (0–1) · enfriamiento (s) · radio (m) · condiciones · efectos · límites.

| id | nombre | tipo | energía | cd | radio | condiciones | efectos | límites |
|---|---|---|---|---|---|---|---|---|
| `escaneo_vigia` | Escaneo de vigía | contextual | 0.01 | 7 | 85 | En reposo, pastando o paseando, cada cierto tiempo levanta la cabeza y examina el entorno; no escanea si ya está alertado. | Percepción ampliada (×1.35 de alcance, umbral más bajo) en un barrido. Si detecta algo, emite la llamada de alerta. | Oclusión por terreno y vegetación, ruido de lluvia/viento, distancia, campo visual y falsos positivos (sombras o ruidos inofensivos). |
| `llamada_alerta` | Llamada de alerta | activa | 0.02 | 16 | 150 | Tiene una amenaza reciente con confianza suficiente que encaja con el filtro de la especie (jugador y/o depredador mayor). | Emite una llamada audible. Los receptores perciben la señal atenuada por distancia, oclusión y ruido ambiental, y reaccionan tras una latencia propia. | Enfriamiento largo; la señal no llega si el receptor está fuera de alcance auditivo; puede ser un falso positivo. |
| `huida_coordinada` | Huida coordinada | pasiva | 0 | 0 | 60 | Siempre activa; se aplica cuando la especie huye con manada. | Los individuos huyen en la misma dirección, atraídos por el centro del grupo, en lugar de dispersarse al azar. | Si pierde a la manada huye solo. |
| `embestida` | Embestida defensiva | contextual | 0.22 | 9 | 24 | Amenaza o agresor entre 4 y 24 m, alineado con la cabeza, con energía suficiente. | Carga a +25% de velocidad durante ~1.6 s; el impacto hace el daño de la embestida y lanza al objetivo. | Gira mal a alta velocidad y gasta mucha energía; si falla queda expuesto. |
| `formacion_defensiva` | Formación defensiva | contextual | 0.05 | 30 | 30 | Al menos otro individuo de la manada a ≤30 m y un depredador mayor perceptible entre 10 y 70 m. | La manada se coloca en círculo con los cuernos hacia fuera alrededor de su centro, hasta que la amenaza se aleja o ataca. | Se rompe si un miembro es atacado de cerca (entonces embiste); dura un tiempo limitado. |
| `postura_intimidacion` | Postura de intimidación | contextual | 0.04 | 18 | 24 | Amenaza percibida con confianza entre 5 m y el radio, sin haberla exhibido en los últimos 18 s. | Se detiene, adopta la postura (cabeza baja y gola al frente) y ruge. Las criaturas más débiles huyen; los demás reciben el aviso antes de la embestida. | No hace daño por sí misma; si la amenaza persiste, la criatura ataca. |
| `exhibicion_territorial` | Exhibición territorial | contextual | 0.03 | 35 | 55 | Percibe algo en su territorio con sospecha parcial (antes de decidir cazar) y no ha rugido en los últimos 35 s. | Ruge y se yergue como advertencia. Los depredadores menores y las presas huyen; el jugador recibe un aviso antes de ser perseguido. | Es una señal: no garantiza ataque ni retirada. |
| `cola_defensiva` | Golpe de cola | contextual | 0.1 | 3.2 | 5.5 | Amenaza dentro del radio y en el arco trasero (±43°); fuera de ese arco primero gira para colocar la cola hacia ella. | Barrido lateral de la cola armada (thagomizer / maza): daño al impacto, empuje y, si procede, aturdimiento. | Solo cubre el arco trasero; hay que girar antes; enfriamiento corto pero energía limitada. |
| `armadura_natural` | Armadura natural | pasiva | 0 | 0 | 0 | Siempre activa. | Reduce el daño de golpes frontales, laterales y dorsales; el flanco trasero y el vientre quedan más expuestos. | Sin protección contra ataques por detrás. |
| `movilidad_reducida` | Movilidad reducida por lesiones | pasiva | 0 | 0 | 0 | Siempre evaluada. | Por debajo del 50% de vida cojea (−30% de velocidad), por debajo del 25% (−50%). | No se recupera durante el combate. |
| `pisoteo` | Pisoteo | pasiva | 0 | 1.4 | 1.35 | Al moverse o alarmado: cualquier criatura pequeña o el jugador bajo una de sus patas. | Daño por aplastamiento y empuje a quien quede bajo un pie en movimiento; sacudida de cámara cercana. | Solo patas apoyadas y en movimiento; no persigue. |
| `rastreo_olor` | Rastreo por olor y huellas | contextual | 0.02 | 6 | 38 | Sospecha sin contacto visual (sospecha ≥0.25) y rastro fresco al alcance; el viento y la lluvia lo limitan. | Pasa a “búsqueda”: sigue el rastro de huellas del jugador, de la huella más cercana hacia la más reciente. Si el rastro es viejo o se pierde, se rinde. | Huellas >150 s (menos con lluvia) no sirven; necesita acercarse a ≤38 m del rastro; no sabe dónde estás ahora. |
| `acecho` | Acecho y aproximación | contextual | 0.01 | 4 | 70 | Objetivo (jugador o presa) detectado a más de 1.3× la distancia de emboscada, depredador con hambre suficiente o provocado. | Se acerca despacio y agachado (velocidad de paseo, cuello bajo); al llegar a la distancia de emboscada lanza el ataque. | Si el objetivo mira de frente y se acerca, la sospecha del objetivo no cambia pero la criatura abandona el acecho si pierde el contacto. |
| `emboscada` | Ataque de emboscada | contextual | 0.12 | 12 | 14 | En acecho, a la distancia de emboscada del objetivo. | Arranque a +20% durante 1.4 s y primer golpe con +40% de daño. | Gasta energía; si el objetivo se aleja demasiado la caza se abandona. |
| `abandonar_caza` | Abandono de la caza | contextual | 0 | 5 | 0 | Energía <18%, caza >22 s sin acortar distancia, vida baja, o presa demasiado lejos para el beneficio. | Deja de perseguir, descansa y no vuelve a cazar hasta pasados ~25 s. | Su umbral depende de la especie (resistencia de esprint). |
| `defensa_cadaver` | Defensa del cadáver | contextual | 0.05 | 12 | 20 | Está comiendo y algo (jugador o criatura) se acerca a menos de 20 m. | Ruge en postura de exhibición; si el intruso sigue a menos de 10 m, lo ataca. | Si está herido o cansado puede abandonar la presa. |
| `carroneo` | Detección de carroña | contextual | 0 | 5 | 60 | Con hambre (≥0.3), sin amenazas, olfatea un cadáver reciente al alcance de su olfato. | Se dirige al cadáver y se alimenta (reduce el hambre); un depredador mayor puede echarlo. | Solo cadáveres de menos de 70 s; el viento y la lluvia reducen el olor. |
| `esprint_zigzag` | Esprint en zigzag | pasiva | 0 | 0 | 0 | Al huir. | Durante la huida cambia de rumbo cada ~0.8 s (±26°), dificultando que el depredador la alcance. | Pierde algo de velocidad neta (-8%) a cambio de evasión. |

Cada habilidad también define `objetivos`, `anim`, `sonido`, `feedback` y `params` (ver `HAB`).

### Quién tiene qué (por familia, no se reparte todo a todos)

| Especie | Habilidades |
|---|---|
| Tyrannosaurus | rastreo_olor, acecho, exhibicion_territorial, defensa_cadaver, carroneo, abandonar_caza |
| Raptor | rastreo_olor, acecho, emboscada, carroneo, abandonar_caza, llamada_alerta |
| Compsognatus | llamada_alerta, carroneo, esprint_zigzag |
| Gallimimus | llamada_alerta, huida_coordinada, esprint_zigzag |
| Parasaurolophus | escaneo_vigia, llamada_alerta, huida_coordinada (no recibe habilidades de otras familias) |
| Stegosaurus | cola_defensiva, movilidad_reducida |
| Ankylosaurus | armadura_natural, cola_defensiva, movilidad_reducida |
| Triceratops | embestida, formacion_defensiva, postura_intimidacion |
| Braquiosaurio | pisoteo |
| Pteranodon | — (sin habilidades todavía) |

## Detección tipo "Parasaur" (sin copiar todas sus habilidades)

1. `escaneo_vigia`: cada ~9 s en reposo levanta la cabeza ~2 s y examina con alcance ×1,35. Umbral 0,28 y 6 % de falsos positivos (sombras/ruidos inofensivos).
2. Si percibe algo (vista con oclusión, oído con ruido, olfato con viento) emite `llamada_alerta` (audible, `llamada_<especie>`).
3. Cada receptor percibe la llamada atenuada por distancia, oclusión y clima, con latencia propia; reacciona (alerta o huida si la confianza es suficiente). Una alerta recibida **no se re-emite** (evita eco).
4. El jugador recibe la señal por HUD (`fauna:alerta`): marca en la brújula (rumbo), flecha relativa, distancia aproximada (con ruido) y confianza (●●●). Si el jugador es la amenaza siempre sabe quién lo detectó; si es otra amenaza, solo con un vigía vinculado (`vinculo ≥ 4`, es decir, bajo manejo o domesticado; un vigía solo habituado no avisa).
5. Cooldown de la llamada 16 s; un falso positivo también alerta (y se ve igual en el HUD).

## Qué se probó (`node tools/ai-test.mjs`, 16 escenarios, simulación sin render)

Parasaurolophus detecta al jugador a 45 m y la manada reacciona; control negativo a 150 m agachado (no detecta); oído de un jugador corriendo; Stegosaurus y Ankylosaurus giran la cola hacia el intruso y lo golpean; Triceratops forma defensa/intimida/embiste ante un T. rex; T. rex acecha, persigue, abandona por cansancio, muerde, pierde al jugador y rastrea sus huellas, carroñea un cadáver, y **no persigue a un jugador oculto a 140 m**; raptor acecha y embosca; Braquiosaurio es pasivo y solo pisotea bajo sus patas; Compsognatus huye. Repetido 3 veces: 16/16.

## Límites honestos

- La fiabilidad de la IA se midió con escenarios acotados, no con horas de juego libre.
- Los modelos son procedurales (tubos y blobs con IK), no escultura/anatomía de estudio.
- Aún sin hidratación (sed) de criaturas, sueño nocturno ni pteranodon pescando.
- Domesticación, equipo y monturas: Etapa 3 (`docs/DOMESTICACION.md`). Reproducción y crianza: no implementadas.
