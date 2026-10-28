# Modelos 3D de la fauna (GLB) — prueba de calidad con el Parasaurolophus

Estado: **una sola especie con animación de autor (Parasaurolophus)**, más el Carnotaurus generado y acoplado al esqueleto procedural (§11). Las demás siguen con su malla procedural hasta que la revises. Con `?glb=0` en la URL el juego vuelve a usar la malla procedural también para el Parasaurolophus.

> Honestidad por delante: el modelo es un **low-poly estilizado** (1 414 triángulos originales, 5 856 tras suavizarlo al cargar). Es bastante mejor que los volúmenes procedurales anteriores (silueta, proporciones y animación de autor), pero **no es calidad ARK** y no lo vendo como tal. Lo que sí hice es sacarle el aspecto plástico (colores por zona, escamas con relieve, sombreado suave, ojos) y dejarlo barato de dibujar.

## 1. Auditoría previa (qué había y qué se tocó)

Antes de modificar nada revisé el módulo `src/fauna/`:

| Archivo | Rol antes de este cambio | ¿Se modificó? |
|---|---|---|
| `species.js` | Ficha por especie: paleta `pal`, esferas de impacto `hit`, velocidades `vel`, ciclo de marcha `cycle`, radio, ancla de montura, `build()` (malla procedural) | **Sí**: el Parasaurolophus añade un descriptor `glb` (el resto de campos, y `build()`, siguen intactos) |
| `creature.js` | Clase `Creature`: estado, IA, movimiento, marcha con IK (`applyGait`), movimiento secundario (`applySecondary`), muerte, despiece | **Sí**: rama GLB en el constructor, `estadosAnim`, `applyGLB`, `updateDeadGLB`, `dispose`. La lógica existente (IA, movimiento, colisiones, habilidades, domesticación) **no se tocó**; solo se decide qué «visual» anima |
| `index.js` | Gestor de fauna: spawn, respawn, LOD por distancia, `pick`, despiece | **Sí** (mínimo): carga los visuales GLB al iniciar y los expone en `api.modelos` / `mgr.getVisual` |
| `builder.js`, `color.js`, `skin.js` | Malla procedural, colores por vértice y textura de escamas | No (se reutilizan: `skin.js` da la piel; `color.js` la paleta) |
| `cerebro.js`, `habilidades.js`, `vinculo.js`, `sentidos.js` | IA, habilidades, domesticación, percepción | **No** |
| `catalogo.js` | 162 fichas de especies | **Sí, una línea**: el ancla de montura del Parasaurolophus pasó de `[0, 3.25, 0.25]` a `[0, 3.25, -0.3]` (más atrás, sobre la mitad del lomo; con el cuello largo del modelo nuevo quedaba delante de la cámara) |
| `shots.js` | Presets de captura | **Sí**: presets `fauna_parasaurolophus_*` (incluye `_jinete`, nuevo) |
| `flora/geometry.js` | — | **Sí**, una línea sin relación con los modelos: se evita un aviso de consola (`toNonIndexed` sobre geometría que ya viene sin índice) |

Archivos **nuevos**: `src/fauna/modelo3d.js` (carga, preparación y animación del GLB), `src/fauna/malla.js` (soldar, subdividir, normales, UV, elipsoides), `public/models/fauna/parasaurolophus.glb`, `public/models/fauna/LICENCIAS.md`, `tools/glb-test.mjs`, este documento.

El objeto `Creature` y todas sus interfaces (`position`, `yaw`, `speed`, `state`, `hit`, `jinete`, `rel`, `die()`, `update()`…) son los mismos: la IA, el movimiento, las colisiones, las habilidades y la domesticación no saben qué malla hay debajo.

## 2. Modelo, fuente y licencia

- **Modelo**: Parasaurolophus del «Animated Dinosaur Pack» de **Quaternius** (diciembre de 2018). **Licencia CC0 1.0** (dominio público).
- Archivo: `public/models/fauna/parasaurolophus.glb`, original sin modificar (371 KB, 37 huesos, 6 animaciones).
- Obtenido de una copia en GitHub (`nicolasezquerro-coder/saltamundos`, cuyo `LEEME.txt` declara «Quaternius CC0»), porque la página del autor no es accesible desde mi entorno. La misma licencia figura en `spence-com-au/dino-park/CREDITS.md`. **Verificala en la página oficial del pack antes de publicar** (ver `public/models/fauna/LICENCIAS.md`).
- Ningún recurso de ARK ni de ningún juego comercial.

## 3. Cómo se prepara el modelo al cargar (`modelo3d.js` + `malla.js`)

1. `GLTFLoader` (+ `MeshoptDecoder`) lee el GLB.
2. Se unen las mallas, se sueldan vértices y se **subdivide una vez** (Loop con suavidad 0,6): de 1 414 a 5 856 triángulos.
3. Normales suaves **respetando los pliegues** (ángulo de 55°) → se acaba el aspecto facetado/plástico.
4. **Color por zona** con la paleta de la especie (`Green`→cuerpo, `LightYellow`→vientre, `LightGreen`→garras, `Red`→cresta); la textura de escamas con normal map sale de `skin.js` (proyección en caja, 0,5 m por baldosa).
5. **Ojos**: el modelo original no los trae; se añaden dos elipsoides atados al hueso `Head`.
6. Una única malla `SkinnedMesh` por criatura, con **geometría y materiales compartidos** por especie (4 materiales con tono distinto, repartidos al azar); lo único propio de cada ejemplar es su jerarquía de huesos y su `AnimationMixer`.
7. Si el GLB no carga (red, archivo ausente) o se usa `?glb=0`, la especie usa su malla procedural y el juego sigue (probado).

## 4. Animaciones: lo que existe de verdad y lo que no

| Acción pedida | ¿Hay clip del modelo? | Cómo se resuelve |
|---|---|---|
| Reposo | **Sí** (`Idle`) | Clip original |
| Caminar | **Sí** (`Walk`) | Clip original; el reloj del clip sigue la **distancia recorrida** (ver §5) |
| Correr | **Sí** (`Run`) | Ídem |
| Atacar / morder | **Sí** (`Attack`) | Clip original; su avance sigue el mordisco de la IA (`biteT`) |
| Morir | **Sí** (`Death`) | Clip original, una sola vez y se queda en el suelo |
| Saltar | Sí (`Jump`) | Está en el modelo pero **no se usa** (la IA del Parasaurolophus no salta) |
| Girar | No | Si gira casi parado, reproduce `Walk` a ritmo bajo |
| Comer / pastar | **No hay clip** | **Capa por código**: rotaciones aditivas sobre `Neck` y `Head` que bajan la cabeza según el estado de la IA (`grazeK`) |
| Llamar / alertarse / mirar | **No hay clip** | Capas por código (cabeza arriba, giro de cabeza hacia lo que mira la IA) |
| Reacción a golpe | **No hay clip** | Capa por código (retroceso del torso y cabeza) |
| Dormir / descansar | **No hay clip** | Usa `Idle`; no hay pose tumbada |
| Habilidades de especie | — | Las dispara la IA existente; este modelo no aporta clips propios para ellas |

Es decir: 5 clips reales en uso; pastar, llamar, mirar y reaccionar son **capas procedurales sobre los huesos del cuello** (calculadas en la pose de reposo del modelo, aditivas, ponderadas por el estado de la IA). No son animaciones de autor y lo señalo para no engañar.

## 5. Marcha: pies sin resbalar (reloj de zancada)

El clip original barre el pie de apoyo hacia atrás a velocidad **variable** (arranca en 0, sube y vuelve a 0). Reproducido a ritmo constante, el pie resbala sobre el suelo. Solución (`perfilZancada` en `modelo3d.js`, «stride warping»):

- Al cargar se mide, en 64 instantes de `Walk` y de `Run`, la velocidad hacia atrás del pie apoyado y se construye una tabla que reparte el reloj del clip según la **distancia recorrida**: el reloj corre despacio cuando el pie barre rápido y deprisa en el despegue y el aterrizaje (con un tope de ~3× para que no se vea a trompicones). Las fases de vuelo de la carrera usan la velocidad media.
- En ejecución cada criatura acumula los metros que recorre; `Walk` y `Run` se evalúan en el instante que corresponde a esa distancia.
- **No hay IK por pata**: es una corrección de tiempos, no un anclaje real del pie al suelo.

Medido (`tools/glb-test.mjs`, 3 zancadas completas por velocidad, velocidad del pie apoyado ÷ velocidad del cuerpo):

| | Antes (ritmo constante calibrado) | Ahora (reloj por distancia) |
|---|---|---|
| Caminar, mediana | 0,35 – 0,64 (según la fase medida) | **0,02 – 0,10** (según la ejecución) |
| Correr, mediana | 0,32 – 0,44 | **0,02 – 0,10** (según la ejecución) |
| Media (incluye despegue/aterrizaje) | — | 0,18 – 0,53 |

Quiere decir que durante casi todo el apoyo el pie está quieto respecto al suelo, pero al despegar y aterrizar sí se desliza un instante (hasta ~0,5 de la velocidad del cuerpo en promedio de ese tramo). A velocidades muy bajas o muy altas el ritmo del clip se acota y ahí el pie sí resbala más.

## 6. Cajas de impacto y montura

- `sp.hit` (esferas de impacto) se calcula **a partir de la malla en movimiento**: los vértices se agrupan por hueso dominante (cuerpo ×2, cuello, cabeza, cola ×2, 4 patas) y cada grupo recibe una esfera (centro = media de 23 poses de reposo/caminar/correr, radio = percentil 92 + 0,1 m). Medido: **99 % de los vértices dentro**, ninguna esfera vacía. La ficha procedural anterior se conserva como respaldo (`sp.hitProcedural`).
- Ancla de montura `[0, 3,25, −0,3]`: queda entre 0,3 y 0,4 m sobre el lomo (lomo medido 2,85–2,98 m). El jinete va en primera persona, sin cuerpo ni silla visibles (limitación ya conocida del juego, no de este cambio).

## 7. Pruebas ejecutadas (resultados reales)

`node tools/glb-test.mjs` — **14/14**: carga del GLB (37 huesos, 6 clips), geometría compartida / esqueleto propio / una malla por criatura, clips según la velocidad real, pies sin resbalar (caminar y correr), capas (cabeza baja 1,2–1,3 m al pastar; sube 0,7–1,0 m al llamar; gira 0,76 m al mirar), muerte (clip de 1,33 s, cadáver despiezable), cajas de impacto (cobertura 0,99), asentamiento en pendientes, IA intacta con el rebaño, rendimiento, liberación de recursos, 60 s de simulación sin NaN, respaldo con `?glb=0` y respaldo con GLB ausente.

Rendimiento medido con render por software (no GPU real): **0,034–0,044 ms de CPU por criatura y cuadro** (24 criaturas animadas, 140 544 triángulos en pantalla). No se midió en una GPU real.

Resto de suites tras el cambio: IA 16/16, crafteo 21/21, objetos 1461 comprobaciones / 0 fallos, audio (43 recetas, 0 avisos), recorrido de juego (caminar, correr, saltar, chocar, nadar) sin errores, build de producción OK (el GLB se empaqueta y carga desde `dist`). Domesticación (`doma-test`) **21/21 en 5 de 6 pasadas**; una pasada dio 19/21 (dos escenarios con gallimimus procedural y un jugador corriendo; los dos pasan solos y en las 5 pasadas siguientes). No encontré la causa: sospecho carga de CPU al coincidir con otro proceso, pero no lo comprobé.

## 8. Cómo probarlo en el navegador

```bash
npm install
npm run dev                # http://localhost:5173/?debug=1
```
Los Parasaurolophus aparecen en rebaños repartidos por el mapa. Para verlo sin buscarlo:

- En la consola del navegador (con `?debug=1`): `__game.ctx.fauna.spawnAt('parasaurolophus', x, z)` cerca del jugador.
- Capturas: `node tools/shot.mjs --preset fauna_parasaurolophus_lado,fauna_parasaurolophus_correr,fauna_parasaurolophus_pasta,fauna_parasaurolophus_cabeza,fauna_parasaurolophus_manada,fauna_parasaurolophus_jinete,fauna_parasaurolophus_muerto` (guarda PNG en `shots/`; las que ya generé están en `docs/capturas/`).
- Comparar con el modelo anterior: añadir `?glb=0`.
- Pruebas: `node tools/glb-test.mjs [regex]`.

## 9. Limitaciones conocidas

- Estilizado low-poly; la piel es una textura de escamas procedural sobre colores por zona, no pintura de autor.
- El modelo original no tiene boca articulada ni expresión facial; solo abre la boca con el clip `Attack`.
- La pose de reposo mantiene los brazos algo levantados (así viene en el clip).
- Sin IK de pies ni adaptación a pendientes pata por pata (el cuerpo se inclina con el terreno; los pies siguen el clip).
- Sin clip de dormir, de comer ni de girar; ver §4.
- El jinete no tiene modelo ni la silla se ve (el equipo animal existe como datos, no como malla).

## 10. Qué viene (solo cuando lo apruebes)

El mismo pack de Quaternius (CC0) trae además Triceratops, Tyrannosaurus (T-Rex), Stegosaurus, Velociraptor y Apatosaurus. Con el mismo descriptor `glb` y el mismo procesado se pueden migrar **Triceratops, Tyrannosaurus, Stegosaurus y raptor** (el velociraptor del pack es el más parecido a nuestro «raptor» de ficción; confirmaré el parecido antes de usarlo).

**No hay modelo en el pack para**: Ankylosaurus, Compsognatus, Gallimimus, Pteranodon ni Braquiosaurio (el Apatosaurus no es la misma especie). Para esas hace falta otra fuente; opciones:

1. Que me pases GLB con licencia compatible (compra en Sketchfab/Fab/CGTrader, encargo o modelos CC0/CC-BY) y los integro con el mismo descriptor.
2. Buscar más packs CC0 (no encontré ninguno completo con esas especies; no lo afirmo sin verlo).
3. Dejarlas con su malla procedural actual (que no pretende ser realista).

Cómo añadir un GLB nuevo: copiarlo a `public/models/fauna/`, añadir a la ficha de la especie un bloque `glb: { url, escala, zonas, ojos, hit, huesos }` como el del Parasaurolophus (en `species.js`) y registrar la fuente en `LICENCIAS.md`. Los nombres de los clips deben contener `Idle`, `Walk` (y, si existen, `Run`, `Attack`, `Death`). `node tools/glb-test.mjs` valida la integración (hay que parametrizarlo para la especie nueva).


## 11. Modelos estáticos generados (Higgsfield) acoplados al esqueleto procedural

*Añadido el 27/10/2026. Primera especie: Carnotaurus.*

### Qué es y por qué existe
Pediste que usara el complemento de Higgsfield para mejorar los modelos de los dinosaurios. Lo que entrega es una **malla estática**: sin huesos y sin animaciones. Para que el modelo ande dentro del juego, la malla se usa como **piel** de un esqueleto que el juego ya sabe mover (el de las familias procedurales: patas con IK, cola, cuello, mandíbula). La IA, el movimiento, las habilidades y la doma **no cambian**: siguen hablando con `Creature`.

### Qué se hizo (y qué cuesta)
| Paso | Dónde | Detalle |
|---|---|---|
| Generar | Higgsfield, `tripo_3d` texto→3D | 5 créditos (cuenta *free*, 10 créditos de partida; quedan 5). Un primer intento dio un falso «nsfw» (reembolsado) y se repitió con un texto más simple. |
| Reducir | `tools/preparar-glb.mjs` | 1,45 M triángulos + textura → 5 998 triángulos con **color de vértice** (30 KB, comprimido con meshopt). Se orienta (cabeza +z, pies y = 0, largo = 1). Necesita `@gltf-transform/*`, `meshoptimizer` y `sharp` (no están en `package.json`). |
| Esqueleto | `public/models/fauna/generados/carnotaurus.rig.json` | Articulaciones colocadas **a mano** sobre cortes de la malla y comprobadas sobre una imagen de control (`tools/visor-shot.mjs --rig`). No hay un ajuste automático fiable. |
| Piel | `src/fauna/estatico.js` | Pesos por distancia a cada hueso, en dos sistemas (cuerpo / pata) mezclados con continuidad; mandíbula separada por la línea de la boca del modelo. |
| Integración | `src/fauna/estaticos.js` + `familias/index.js` | La especie declara `estatico`; si no carga (archivo ausente, `?glb=0`), usa su malla procedural. |

### Lo que se ve (comparado con la malla procedural de tubos)
Silueta, cabeza con cuernos, musculatura y color propios; a eso se suma la textura de escamas del juego. Es una mejora clara de aspecto. **No es calidad ARK**: son 6 000 triángulos, el color sale de una textura muestreada por vértice (borroso a corta distancia) y no tiene ojos, dientes ni interior de boca.

### Lo que NO tiene (límites reales)
- **Sin animaciones de autor.** Camina y corre con la IK procedural de siempre; no hay clip de ataque, pastar ni morir propio (los de la familia procedural siguen funcionando).
- **Boca:** el modelo trae la boca cerrada con una ranura; al abrir la mandíbula se estiran las aristas entre labios. Se limita la apertura (`mandibula.apertura` = 0,42 del giro normal) y el borde se oscurece como interior; sigue siendo una aproximación.
- **Brazos:** conservan su pose; solo se balancean un poco.
- **Deformación:** hay aristas largas que se estiran junto a la cadera, el tobillo y la cola al correr (0,15 % de las aristas muestreadas pasan ×2,2 y 15 cm; peor caso ×3,4). A simple vista es aceptable a distancia de juego; de cerca se nota en el tobillo.
- **Licencia sin verificar** (ver `LICENCIAS.md`).

### Pruebas (`node tools/estatico-test.mjs`, 10/10)
Carga y medidas adoptadas · pesos válidos y todos los huesos con piel · pose de enlace sin deformación (desvío 0) · mandíbula (678 vértices, solo hocico) · marcha (apoyo 50/50, sin hundirse, estiramiento p99 ×1,36) · carrera (apoyo 28/50, p99 ×1,59) · geometría compartida · IA (persigue y muere) · respaldo con `?glb=0` · respaldo con archivo ausente. Resto de suites sin cambios: GLB 14/14, IA 16/16, crafteo 21/21, domesticación 21/21, objetos 1461/0, audio 43/0, build OK.

### Economía (para decidir cómo seguir)
- Cada especie nueva cuesta **~5 créditos** (texto→3D) más mi tiempo de reducir, colocar el esqueleto y revisar. Quedan **5 créditos** (1 modelo).
- Las ~87 especies pendientes serían ~435 créditos solo en generación. Con la cuenta *free* no alcanza; hace falta un plan de pago (la prueba de 3 días de Plus pide tarjeta y pasa a 49 USD/mes; **no la activé**). Es decisión tuya.
- Solo sirve tal cual para **bípedos de pose parecida** (la plantilla de esqueleto es la de los bípedos). Cuadrúpedos, voladores y marinos necesitan otra plantilla de esqueleto que aún no existe.
- Alternativa gratuita: bajá GLB con licencia clara (o generá los tuyos) y dejalos en `public/models/fauna/generados/` con su `.rig.json`; el resto se integra igual.

### Cómo añadir otra especie bípeda
1. Generar/obtener el GLB, reducirlo con `tools/preparar-glb.mjs in.glb out.glb 6000 auto` (`FLAGS=Permissive,Prune`).
2. Copiarlo a `public/models/fauna/generados/<id>.glb`, copiar `carnotaurus.rig.json` como `<id>.rig.json` y ajustar las articulaciones mirando `tools/visor-shot.mjs --url /models/fauna/generados/<id>.glb --rig /models/fauna/generados/<id>.rig.json`.
3. Registrar en `src/fauna/estaticos.js` y anotar la fuente en `LICENCIAS.md`.
4. `tools/lock.sh node tools/estatico-test.mjs` (hay que parametrizarlo para la especie nueva).

## 12. Pieles generadas en lote: auto-rig v2 (32 especies)

*Añadido el 28/10/2026. Sustituye el procedimiento manual del §11 para los modelos que llegaron en los zips de Higgsfield.*

### Qué cambia respecto del §11
- **Sin colocar articulaciones a mano.** `tools/autorig.mjs` toma cada GLB texturizado y le encaja el **esqueleto procedural de su propia especie** (mismos nombres, jerarquía y patas que su malla de siempre), así que la IA, la marcha por IK y todas las capas de animación funcionan sin cambios. Sirve para bípedos, cuadrúpedos, nadadores y voladores.
- **Textura real**, no color de vértice: la malla se simplifica a 14 000 triángulos respetando las costuras de UV y conserva su textura (WebP). El color se normaliza por especie (`albedoMedio` del `.rig.json`).
- **Pesos de piel precalculados** y guardados en el GLB (`JOINTS_0`/`WEIGHTS_0`); el juego los lee tal cual (`?pesos=calcular` los recalcula en el navegador para comparar).

### Cómo encaja el esqueleto (resumen)
1. **Orientación:** eje principal en planta (o PCA 3D con simetría en los pterosaurios), cabeza a +z, apoyo en y = 0, escala al largo del catálogo.
2. **Marcas comunes** medidas igual en la malla procedural y en la generada: puntas de hocico y cola, apoyos de las patas, grosor del cuerpo por tramos. Cada articulación se lleva de una a otra con esas marcas y luego se centra en la sección del cuerpo.
3. **Patas:** cada apoyo de la malla generada se empareja con el de la procedural y la pata se reconstruye en el marco cadera → apoyo conservando proporciones y sentido de la rodilla.
4. **Pesos** (`src/fauna/autorig.js`, compartido por la herramienta y el juego): cada vértice se asigna a una extremidad por **distancia geodésica** sobre la superficie soldada (Dijkstra en doble precisión), con exclusividad entre extremidades (una pata no arrastra a la otra) y mezcla suave con el tronco según el radio medido de cada miembro.
5. **Control:** hoja `shots/autorig/<id>.png` (lateral, planta y frente con los huesos) y `resumen.json`.

### Ajustes en el juego (`src/fauna/estatico.js`, `adoptarV2`)
- Zancada acotada al alcance real de la pata del modelo (si no, la IK estiraba la piel) y caderas que bajan lo justo para que los pies apoyen.
- Ciclo de paso de los bípedos según su ritmo; mandíbula sin apertura (no hay interior de boca); ancla de la montura medida sobre el lomo del modelo.
- Esferas de impacto calculadas de la malla por grupos de huesos (tronco, cuello, cabeza, cola, patas, brazos y aletas).

### Pruebas (`tools/lock.sh node tools/hf-test.mjs`)
Carga y material texturizado · huesos y pesos válidos · pose de enlace exacta · **cobertura de impactos ≥ 90 %** (todas ≥ 96,7 %) · marcha/vuelo/nado sin desgarros (umbral ×7,5 en la arista peor; se informa p99) con los pies apoyando · **capas** (pastar, llamar, mirar) y **muerte** apoyada en el suelo · respaldo con `?hf=0` y con un archivo ausente.

### Límites
- Pteranodon y quetzalcoatlus **excluidos**: sus modelos vienen en postura de viraje asimétrica.
- Proporciones del modelo generado, escalado por largo: varias especies quedan más altas que la referencia (ver `docs/GRAFICOS.md` §5).
- Sin clips de autor: todas las animaciones son las procedurales.
- Licencia de los modelos generados: **sin verificar** (ver `public/models/fauna/LICENCIAS.md`).
