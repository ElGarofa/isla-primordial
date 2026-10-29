# Handoff de migración — Isla Primordial

Estado guardado: 29-10-2026. La migración sigue **incompleta**. El ejecutable Linux actual y el proyecto Godot se abren; no se ha alcanzado la fidelidad visual ni la cobertura de sistemas del original.

## Punto en que quedó

- Se portó el rig procedimental original de `src/player/manos.js` a [original_hands.glb](assets/godot_models/player/original_hands.glb), incluyendo puños, manos de agarre, antebrazos, piel y cuero. `player_viewmodel.gd` lo usa con posturas de herramienta y animación procedural de balanceo, caminar, sprint, salto y golpes.
- Se corrigió la flotación falsa: el nado se decide por profundidad del terreno, la cámara baja a la superficie y se recuperan oxígeno/humedad según la posición. El agua visual coincide ahora con el nivel cero del heightfield.
- La fauna inicial busca tierra firme, el modelo se alinea por la base de su AABB y los objetivos de deambulación no cruzan agua profunda. Se añadió animación corporal procedural. Los GLB de fauna inspeccionados no tienen esqueleto ni clips, por lo que esto no reproduce sus animaciones por articulación del original.
- El Linux exportado está actualizado en `build/linux/IslaPrimordial.x86_64` y `build/linux/IslaPrimordial.pck`.
- Se conservaron los iconos y los modelos originales importados. El icono de aplicación y los presets siguen configurados.

## Verificación ejecutada

- Godot 4.7.2: importación/editor sin errores de scripts.
- `migration_smoke.tscn`: 87 comprobaciones aprobadas.
- `runtime_smoke.tscn`: 23 comprobaciones aprobadas, incluyendo brazos/herramienta, terreno, dinosaurios apoyados y flotación en agua.
- `desktop_smoke.sh` contra el ejecutable Linux exportado: menú/entrada, partida, mochila, mapa, pausa y movimiento; pasó.
- La captura del viewmodel se guardó temporalmente en `/tmp/isla-viewmodel-{punos,hacha,lanza}.png`.

## Pendiente prioritario

1. **Comparar el inicio y el terreno con el original en ejecución.** La malla base reutiliza el heightfield, pero la representación sigue siendo más simple: pocos niveles de detalle, mezcla de materiales incompleta y árboles tipo esfera que no corresponden a la flora procedural del original. El usuario indicó que el aspecto aún es demasiado distinto. No presentar esta parte como migrada fielmente.
2. Revisar in-game la escala/encuadre de las herramientas; se recuperaron las manos originales, pero algunos objetos aún quedan demasiado grandes o centrados respecto a la captura del original.
3. La fauna importada carece de rig/clips; falta reconstruir articulaciones y animaciones originales por especie. La IA y población completas (162 especies) tampoco están migradas.
4. Terminar y verificar construcción, domesticación/monturas, dolencias, audio/FX, progresión, conversión de partidas y el resto de sistemas que faltan frente a los fuentes.
5. Volver a exportar Web, Windows, macOS y Android tras los cambios recientes. El Web actual es anterior a los últimos cambios. iOS requiere Team ID de Apple y macOS/Xcode.
6. Ejecutar y revisar el navegador real en Chrome y, si es posible, Firefox/Edge/Safari y dispositivos móviles. El smoke web anterior no valida este último build.

## Reanudar

Abre `isla-primordial-godot/isla-primordial/project.godot` con Godot 4.7.2. La escena principal es `res://scenes/main.tscn`; el binario Linux está en `build/linux/IslaPrimordial.x86_64`.

Comandos reproducibles y estado por plataforma: [BUILD_AND_EXPORT.md](BUILD_AND_EXPORT.md), [TEST_RESULTS.md](TEST_RESULTS.md), [MIGRATION_STATUS.md](MIGRATION_STATUS.md) y [ARCHITECTURE.md](ARCHITECTURE.md).
