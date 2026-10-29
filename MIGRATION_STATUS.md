# Estado de migración

La migración está **en curso**. La escena abre y existe una build Linux jugable, pero aún hay diferencias visuales y sistemas del original que no se han portado. La build no se declara completa ni lista para distribución multiplataforma.

## Portado y comprobado

- Heightfield original empaquetado (`data/world_map.bin`, 12.288 km), consulta de terreno, streaming de 25 chunks, colisión y spawn en playa.
- 75 objetos, 52 recetas, 67 iconos, 162 registros de fauna y 12 provincias importados como datos.
- HUD, inventario de 30 espacios, hotbar, mapa, pausa, guardado JSON local, fabricación y supervivencia básica.
- Modelos de objetos y fauna importados; manos/antebrazos procedurales originales exportados desde `manos.js` a `assets/godot_models/player/original_hands.glb`.
- Movimiento/cámara de primera persona, herramientas, impactos y animaciones procedurales básicas.
- Correcciones para evitar que el jugador flote caminando por el mar y para ubicar la fauna inicial sobre tierra firme.
- Iconos de aplicación/splash y presets Linux, Windows, macOS, Web, Android e iOS.

## Diferencias y trabajo pendiente

- La representación visual del terreno/vegetación aún no iguala el original: el material por bioma y la densidad/LOD son simplificados; los árboles actuales son primitivos. Debe portarse el sistema de capas, flora y bosque lejano de `src/world/terrain.js` y `src/flora/` antes de considerar fiel el mundo.
- Los GLB de fauna no contienen esqueleto ni clips. Hay movimiento corporal procedural y locomoción en fallback, pero no la animación articulada por especie de `src/fauna/creature.js`.
- Solo se crea una pequeña fauna inicial; el sistema completo de poblaciones y sus 162 especies/roles no está integrado.
- Construcción, domesticación/montura, afecciones, progresión, efectos y sonido, guardados/versiones y varias interacciones todavía no cubren todos los sistemas del original.
- La escala/encuadre de cada herramienta requiere ajuste visual contra las capturas de `docs/capturas/graficos/hacha_en_mano.jpg` y las escenas originales.
- Android es una build de depuración previa; iOS necesita Team ID y toolchain Apple. No se hicieron pruebas en dispositivos reales.

## Regla de estado

Las cifras de catálogos indican datos presentes, no mecánicas completas. Solo se marca como verificado lo cubierto por las comprobaciones indicadas en [TEST_RESULTS.md](TEST_RESULTS.md).
