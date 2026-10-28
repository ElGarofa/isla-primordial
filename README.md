# Isla Primordial

Juego de supervivencia en primera persona hecho con Three.js + Vite. El mundo, la animación, el sonido y la música se generan por código; los recursos gráficos generados con Higgsfield (fotos de suelo, follaje y corteza, 67 iconos, 19 objetos 3D y 32 pieles de dinosaurio sobre su esqueleto procedural) se integraron el 28-oct-2026 y se pueden apagar por URL (ver `docs/GRAFICOS.md`). El GLB animado del Parasaurolophus (Quaternius, CC0) sigue como alternativa con `?hf=0`.

## Cómo jugarlo

```bash
npm install
npm run dev        # http://localhost:5173
```

Producción: `npm run build` y `npm run preview`.

## Controles

| Acción | Tecla |
|---|---|
| Moverse / correr / agacharse / saltar | W A S D / Shift / Ctrl / Espacio |
| Golpear / usar | Clic izquierdo |
| Interactuar (beber, recoger, fogata; ofrecer comida o atender a un animal) | E |
| Montar / desmontar un animal domesticado y equipado | G |
| Montado: trote / galope / frenar / desviar | W / Mayús / S / A D |
| Usar objeto (comer, colocar fogata) | F |
| Inventario y fabricación | Tab |
| Mapa | M |
| Barra rápida | 1–9 |
| Pausa | Esc |

## Qué incluye

- **Continente de 12,3 × 12,3 km (151 km² con el mar, 95,6 km² de tierra)** con 12 provincias de tierra y 5 mares, cada uno con los ecosistemas de una época del catálogo (Triásico, Jurásico, Cretácico, Mioceno), 10 biomas con recursos propios (desierto: cactus y sal; volcán: obsidiana; pantano: arcilla; taiga: ámbar…), un volcán, océano con olas, ciclo día/noche de 25 min, lluvia y tormentas. Mapa en pantalla con **M**. Ver `docs/MAPA.md`.
- Flora instanciada con viento (palmeras, selva, coníferas, araucarias, helechos arborescentes, cícadas, colas de caballo, arbustos, helechos, hierba, troncos caídos y rocas fracturadas en 7 formas); los árboles se talan y los troncos se trocean. Bosque lejano en tarjetas hasta 2,6 km. Ver `docs/GRAFICOS.md`.
- Diez especies con esqueleto, marcha con IK, sentidos propios y habilidades: Tyrannosaurus (rastrea, acecha, carroñea), raptor (acecha y embosca), compsognatus, gallimimus (huyen en grupo), parasaurolophus (vigía que alerta a la manada y al jugador), stegosaurus y ankylosaurus (golpe de cola), triceratops (formación y embestida), braquiosaurio (pisoteo), pteranodon (vuela). Catálogo de 162 especies en datos; la fauna salvaje nace por provincia (solo especies de su época) y **no cruza la frontera de su provincia** (`?eco=hell_creek|morrison|nemegt` fuerza un único ecosistema). Ver `docs/FAUNA_HABILIDADES.md`. 32 especies llevan piel texturizada (generada con Higgsfield) sobre su esqueleto procedural; `?hf=0` la quita.
- Supervivencia: vida, hambre, sed, temperatura, resistencia; mochila con peso y volumen, 67 objetos con durabilidad y calidad, 45 recetas que se **descubren** (por tener un material, despiezar, fabricar o subir de oficio), cuatro oficios con nivel, ropa con armadura/abrigo/ruido, arco, honda y jabalina, despiece de cadáveres con cuchillo o hacha, cocina, muerte con bolsa de pertenencias, guardado automático (v2, migra partidas v1). Ver `docs/ITEMS_RECETAS.md`.
- **Domesticación por niveles** (Etapa 3): salvaje → alertado → habituado → bajo manejo → domesticado → equipado. Se avanza con presencia tranquila, ofrendas de la comida de cada especie, cabestro y cuidado durante días de juego; maltratar o abandonar hace perder niveles; los grandes depredadores nunca pasan de habituados y siguen cazando con hambre. Equipo según la anatomía (sillas, arnés, alforjas, protección) y **montura** en gallimimus, parasaurolophus y triceratops. Panel del animal con órdenes (seguir / quedarse / libre), equipo y carga. Ver `docs/DOMESTICACION.md`.
- Brazos y herramientas en primera persona con animación: manos con dedos articulados y mano de agarre; 18 herramientas y armas con modelo 3D (`?objetos=0` vuelve a las procedurales) y fogata con modelo.
- **Música de inicio** («temita», `public/audio/temita.mp3`) en el menú, tras el velo «Haz clic para comenzar»; `?titulo=0` la desactiva.
- Audio sintetizado en vivo (pasos, rugidos, clima, música adaptativa) e interfaz en español.

## Herramientas de desarrollo

- `?debug=1` en la URL expone `window.__game`.
- `node tools/shot.mjs --list` / `--preset nombre` genera capturas con Chromium headless (por software, lento).
- `node tools/audio-test.mjs` mide todas las recetas de audio.
- `node tools/ai-test.mjs [regex]` prueba por simulación la IA y las habilidades de la fauna (16 escenarios).
- `node tools/items-test.mjs` valida los datos de objetos y recetas y que todo objeto se pueda conseguir desde cero.
- `node tools/craft-test.mjs [regex]` prueba en navegador las 35 recetas, combate a distancia, ropa, peso, reparación, despiece y guardado (21 escenarios).
- `node tools/glb-test.mjs [regex]` prueba en navegador el modelo 3D del Parasaurolophus (14 escenarios: carga, clips, pies sin resbalar, capas de cabeza, muerte, cajas de impacto, terreno, IA, rendimiento, respaldos). `?glb=0` en la URL fuerza las mallas procedurales.
- `node tools/mundo-test.mjs [regex]` prueba el mapa (15 escenarios): rejillas, determinismo, provincias, conectividad (continente a pie, islas aisladas), biomas, recursos, épocas de la fauna, terreno y teletransporte por todo el mundo, terreno sin huecos con la cámara rápida, flora por bioma, población por provincia y mar, frontera de tierra y de mar, recorrido con streaming y el mapa M.
- `node tools/nado-test.mjs`, `tools/especies-test.mjs` y `tools/estatico-test.mjs` prueban las especies acuáticas (28 escenarios), las 152 especies generadas por familias y los modelos estáticos.
- `node tools/doma-test.mjs [regex]` prueba por simulación la domesticación de punta a punta: habituación, ofrendas, cabestro, órdenes, cuidado en días de juego, maltrato y abandono, equipo por anatomía, carga, liberar, montura (orilla y muerte), depredadores, guardado (21 escenarios).
- `node tools/musica-test.mjs` prueba la música de inicio en el menú real (22 escenarios, sin autoplay forzado).
- `python3 tools/preparar-texturas.py <carpeta>` prepara las texturas del suelo (quita la luz horneada, costuras, normal + altura) en `public/textures/suelo/`; `tools/preparar-follaje.py` hace lo mismo con hojas y cortezas y `tools/preparar-iconos.py` con los iconos.
- `node tools/autorig.mjs <carpeta_glb> [id …]` pone a cada modelo estático de fauna el esqueleto de su especie y guarda los pesos en el GLB (ver `docs/MODELOS_3D.md` §12); `node tools/hf-test.mjs [regex]` prueba las 32 pieles (99 escenarios: carga, pesos, pose, cobertura de impactos, marcha/vuelo/nado sin desgarros, capas de cabeza, muerte y respaldos).
- `node tools/manos-shot.mjs` captura el visor de manos (`tools/manos/`).
- Todas las pruebas con navegador se lanzan con `tools/lock.sh node …` (serializa, evita bloqueos por navegadores huérfanos y corta a los 25 min).
- `node tools/gen-items-doc.mjs` regenera `docs/ITEMS_RECETAS.md` desde los datos; `node tools/gen-doma-doc.mjs` hace lo mismo con `docs/DOMESTICACION.md`.
- `docs/ARQUITECTURA.md` describe los módulos; `docs/RUBRICA_AAA.md` la rúbrica visual.

## Limitaciones conocidas

- No es calidad Ark / AAA de estudio: es una base jugable con buen nivel visual para un proyecto 100 % procedural.
- La oclusión ambiental (AO) está desactivada por un defecto sin resolver.
- El rendimiento (60 fps) y el presupuesto de draw calls solo se verificaron con render por software; en GPU real falta medirlo. La calidad se puede bajar con `?quality=low`.
- El audio se verificó con métricas, no escuchándolo.
- El mapa grande **no se midió en GPU real** (solo CPU con render por software) y varias provincias tienen poca fauna porque el catálogo tiene pocas especies allí; lista completa en `docs/MAPA.md`.
- Sin reproducción ni crianza de animales (era opcional en el pedido), sin carros, y el jinete va en primera persona sin animación ni modelo propio. Las pruebas de domesticación son simuladas: no se probó con jugadores humanos.
- Las pieles de dinosaurio generadas no traen animaciones propias: toda la animación (marcha, carrera, pastar, llamar, mirar, muerte) es la procedural sobre su esqueleto. Pteranodon y quetzalcoatlus siguen con malla procedural (sus modelos venían en postura asimétrica) y varias pieles son más altas que la referencia paleontológica (ver `docs/GRAFICOS.md`).
- La licencia de los recursos generados con IA (Higgsfield/Tripo) **no está verificada** (ver `public/models/fauna/LICENCIAS.md`).
- Las mecánicas del GDD que faltan (descanso, heridas, conservación, contenedores, construcción modular, estaciones, habitantes, agricultura, cooperativo, facciones, comercio, crianza…) se están haciendo en el orden de su hoja de ruta; el estado de cada una está en `docs/PLAN_GDD.md`.
