# Licencias de los modelos 3D de fauna

| Archivo | Autor | Pack | Licencia | Cambios |
|---|---|---|---|---|
| `parasaurolophus.glb`, `tyrannosaurus.glb`, `velociraptor.glb`, `triceratops.glb`, `stegosaurus.glb`, `apatosaurus.glb` | Quaternius | «Animated Dinosaur Pack» (diciembre de 2018) | **CC0 1.0** (dominio público: uso, modificación y redistribución, también comercial, sin atribución obligatoria) | Ninguno en el archivo. Todo el procesado (soldadura de vértices, subdivisión, normales, colores por zona, UV, ojos) ocurre en memoria al cargar el juego (`src/fauna/modelo3d.js`, `src/fauna/malla.js`). |
| `generados/carnotaurus.glb` (+ `carnotaurus.rig.json`) | **Generado por IA** (no hay autor humano) | Higgsfield · modelo `tripo_3d`, texto → 3D, cuenta *free* (job `d3164fb4-57f5-4814-8a0c-4dc5edc0c50d`) | **Pendiente de verificar**: los términos de Higgsfield y de Tripo definen si el uso comercial está permitido en tu plan; no los pude comprobar con certeza | Se descargó la malla original (~42 MB, 1,45 M triángulos, textura), se simplificó a 5 998 triángulos con color de vértice (`tools/preparar-glb.mjs`) y se normalizó (largo 1, pies en y = 0, cabeza en +z). El `.rig.json` lo escribí yo (posición de articulaciones sobre esa malla). |

## De dónde salió y qué está verificado

- Los archivos son los originales del pack, sin modificar (el Parasaurolophus: 371 080 bytes, 37 huesos, 6 animaciones, 1 414 triángulos). Los otros cinco modelos del mismo pack están copiados pero **no se usan hasta que se integren con su descriptor `glb`** (estado en `docs/MODELOS_3D.md`).
- **No pude descargarlo de la página del autor** (quaternius.com / itch.io no son accesibles desde el entorno donde trabajo). Lo obtuve de una copia en GitHub (`nicolasezquerro-coder/saltamundos`), cuyo `LEEME.txt` declara «Quaternius, CC0». Ese repositorio no trae archivo de licencia propio.
- La misma licencia aparece de forma independiente en `spence-com-au/dino-park` (`CREDITS.md`, repositorio con licencia MIT) para este mismo pack.
- **Antes de publicar el juego, comprobá la licencia en la página oficial del pack de Quaternius.** Aunque CC0 no exige atribución, conviene mantener este archivo y el crédito en el juego.

## Lo que NO se usó

- Ningún recurso de ARK ni de otro juego comercial. Las fichas, colores y texturas de piel (escamas) son propios y se generan por código.
- Ninguna textura externa: el modelo original solo trae cuatro materiales de color plano; la piel se genera en `src/fauna/skin.js`.

## Modelos generados (carpeta `generados/`)

- Son mallas **estáticas** (sin huesos ni animación) creadas por un servicio de generación 3D. El juego les pone el esqueleto procedural de la especie (`src/fauna/estatico.js`); ver `docs/MODELOS_3D.md` §11.
- **Licencia y términos: no verificados.** Un resultado de una IA generativa no tiene autor humano que ceda derechos; lo que puedo usar depende de los términos del servicio (Higgsfield y el modelo Tripo) y del plan de la cuenta. Antes de publicar o vender el juego, leé esos términos y, si hace falta, regenerá o reemplazá el modelo por uno con licencia clara.
- No se usó ningún recurso de ARK ni de otro juego, y la entrada fue solo texto (sin imágenes de terceros).

## Pieles generadas en lote (carpeta `hf/`, 28/10/2026)

| Archivos | Origen | Licencia | Cambios |
|---|---|---|---|
| `hf/<especie>.glb` + `hf/<especie>.rig.json` (32 especies, lista en `src/fauna/estaticos-hf.js`) | **Generados por IA** en Higgsfield (modelo Tripo, imagen → 3D) desde otro chat; llegaron en zips | **Pendiente de verificar**, igual que el Carnotaurus: depende de los términos de Higgsfield/Tripo y del plan de la cuenta | `tools/autorig.mjs`: orientación, escala al catálogo, simplificación a 14 000 triángulos, textura a WebP, esqueleto de la especie y pesos de piel guardados en el archivo. El `.rig.json` lo escribe esa herramienta. |

Lo mismo vale para `public/models/objetos/*.glb` (herramientas, armas y fogata), las fotos de `public/textures/` (suelo, follaje y cortezas) y los iconos de `public/icons/`: generados en Higgsfield, licencia **sin verificar**. Antes de publicar o vender el juego, revisá esos términos.
