# Isla Primordial — Arquitectura y contratos

Juego de supervivencia en mundo abierto, en **Three.js + Vite (ES modules)**, que corre en el navegador.
Objetivo de calidad: **AAA** (referencia de nivel visual: Ark: Survival Evolved o superior).
Todo el texto visible para el jugador va **en español**. Comentarios del código en español. Identificadores en inglés o español, pero coherentes dentro de cada módulo.

## Reglas de oro

1. **Todo es procedural.** No hay descargas externas (la red está bloqueada salvo npm). Texturas (canvas/shaders/ruido), modelos (geometría generada), sonido (WebAudio): todo se genera por código.
2. **Cada agente es dueño de UNA carpeta** y solo edita archivos de ella. Los archivos compartidos son de solo lectura: `src/core/*`, `src/main.js`, `src/modules.js`, `src/debug/*`, `tools/*`, `docs/*`. Si necesitás un cambio en algo compartido, no lo edites: descríbelo en tu informe final (sección "Pedidos al director").
3. **Se integran solo por `ctx`** (ver contrato) y por el bus `ctx.events`. Nada de importar archivos internos de otro módulo, salvo `src/core/*` y `src/world/heightfield.js` (`getHeight`, `getNormal`, `getSlope`).
4. **Las firmas de los stubs son el contrato.** Podés AGREGAR métodos/propiedades a tu API; no cambies ni quites las existentes.
5. **Un módulo roto no debe tumbar al resto**: `main.js` aísla errores por módulo. Aun así: no dejes errores en consola.
6. Dependencias npm: evitá agregarlas. Si es imprescindible (p. ej. `@dimforge/rapier3d-compat` para físicas), instalala una vez, seriamente justificada en tu informe.
7. Rendimiento: objetivo 60 fps en una GPU de gama media (tipo RTX 3060) a 1080p. Presupuesto aproximado por frame: ≤ 2000 draw calls, ≤ 4 M de triángulos visibles. **Instancing, LOD, culling y pooling obligatorios** para cualquier cosa repetida. Nada de asignar memoria por frame en bucles calientes.

## Ciclo de vida de un módulo

`src/<modulo>/index.js` exporta `async function create(ctx)`. Dentro: asigna `ctx.<modulo> = api` y devuelve `{ name, fixedUpdate?(dt), update?(dt), lateUpdate?(dt), dispose?() }`.
Orden de arranque (ver `src/modules.js`): **render → world → flora → player → fauna → survival → fx → audio → ui**. En `create()` podés usar las APIs de los módulos anteriores.
`fixedUpdate` corre a 60 Hz (físicas); `update` y `lateUpdate` una vez por frame. `dt` es **0 en pausa**.
Estados (`ctx.state`): `loading | menu | playing | paused | dead`. Cambiar con `ctx.setState(x)` (emite el evento `state`). Los módulos de gameplay actúan solo en `playing`. En `menu`, el módulo **player** mueve la cámara en una órbita cinematográfica sobre la isla.

## Contrato de `ctx`

```
ctx.config            constantes (src/core/config.js)         ctx.events   bus: on(t,fn)->off, emit(t,data)
ctx.scene / ctx.camera / ctx.container                        ctx.settings.quality: 'low'|'medium'|'high'|'ultra'
ctx.time              { dt, realDt, elapsed, hour(0..24), locked, dayFraction, sunDir, moonDir, nightFactor(0..1), isNight,
                        weather:{ rain, storm, cloudCover, wind:Vector2 (dirección XZ), windStrength } }
ctx.renderer / ctx.composer / ctx.render(dt) / ctx.lighting     (render)
ctx.world             (world)    ctx.flora (flora)    ctx.player + ctx.input + ctx.physics (player)
ctx.fauna (fauna)     ctx.survival + ctx.ui (survival/ui)    ctx.fx (fx)    ctx.audio (audio)
ctx.debug             { enabled, freeCamera, hideUI } — si freeCamera es true, NADIE mueve la cámara salvo el preset de captura.
```

### render (agente "render")
Posee: renderer, composer/postproceso, iluminación, cielo, nubes, niebla, ciclo día/noche (colores), tone mapping, sombras, ctx.render.
- `ctx.renderer.info.autoReset = false` y `renderer.info.reset()` al inicio de `ctx.render` (para contar todos los pases).
- `ctx.lighting = { sun: DirectionalLight, setupMaterial(material), ... }`. **Todo material propio de otro módulo debe llamar `ctx.lighting.setupMaterial(mat)`** (sombras en cascada, niebla volumétrica, etc.). Preferí extender `MeshStandardMaterial`/`MeshPhysicalMaterial` con `onBeforeCompile` para heredar luz, sombras, niebla y tone mapping. Si usás `ShaderMaterial`, incluí los chunks de niebla.
- Lee `ctx.time.sunDir/nightFactor/weather` cada frame. Es la única autoridad sobre `scene.fog`, `scene.background`, `scene.environment`.
- **Viewmodel:** si existe `ctx.viewmodel = { scene, camera }` (lo crea player), renderizalo DESPUÉS de la escena principal con `clearDepth` y ANTES de bloom/gradación (para que brazos y herramientas reciban bloom y color grading), dentro del mismo composer. Tiene sus propias luces; no las toques.
- Escucha `weather:lightning` { intensity } (lo emite fx): destello de ambiente/cielo. Bajo el agua (cámara por debajo de `ctx.world.seaLevel`): tinte, niebla densa y cáusticas en el postproceso.
- Expone `ctx.render.setQuality(q)` y reacciona a `ctx.settings.quality`; adaptá resolución interna si hace falta.

### world (agente "world")
Posee: terreno (malla con LOD/chunks, material por splatting con texturas procedurales, triplanar en acantilados), agua (océano, olas, espuma, profundidad, refracción/reflejo), rocas/acantilados grandes, ríos/lagos si los hay, decals de suelo.
```
world.size, world.seaLevel, world.spawn (Vector3)
world.getHeight(x,z) / getNormal(x,z,out) / getSlope(x,z)       (de heightfield.js; podés refinar la forma de la isla sin cambiar firmas)
world.isWater(x,z)   world.getSurface(x,z) -> 'agua'|'arena'|'roca'|'nieve'|'barro'|'hierba'   (debe coincidir con lo que se VE)
world.getBiome(x,z) -> 'playa'|'selva'|'pradera'|'montana'|'nieve'|'pantano'     (agregalo)
world.water = { level, getWaveHeight(x,z,t), getDepth(x,z) }   (agregalo; lo usan player y fx)
world.raycastTerrain(origin, dir, maxDist) -> { point, normal, distance } | null
world.colliders: StaticColliders (src/world/colliders.js): addCircle(x,z,r,{height,kind,owner}) -> id, remove(id), query(x,z,r,out)
```
### flora (agente "flora")
Posee: árboles (palmeras, helechos arborescentes, coníferas de montaña, árboles de selva), arbustos, helechos, hierba con viento (shader), flores, rocas pequeñas/medianas, bayas, troncos caídos. Colocación determinista según `world.getBiome/getSlope/getHeight`. Registra colisionadores en `world.colliders` (con `owner` = id de flora).
```
flora.pick(origin, dir, maxDist) -> { id, tipo, position, distance, vida } | null
flora.damage(id, cantidad, herramienta) -> { destruido, drops:[{item,cantidad}] } | null     (ids de ITEMS en src/core/items.js)
flora.getHarvestablesNear(pos, radius, out)
```
Los árboles talados caen con física (usar `ctx.physics.spawnProp` o animación propia) y quitan su colisionador. Viento: leer `ctx.time.weather`.

### player (agente "player")
Posee: input (teclado/ratón, pointer lock), controlador en primera persona (caminar, correr, agacharse, saltar, nadar, bucear), colisión cápsula vs terreno y `world.colliders`, cámara (bob, FOV dinámico, inclinación), **modelo en primera persona** (manos/brazos y herramientas procedurales con animación), interacción (raycast a flora/fauna, golpear, recoger), daño por caída, **físicas dinámicas** (`ctx.physics`: troncos, cocos, loot, cadáveres), cámara cinematográfica de menú, y el spawn.
```
ctx.viewmodel = { scene: Scene, camera: PerspectiveCamera (fov ~55, near ~0.02) }  — lo creás vos; luces propias que imitan el sol/ambiente
                                                   (copiá color/intensidad/dirección de ctx.lighting.sun y ctx.time cada frame) y sincronizá la cámara con ctx.camera.
Emite `player:target` { nombre, tipo, accion, vida? } | null cuando cambia el objeto apuntado (la UI muestra "E — Recoger" etc.).
ctx.input = { keys:Set, mouse, pointerLocked, actions... }   Controles: WASD, Shift correr, Ctrl agachar, Espacio saltar, E interactuar,
                                                              clic izq. usar/golpear, Tab inventario, 1-9 barra rápida, Esc pausa.
ctx.player = { position(pies), velocity, yaw, pitch, onGround, inWater, swimming, sprinting, crouching, eyePosition, teleport(x,z), getLookRay() }
ctx.physics.spawnProp(kind, position, velocity) -> handle
```
Emite: `player:footstep` { surface, speed }, `player:jump`, `player:land` { speed }, `player:attack` { tool }, `player:interact`.
Al golpear: llama a `ctx.flora.damage` / `ctx.fauna.damage` con la herramienta equipada (`ctx.survival.equipped`) y entrega `drops` con `ctx.survival.inventory.add`.

### fauna (agente "fauna")
Posee: dinosaurios y fauna procedurales (mallas con esqueleto/skinning generado por código, shader de piel con escamas/rayas/subsurface fake, animación procedural con IK de patas, respiración, cola con seguimiento, cabeza que mira), IA (herbívoros que pastan y huyen, depredadores que cazan, ciclo día/noche), spawn por bioma, aves/peces ambientales, cadáveres con física.
```
fauna.creatures[]  fauna.pick(origin, dir, maxDist) -> { criatura, distance, point } | null
fauna.damage(criatura, cantidad, fuente)   fauna.spawnAt(especie, x, z)   fauna.getNear(pos, radius, out)
```
Eventos: emite `player:damage`-vía `ctx.survival.damage(cantidad, fuente)` cuando atacan al jugador; emite `creature:killed` { especie, position, drops } y `creature:roar` { especie, position }.
Especies mínimas: raptor (manada), triceratops, braquiosaurio, compsognatus (pequeño), pteranodon (vuelo). Nombres visibles en español.

### survival + ui (agente "survival-ui")
Posee: estadísticas (vida, hambre, sed, energía, temperatura), inventario, barra rápida, crafteo (usar `ITEMS`/`RECIPES`), fogata (cocinar, calor, luz con `ctx.fx.createFire`), muerte/reaparición, guardado en `localStorage`, y **toda la interfaz**: menú principal, pantalla de carga (index.html + `src/ui/loading.js`; en `?debug=1` debe desaparecer al instante), HUD (barras, brújula, hora, barra rápida, mira, indicadores de daño, mensajes de recogida), inventario/crafteo (Tab), pausa, muerte, ajustes (calidad, volumen, sensibilidad). Estética AAA coherente (tipografías, iconos SVG/canvas procedurales, animaciones suaves). `ctx.debug.hideUI` oculta todo.
```
survival.stats{vida,hambre,sed,energia,temperatura}  survival.inventory{add,remove,count,has}  survival.equipped  survival.damage(c,fuente)  survival.craft(id)
ui.notify(texto,tipo)  ui.showMenu() / hideMenu()
```
Eventos: `item:added`, `player:damage`, `player:died`, `player:respawn`.

### fx (agente "fx")
Posee: sistema de partículas GPU/instanciado (polvo, salpicaduras, chispas, hojas, astillas, humo, fuego, brasas, luciérnagas, insectos), **clima** (lluvia, tormenta con relámpagos, viento variable que modula `ctx.time.weather` en el tiempo; lluvia visible y charcos/mojado si es viable), decals simples.
```
fx.emit(nombre, position, opts)   fx.createFire(position, opts) -> { setPosition, dispose }   fx.setWeather({rain,storm,cloudCover,windStrength})
```
Escucha: `player:footstep`, `creature:killed`, `player:land`, etc.
Mantiene `ctx.time.weather.wetness` (0..1, sube con la lluvia y se seca despacio): world/flora/fauna pueden leerlo para oscurecer y dar brillo a materiales. Emite `weather:changed` y `weather:lightning` { intensity, position } (render hace el destello; audio el trueno con retardo según la distancia).

### audio (agente "audio")
Posee: motor WebAudio con espacialización 3D (`listener` sigue la cámara), ambiente por bioma y hora (viento, oleaje, aves de día, insectos/grillos de noche, selva), pasos por superficie, golpes, recoger, UI, rugidos/llamados sintetizados por especie (síntesis, no samples), tormenta, música ambiental generativa (cuerdas/pads/percusión suave que reacciona al peligro). Debe respetar la política de autoplay (`resume()` tras el primer gesto).
```
audio.play(nombre, position?, opts?)   audio.resume()   audio.setMasterVolume(v)
```

## Materiales y luz: cómo mantener coherencia visual

- Espacio de color: salida sRGB, texturas de color con `colorSpace = SRGBColorSpace`, mapas de datos (normal/rugosidad) en lineal.
- Tone mapping ACES/AgX lo controla render; no lo desactives en tus materiales (`toneMapped` por defecto).
- Texturas procedurales: generá en canvas/DataTexture al cargar (con mipmaps y `anisotropy` alta), con tileado sin costuras y variación a gran escala para evitar repetición visible (macro-variación, rotación de UV por celda, "texture bombing").
- Detalle: normal maps, oclusión ambiental en vértices, rugosidad variable, SSS fingido en hojas/piel, humedad.
- El mundo se mide en metros: una persona mide 1.8 m, un árbol de selva 25–45 m, un braquiosaurio ~25 m.

## Herramienta de capturas (para verificar tu trabajo y para los jueces)

```
node tools/shot.mjs --list
node tools/shot.mjs --preset <nombre[,nombre]> [--frames 12] [--hour 10] [--w 1280 --h 720] [--ui] [--out carpeta]
```
Genera PNGs (que podés abrir con la herramienta Read para **mirarlos de verdad**) y `report.json` (draw calls, triángulos, errores). Corre WebGL2 por software (SwiftShader): no sirve para medir fps reales, sí para juzgar la imagen.
**Cada agente debe crear `src/<modulo>/shots.js`** con presets que muestren SU trabajo desde varios ángulos, distancias y horas (ver formato en `src/debug/index.js` y ejemplos en `src/debug/shots.js`). Prefijá los nombres con tu módulo (`terreno_…`, `flora_…`). Incluí al menos: vista general, plano medio, primerísimo plano (detalle de materiales), amanecer/atardecer/noche si aplica, y casos límite.
**Mirá tus capturas con ojo crítico y mejorá en bucle antes de entregar.** Compará con lo que sabés de juegos AAA (Ark, Horizon, Red Dead 2, The Witcher 3). Si se ve "tech demo", no está listo.

## Entregable de cada agente

Un informe final breve: qué construiste, qué presets de captura hay, métricas (draw calls/triángulos), limitaciones conocidas y "Pedidos al director" (cambios necesarios en archivos compartidos). No pegues código en el informe.

## Protocolos acordados entre módulos (obligatorios)

**Eventos** (`ctx.events.emit(nombre, datos)`). Quien lo emite es el único que define el payload; los demás solo lo escuchan.

| Evento | Emite | Payload |
|---|---|---|
| `input:action` | player | `{ action: 'inventario'\|'pausa'\|'hotbar'\|'interactuar'\|'usar'\|'mapa', index?: 0..8, pressed: bool }` |
| `player:footstep` | player | `{ surface, speed, position }` |
| `player:jump` / `player:land` | player | `{ position }` / `{ position, speed }` |
| `player:attack` | player | `{ tool, position }` |
| `player:target` | player | `{ nombre, tipo, accion, vida? } \| null` |
| `equip:changed` | survival | `{ item }` (id de ITEMS o null). `ctx.survival.equipped` siempre está al día |
| `item:added` | survival | `{ item, cantidad }` |
| `player:damage` / `player:died` / `player:respawn` | survival | `{ cantidad, fuente }` / `{ causa }` / `{ position }` |
| `flora:hit` | flora | `{ tipo, position, herramienta }` |
| `flora:felled` | flora | `{ tipo, position, direccion: Vector3 }` |
| `creature:hit` | fauna | `{ especie, position, fuerza }` |
| `creature:roar` / `creature:killed` | fauna | `{ especie, position }` / `{ especie, position, drops }` |
| `weather:changed` / `weather:lightning` | fx | `{ rain, storm, cloudCover }` / `{ intensity, position }` |
| `ui:sound` | ui | `{ nombre }` ('ui_click', 'ui_open', 'ui_close', 'ui_error', 'craft') |

**Interactuables genéricos.** `ctx.player.registerInteractable({ id, position: Vector3, radius, label, getPrompt?(), onInteract() }) -> unregister()`.
player lo evalúa (el más cercano dentro de `reach` y en el cono de la mirada), lo publica en `player:target` y ejecuta `onInteract()` con la acción `interactuar`. Lo usa survival para fogatas.

**Beber.** Si el jugador mira agua a ≤ `reach` y pulsa `interactuar`, player llama `ctx.survival.drink(cantidad)` (survival: sube sed, sonido vía `ui:sound`/`audio.play('beber')`).

**Bloqueo de input.** `ctx.ui.blocksInput` es `true` mientras haya menú/inventario/pausa abierto: player ignora movimiento y mirada y libera el pointer lock. `ctx.state === 'paused'` implica dt = 0.

**Fuego en el viewmodel.** `ctx.fx.createFire(position, { scene })`: con `scene` distinta de `ctx.scene` (p. ej. `ctx.viewmodel.scene`) el fuego se crea ahí (antorcha en mano).

**Sin acoplar internos.** Nadie importa archivos internos de otro módulo. Si necesitás un dato de otro módulo y no está en el contrato: usá un evento o escribilo en "Pedidos al director".

---

## Ampliaciones posteriores al contrato original (Etapas 1–3)

Los módulos siguen siendo los mismos; se amplió dentro de ellos. No hay un segundo inventario, gestor de recetas ni controlador de criaturas.

| Archivo | Qué aporta |
|---|---|
| `core/items.js` | Catálogo único de objetos, recetas, recolección, despiece, oficios y equipo animal (familia F, ranuras `RANURAS_ANIMAL`). Datos puros que también importan las pruebas en Node. |
| `survival/saber.js` | Conocimiento: recetas aprendidas, XP por oficio (incluye `manejo`), calidad al fabricar. |
| `fauna/catalogo.js` | 162 fichas de especies en datos; las implementadas llevan además `doma` y `montura`. |
| `fauna/species.js`, `creature.js` | Fichas con malla/esqueleto/IK; `creature.rel` es la relación con el jugador. |
| `fauna/sentidos.js`, `cerebro.js`, `habilidades.js` | Percepción, estados de la IA y habilidades de especie conectadas a ella. |
| `fauna/vinculo.js` | **Domesticación por niveles**: habituación, confianza, manejo, cuidado, órdenes, equipo, carga, guardado de `rel`. Se engancha a la IA en `cerebro.js` (`trato`, `sentirRel`, `tickRel`, correa de órdenes, `noCazaJugador`). |
| `player/montura.js` | Montar, conducir y anclar al jugador a la silla (`ctx.montura`). Se ejecuta en la fase `lateUpdate`, después de que la fauna se movió. |
| `ui/animal.js` | Panel del animal propio. `ui/index.js` añade la línea de objetivo con nivel/habituación y el aviso de montura. |

API nuevas que otros módulos pueden usar: `ctx.fauna.vinculo.*` (ver `fauna/index.js`), `ctx.fauna.propios()`, `ctx.fauna.serializar()/restaurar()`, `ctx.montura.{puede,montar,desmontar,ancla}`, `ctx.survival.inventory.tomar()`.
Eventos nuevos: `fauna:habituada`, `fauna:ofrenda`, `fauna:domesticada`, `fauna:vinculo_perdido`, `fauna:equipado`, `fauna:liberada`, `montura:montar`, `montura:desmontar`, `fauna:alerta`, `saber:aprendido`, `saber:nivel`, `crafted`, `proyectil:disparado`, `proyectil:impacto`.
Fase `lateUpdate`: tras todos los `update`, para lo que depende de la posición final de otros módulos (el jinete).
Guardado: formato v2 (equipo, durabilidad, saber, **fauna propia y habituada**); migra v1.
