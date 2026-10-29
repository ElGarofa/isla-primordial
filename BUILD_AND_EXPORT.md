# Compilación y ejecución

## Requisitos

- Godot 4.7.2 estable y las plantillas de exportación de la misma versión.
- Abrir `project.godot`; dejar que Godot importe los GLB/texturas antes de ejecutar o exportar.

## Ejecutar

- Editor: abrir `project.godot` y ejecutar `res://scenes/main.tscn`.
- Línea de comandos: `godot --path .` desde la raíz del proyecto.
- Linux ya exportado: `build/linux/IslaPrimordial.x86_64`.

## Exportar

Los presets están en `export_presets.cfg`. Ejemplo Linux:

```sh
godot --headless --path . --export-release Linux build/linux/IslaPrimordial.x86_64
```

Presets presentes: Linux, Windows, macOS, Web, Android e iOS. Los artefactos preexistentes de otras plataformas no están actualizados con los últimos cambios; vuelve a exportarlos y probarlos antes de distribuir. iOS requiere Team ID de Apple, macOS y Xcode.

## Web

La build web previa está en `build/web/`. Debe regenerarse después de los cambios recientes y probarse sirviendo la salida por HTTP en un navegador real. No se certifica compatibilidad actual con Chrome, Firefox, Edge o Safari, ni el comportamiento de almacenamiento local del navegador.

## Android/iOS

Android tenía un APK de depuración anterior; no se detectó dispositivo/emulador. iOS tiene preset, pero no se pudo exportar en este entorno sin identidad de equipo Apple y toolchain correspondiente.
