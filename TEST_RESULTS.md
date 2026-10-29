# Resultados de pruebas

Última ejecución local: Godot 4.7.2, Linux x86_64, renderer Compatibility/llvmpipe.

| Prueba | Resultado | Alcance |
|---|---|---|
| Importar proyecto/editor | Aprobada | Escanea GLB y scripts; sin errores de parseo al terminar. |
| `res://tools/migration_smoke.tscn` | Aprobada: 87 | Catálogos, heightfield, iconos, recetas y guardado. |
| `res://tools/runtime_smoke.tscn` | Aprobada: 23 | 25 chunks, spawn/collider, fauna terrestre, manos, hacha, golpe, mar/nado, HUD/mochila/mapa/pausa. |
| `tools/desktop_smoke.sh` con ejecutable Linux | Aprobada | Inicio, entrada a partida, mochila, mapa, pausa y movimiento sintéticos. |
| Exportar/abrir Linux | Aprobada | `build/linux/IslaPrimordial.x86_64` actualizado; smoke gráfico pasado. |
| Web del build actual | Pendiente | El artefacto previo es obsoleto respecto a las correcciones recientes. |
| Windows/macOS/Android del build actual | Pendiente | Hay presets y builds previas, falta reexportar/probar tras cambios. |
| iOS y móviles reales | No ejecutable aquí | Falta Team ID/toolchain Apple; sin dispositivos/emuladores. |
| Fidelidad visual completa | Pendiente | Terreno/flora simplificados y fauna sin rig/clips; ver [HANDOFF.md](HANDOFF.md). |

Comandos de smoke:

```sh
godot --headless --path . res://tools/migration_smoke.tscn
godot --headless --path . res://tools/runtime_smoke.tscn
xvfb-run -a bash tools/desktop_smoke.sh "$PWD/build/linux/IslaPrimordial.x86_64" "$PWD" /tmp/isla-linux.log /tmp/isla-linux-shots
```
