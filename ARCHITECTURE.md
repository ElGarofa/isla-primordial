# Arquitectura actual

## Arranque y escenas

- `scenes/main.tscn` inicia `scripts/main.gd`.
- `GameState` es autoload y conserva datos de sesión, inventario, recetas y guardado JSON.
- `IslaMain` crea `IslaIslandWorld`, `IslaPlayer` e `IslaGameUI` en tiempo de ejecución.

## Mundo

- `scripts/world_map.gd` lee el heightfield y las rejillas de `data/world_map.bin`; ruido simplex añade detalle.
- `scripts/island_world.gd` genera chunks de 128 m, malla y colisión trimesh, agua, recursos y fauna.
- `scripts/creature.gd` gestiona el estado/IA y movimiento corporal procedural; aún no reemplaza los rigs animados ausentes de los GLB.

## Jugador e interfaz

- `scripts/player.gd`: CharacterBody3D, cámara, movimiento, agua, combate y entradas.
- `scripts/player_viewmodel.gd`: sway, marcha, sprint, salto, equipamiento y golpes. Carga `original_hands.glb`, generado desde las funciones originales `puno`, `manoAgarre` y `antebrazo` en `src/player/manos.js`.
- `scripts/game_ui.gd` construye HUD, mochila, mapa, pausa y controles táctiles; `scripts/map_view.gd` representa el mapa.

## Formatos y dependencias

- Godot 4.7.2 estable; GDScript; renderizador Compatibility para ampliar soporte web/móvil.
- Datos de catálogo JSON y heightfield binario; modelos GLB; iconos WebP; texturas JPG; audio MP3.
- La conversión GLB se hizo con `tools/gltf/convert.mjs` y `@gltf-transform`. Para la malla de manos se usó temporalmente el Three.js del original y se empaquetó geometría/materiales en GLB. El juego Godot no requiere plugins externos en ejecución.
- La arquitectura actual es una base integrada, no una migración completa de todos los módulos Three.js.
