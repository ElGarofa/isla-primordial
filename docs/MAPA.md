# El mapa del mundo (etapa 5a/5b, 27-oct-2026)

Un continente de **12,3 × 12,3 km (151 km² en total, 95,6 km² de tierra)** con 12 provincias de tierra y 5 mares, cada uno con los ecosistemas de una época del catálogo, 10 biomas de tierra con sus propios recursos, un volcán y un mapa en pantalla (tecla **M**). El jugador aparece en la playa de la provincia de Hell Creek, en el sur.

> **Sobre «igual de grande que GTA 6».** Rockstar no ha publicado una superficie oficial. Las estimaciones de la comunidad que encontré van de ≈ 83 a ≈ 125 (ver fuentes al final; no sé si la cifra más alta es de tierra o total). Este mundo tiene 95,6 km² de tierra y 151 km² con el mar: está en ese orden de magnitud, pero **no puedo afirmar que sea «igual»** porque no hay una cifra de referencia fiable, y el tamaño no dice nada del contenido: aquí hay mucho terreno y poca cosa que hacer en él todavía (ver limitaciones).

Capturas en `docs/capturas/mundo/` (mapa M, costa aérea, continente desde el sur, los 8 biomas a pie de suelo y cuatro provincias).

## Provincias y mares

Cada provincia solo tiene fauna de sus ecosistemas del catálogo y **ningún animal salvaje cruza su frontera** (ver «Población»). Así, el Triásico, el Jurásico, el Cretácico y el Mioceno nunca se encuentran.

| Provincia (`id`) | Época | km² | Especies | Biomas principales (medidos) |
|---|---|---|---|---|
| Llanuras de Hell Creek (`hell_creek`, **inicio**) | Cretácico tardío (Maastrichtiense) | 13,8 | 11 | selva 49 %, pradera 19 %, bosque 19 %, pantano 8 % |
| Laramidia (`laramidia`) | Cretácico tardío (Campaniense) | 13,7 | 29 | bosque 45 %, pradera 24 %, montaña 17 % |
| Gobi y Nemegt (`gobi`) | Cretácico tardío (Asia) | 14,2 | 18 | pradera 49 %, desierto 19 %, montaña 13 % |
| Patagonia y Gondwana tardío (`patagonia_k`) | Cretácico tardío (Maastrichtiense) | 4,6 | 8 | pradera 44 %, bosque 25 %, montaña 13 % |
| Polo boreal (`boreal`) | Cretácico tardío (polar) | 9,3 | 2 | taiga 46 %, montaña 28 %, nieve 15 % |
| Gondwana cenomaniense (`gondwana_medio`) | Cretácico medio | 4,5 | 8 | selva 33 %, pradera 25 %, bosque 24 % |
| Cretácico temprano templado (`cret_templado`) | Cretácico temprano | 7,5 | 14 | bosque 61 %, pradera 14 %, montaña 13 % |
| Meseta del Cretácico temprano (`cret_calido`) | Cretácico temprano | 10,1 | 15 | pradera 48 %, montaña 21 %, desierto 14 % (sin costa) |
| Jurásico tardío (`jur_tardio`) | Jurásico tardío | 12,3 | 25 | pradera 34 %, bosque 23 %, montaña 14 %; aquí está el volcán Monte Brasa |
| Isla del Jurásico temprano (`jur_temprano`) | Jurásico temprano–medio | 1,4 | 9 | pradera 31 %, bosque 29 %, montaña 17 %, playa 17 % |
| Isla del Triásico (`triasico`) | Triásico tardío | 2,8 | 9 | desierto 52 %, pradera 21 %, playa 15 % |
| Humedal del Mioceno (`mioceno`) | Mioceno (Cenozoico) | 1,5 | 1 | selva 39 %, pantano 33 %, playa 25 % |

Mares (especies marinas y voladoras sobre el mar): Bahía Maastrichtiense (1), Mar Interior Occidental o Niobrara (5), Mar de Eromanga (1), Mar Oxfordiense (2) y Mar del Lias (4). La fauna marina sale de las 10 especies acuáticas del catálogo.

**Conectividad (medida, `tools/mundo-test.mjs`):** las 9 provincias del continente se recorren a pie desde el inicio (89,8 km² de tierra continua). Las 3 islas (Triásico, Jurásico temprano, Mioceno) están aisladas por mar: hay que nadar (el jugador nada y bucea) para llegar, y los animales salvajes no salen de ellas.

## Biomas y recursos

Los biomas salen de la altura, la distancia a la costa, la temperatura y la humedad de cada provincia, con ruido (no están pintados a mano). Reparto de la tierra: pradera 28,5 %, bosque 22,2 %, montaña 13,4 %, selva 10,8 %, playa 8,0 %, desierto 6,7 %, taiga 4,5 %, pantano 3,6 %, nieve 1,5 %, volcán 0,9 %.

| Bioma | Flora (según `genTrees`/`genUnder`) | Recursos propios |
|---|---|---|
| Playa | palmeras | hoja grande (de las palmas), vetas de sal |
| Pradera | árboles de copa suelta dispersos, hierba alta, bayas | roca y pedernal; algunas vetas de sal/arcilla en los bordes |
| Selva | árboles de 25–45 m muy densos, palmas, sotobosque de hojas grandes | liana, resina abundante, hoja grande |
| Bosque | mezcla de coníferas y árboles de hoja ancha más bajos | resina |
| Taiga | coníferas, árboles muertos | resina y **ámbar** (golpeando árboles, 7 %) |
| Pantano | árboles de ribera algo más bajos y oscuros, árboles muertos, lagunas (suelo por debajo del nivel del mar), suelo de barro | fibra, **vetas de arcilla** |
| Desierto | cactus, arbustos secos, algún árbol muerto, rocas rojizas | **cactus** (agua con un filo; rebrota), **vetas de sal**, pedernal |
| Montaña | coníferas de ladera hasta la línea de árboles (110–250 m), mucha roca | más pedernal |
| Nieve | sin árboles propios, rocas cubiertas de nieve | solo roca |
| Volcán | árboles muertos, roca oscura | **vetas de obsidiana** (para el nuevo cuchillo de obsidiana) |

Objetos nuevos: arcilla, obsidiana, sal, ámbar y `cuchillo_obsidiana` (receta propia). La tabla de recolección está en `RECOLECCION` de `src/core/items.js`; la colocación de vetas y cactus, en `src/flora/index.js` (`MINERAL`, `P_VETA`, `genUnder`). `docs/ITEMS_RECETAS.md` está regenerado.

**No hay todavía** cobre, hierro, carbón ni azufre (estaban en el plan 5b): solo los cuatro minerales de arriba.

## Cómo está hecho

- **Rejillas macro** (`src/world/generador.js`): 768 × 768 celdas de 16 m con altura, bioma, provincia, mar, distancia a la costa y a la frontera y humedad. Se generan en ≈ 1,7 s al arrancar y son **deterministas** (misma semilla → mismo mundo; probado con un hash). `getHeight` = interpolación bicúbica de la rejilla + relieve fino analítico (ondulaciones de 10–60 m y rugosidad de 3–10 m); es la única fuente de verdad que usan terreno, flora, fauna y físicas.
- **Terreno por teselas** (`src/world/terrain.js`): árbol cuaternario con raíces de 4096 m (3 × 3) que se divide hasta 64 m según la distancia 3D a la cámara; 48/40/32 segmentos por lado según el tamaño, faldones contra las grietas, tope de 320 nodos con malla (LRU), construcción repartida entre fotogramas y sombras solo en nodos de ≤ 128 m. Medido en 8 lugares distintos: 219–312 nodos con malla y 460–660 mil triángulos de terreno.
- **Niebla de horizonte** proporcional a `camera.far` (9000 m), para ver montañas a kilómetros sin que el borde del mundo se note.
- **Límite del mundo**: cuadrado de 12,3 km menos 260 m de margen; el jugador no lo traspasa (el mar abierto y la niebla lo ocultan).
- **Mapa M** (`src/ui/mapa.js`): relieve con sombreado, color por bioma, fronteras de provincia, nombres de provincias y mares, volcán, tu posición y orientación, fogatas; rueda para el zoom, arrastrar para moverse, doble clic para centrarse; muestra provincia, época, bioma y altura bajo el cursor. Dibuja **todo el mundo desde el principio** (sin niebla de exploración).

## Población (`src/fauna/poblacion.js`, `territorio.js`)

- Celdas deterministas de 360 m con **hasta tres grupos de tierra**, uno de aire y uno de mar. Se pueblan las celdas a menos de 1000 m del jugador y se despueblan a más de 1500 m; tope de 220 animales salvajes a la vez; las celdas se repueblan tras 20 min si el grupo fue exterminado.
- **Aparición sin verse** (corregido el 28-oct): un grupo puede nacer desde 110 m del jugador, pero entre 110 y 300 m solo si la cámara no mira hacia ese punto; si está a la vista, se aplaza y se reintenta a los 3 s. Antes nadie nacía a menos de 330 m y, como lo que estaba a más de 320 m quedaba congelado, alrededor del jugador había un anillo vacío al que ningún animal llegaba solo.
- Cada celda elige especies de **su provincia** según el hábitat (pesos por bioma deducidos del texto de región del catálogo), la pendiente que tolera cada especie y su tamaño; los carnívoros son más escasos; los voladores sobre tierra o mar; los marinos solo en agua profunda. Los puntos de una celda que cae en el borde del mundo y quedan fuera del área jugable se descartan (antes un nadador podía nacer ahí y el constructor lo reubicaba en otra agua, fuera de su mar).
- Cada criatura salvaje recibe un **territorio** (su provincia o su mar). Si su paso la sacara de él, se detiene y deja de perseguir (los animales propios y los que el jugador monta quedan exentos; un salvaje «habituado» que se guarda y se carga conserva su territorio).
- Alrededor del punto de aparición hay un entorno seguro (380 m sin carnívoros grandes, 60 m sin herbívoros) y un **rebaño de bienvenida**: al empezar una partida se coloca un grupo de herbívoros de la provincia a 100–180 m, tierra adentro, en el arco hacia el que mira el jugador (el inicio es una playa con mar abierto delante y la tierra más cercana solía tener su primer grupo a ~370 m).
- Las criaturas se simulan hasta **650 m** de la cámara (antes 320 m): de 320 a 650 m se actualizan cada 8 cuadros con el tiempo acumulado (≈ 0,3 ms de CPU por cuadro con 50 animales, medido en la prueba). Más allá quedan congeladas.
- Medido al arrancar (28-oct): 48–50 animales, el rebaño de bienvenida a 85–100 m, 11–13 visibles; caminando 1,2 km se pasa a menos de 120 m de 11 animales distintos y hay 15–27 visibles a la vez (antes: el más cercano a 369 m al empezar).
- `?eco=hell_creek|morrison|nemegt…` sigue filtrando por un único ecosistema (en ese modo cualquier especie vale en cualquier provincia: es para pruebas y capturas).

## Pruebas (`tools/mundo-test.mjs`, 15 escenarios, todo en orden)

Rejillas coherentes y tamaño; determinismo; superficie de cada provincia; conectividad (9 provincias a pie, 3 islas aisladas); reparto de biomas; fuentes de recolección de los 4 recursos nuevos; coherencia de épocas (ninguna especie fuera de la época de su provincia o mar, y ningún par de épocas lejanas comparte especies); terreno finito en 40 000 puntos y teletransporte a 8 lugares del mundo sin caerse y con nodos acotados; **terreno sin huecos** con la cámara volando a 80 m/s y en la órbita del menú (añadida el 28-oct: falla sin el arreglo del árbol de teselas y pasa con él); flora y recursos reales alrededor de un punto interior de cada bioma (cactus en el desierto, vetas de sal/arcilla/obsidiana donde toca); población por provincia y mar (solo especies de su territorio); frontera de tierra y de mar (el salvaje no cruza, el propio sí); 120 s de recorrido con población en streaming; mapa M abierto, con zoom y lecturas.

Las demás suites se adaptaron al mapa grande (buscaban terreno cerca del origen del mapa antiguo): `nado-test` (mar abierto a ≈ 500 m de la playa → cámara de prueba junto al animal), `especies-test` (solar llano y sin obstáculos), `glb-test` (laderas repartidas por el mapa y hundimiento medido contra el suelo bajo cada vértice). Resultado final (última ejecución de cada suite tras el último cambio de código): items 1545 ✔, craft 21/21, doma 21/21, ai 16/16, estático 10/10, especies 7/7, glb 14/14, nado 28/28, audio (54 recetas sin avisos), mundo 14/14, `vite build` ✔.

Rendimiento medido **solo en CPU** (Chromium con render por software, sin GPU): caminando a 30 m/s y corriendo a 90 m/s por varias provincias, el `update` de todos los módulos cuesta de media 1–3 ms por cuadro (p95 7–10 ms, picos puntuales de 50–100 ms al cruzar celdas muy deprisa).

## Limitaciones conocidas (sin adornos)

1. **Nada de esto se midió en una GPU real.** Los triángulos (≈ 0,5–0,7 M de terreno; hasta ≈ 3 M contando sombras y flora en las tomas más cargadas) y las 280–470 llamadas de dibujo por toma deberían ser asumibles, pero no lo he comprobado. `?quality=low` baja la carga.
2. **Poca fauna en algunos lugares porque el catálogo tiene pocas especies allí**: el Polo boreal solo tiene 2 especies (paquirrinosaurio y antarctopelta; subí su densidad para que no esté vacío), el Humedal del Mioceno 1, la Bahía Maastrichtiense (el mar del inicio) 1 y el Mar de Eromanga 1. Las provincias grandes tienen de 8 a 29.
3. **Las islas son pequeñas** (1,4–2,8 km²): se cruzan en minutos. El 94 % de la tierra es un solo continente.
4. **Épocas con matices**: `jur_temprano` incluye 4 especies de Shaximiao (Jurásico medio–tardío), y hay dos de frontera (*Mussaurus*, *Tianyulong*). Las anoto como «avisos» en la prueba; el catálogo no decide mejor.
5. **No hay ríos ni lagos grandes**: solo las lagunas del pantano. Tampoco hay ruinas, caminos, cuevas ni voladizos (el terreno es un campo de alturas).
6. **El mapa M no tiene niebla de exploración ni marcadores propios**; el mundo se ve entero desde el principio.
7. ~~Fuera de 320 m las criaturas quedaban congeladas~~ (ahora 650 m). **Teletransportes de más de 700 m** repueblan de golpe la zona (≈ 70 ms puntuales en CPU).
8. El árbol de teselas guarda en memoria los nodos ya visitados (objetos pequeños, tope teórico ≈ 49 000); la malla sí está acotada (320).
9. **Mis suites de animación dependen del solar**: sobre una ladera o con árboles en la trayectoria, los saurópodos grandes «patinan» en la medida porque el cuerpo choca con un obstáculo con las patas aún en marcha. La prueba elige ahora un solar llano y despejado; el comportamiento al chocar contra árboles sigue siendo visible.
10. Pentaceratops tiene el ancla de montura 20–26 cm por debajo del lomo según la inclinación del suelo (la tolerancia de la prueba es de 30 cm).
11. **`doma-test` y `ai-test` son intermitentes**: en mis ejecuciones repetidas, `doma-test` falló algún escenario en 1 de cada ~6 ejecuciones (p. ej. «niveles: alertado (2)…»; también en 1 de 6 sobre la copia anterior al mapa, con los mismos escenarios), y `ai-test` falló 1 escenario una vez de 5. Pasan al repetirlas; no he encontrado la causa (aleatoriedad en percepción/ocurrencias de la prueba).
12. Quedan sin hacer el resto del plan 5b (cobre, hierro, carbón, azufre), el minimapa y todo lo de las etapas 6–12, que quedaron en pausa por tu instrucción de entregar solo el mapa.

## Fuentes sobre el tamaño de GTA 6

- [GTABase: cuánto mide el mapa de GTA 6](https://www.gtabase.com/articles/gta-6/how-big-is-the-gta-6-map-size-compared-to-other-games): ≈ 125 según un proyecto comunitario y ≈ 83 según un mapa filtrado; ninguna cifra es oficial.
