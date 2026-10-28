# Mejora gráfica — ronda del 28-oct-2026 (cerrada)

Pedido: mejorar todo el apartado gráfico (suelos, flora, rocas, dinosaurios, objetos, animaciones) con los recursos generados en Higgsfield, poner `temita` como música de inicio y seguir el GDD.

**Cómo llegaron los recursos:** la red de este entorno rechaza (403 por política) el dominio donde Higgsfield guarda los archivos, así que la generación se hizo en otro chat y llegaron **6 zips**. Todo lo que sigue está dentro del juego y probado; cada bloque se puede apagar por URL para comparar con la versión anterior.

| Bloque | Qué entró | Interruptor | Dónde |
|---|---|---|---|
| Suelo | 8 capas con foto (hierba, hojarasca, arena, roca, nieve, barro, ceniza, desierto), color + normal/altura, 1024 px | — (si faltan, capas por código) | `public/textures/suelo/`, `src/world/suelos.js` |
| Flora | 11 fotos: frondas de palmera, helecho y cícada; hojas de selva y arbusto; hierba; agujas de conífera y araucaria; cortezas de selva, palmera y conífera (color + normal) | `?fotos=0` | `public/textures/flora/`, `src/flora/fotos.js` |
| Iconos | 67 iconos de objeto (128 px WebP) | `?iconos=0` | `public/icons/`, `src/ui/icons.js` |
| Objetos en mano | 18 herramientas y armas + la fogata (GLB) | `?objetos=0` | `public/models/objetos/`, `src/player/objetos3d.js`, `src/survival/campfire.js` |
| Fauna | 32 pieles texturizadas sobre el esqueleto de cada especie | `?hf=0` | `public/models/fauna/hf/`, `tools/autorig.mjs`, `src/fauna/autorig.js` |

Créditos de Higgsfield: los gastó el otro chat; quedan **11** en la cuenta (consulta del 28-oct). No alcanzan para más modelos 3D.

## 1. Música de inicio (`src/audio/titulo.js`, `public/audio/temita.mp3`)
- `temita.wav` (3:09) convertida a MP3 VBR ≈ 190 kb/s (4,5 MB), reproducida por *streaming* y enrutada por WebAudio (obedece volumen general y de música).
- El navegador no deja sonar nada antes de un gesto: el menú muestra un **velo «Haz clic o pulsa una tecla para comenzar»** que arranca la música con fundido. Al jugar suena 7 s más y cede a la música generativa. `?titulo=0` la desactiva.
- **No la escuché** (no tengo salida de audio): comprobé formato, niveles con `ffmpeg` y que la señal pasa por el grafo (RMS medido). `musica-test` 22/22.

## 2. Terreno
- Arreglado un fallo real: agujeros en el suelo con la cámara rápida (nodos del árbol de LOD sin hijos construidos y liberados por memoria). Prueba de vuelo a 80 m/s sin huecos (falla sin el arreglo).
- **Capas con foto**: se mezclan por altura (la hierba asoma entre la tierra, la arena rellena grietas), la roca va en proyección triple en los acantilados y una segunda escala oculta el mosaico a distancia. El color final respeta la paleta de cada bioma (color del vértice × textura ÷ su color medio).

## 3. Flora y rocas
- Rocas fracturadas en 7 formas con la textura de roca de los acantilados.
- Flora mesozoica: helecho arborescente, araucaria, cícada, cola de caballo, troncos caídos que se trocean.
- **Fotos de follaje y corteza** (`flora/fotos.js`): hojas recortadas con canal alfa (prueba alfa 0,5) y cortezas con mapa normal; si una foto no carga se dibuja la textura por código.
- Follaje lejano sin «pelarse» (alfa compensado por nivel de mip) y bosque lejano en tarjetas hasta 2,6 km (`?lejano=0`).

## 4. Primera persona
- **Manos** (`player/manos.js`): palma, falanges con nudillos y uñas, piel con relieve, muñequera; **mano de agarre** para herramientas (dorso curvado, tendones, pulgar envolviendo el mango). Visor aparte en `tools/manos/` y capturas con `tools/manos-shot.mjs`.
- **Herramientas y armas con modelo 3D** (`player/objetos3d.js`): cada GLB se escala a la medida de la herramienta procedural, se gira hacia el lado de la cabeza y se **adelgaza el mango** al radio de la mano (los modelos generados traían mangos gruesos). El arco y la honda llevan ajustes propios.
- **Fogata con modelo** (`survival/campfire.js`) con el fuego, las brasas y la luz de siempre.
- **Iconos con foto** en barra rápida, inventario y recetas; si una imagen falla se cambia sola por el icono dibujado.

## 5. Dinosaurios: pieles generadas sobre el esqueleto procedural
- Los modelos de Higgsfield son **estáticos** (sin huesos). `tools/autorig.mjs` (sin conexión, una vez) les pone el esqueleto de su especie: orienta la malla, encaja el esqueleto procedural en ella (marcas de hocico, cola y pies), etiqueta cada pata por distancia geodésica sobre la superficie y guarda los **pesos de piel dentro del GLB**. Detalle técnico en `docs/MODELOS_3D.md` §12.
- **32 especies** entran así: bípedos (tiranosaurio, alosaurio, giganotosaurio, espinosaurio, ceratosaurio, dilofosaurio, raptor, velocirraptor, compsognato, galimimo, oviraptor, terizinosaurio, iguanodonte, paquicefalosaurio), cuadrúpedos (triceratops, estiracosaurio, protoceratops, estegosaurio, kentrosaurio, anquilosaurio, parasaurolophus, coritosaurio, edmontosaurio, maiasaura, braquiosaurio, apatosaurio, diplodocus, sarcosuchus), nadadores (ictiosaurio, plesiosaurio, mosasaurio) y el dimorfodonte.
- **Excluidos** (siguen con malla procedural): pteranodon y quetzalcoatlus. Sus modelos vienen con las alas en posturas asimétricas que el esqueleto de vuelo no puede seguir sin desgarros.
- Como la piel usa los huesos de siempre, **toda la animación procedural sirve tal cual**: marcha con IK, carrera, vuelo, nado, pastar, llamar, mirar, comer, rugido, golpes de cola y muerte. Se limitó la apertura de mandíbula (los modelos no tienen interior de boca).
- Las texturas de Tripo venían oscuras: el color se normaliza por especie con el albedo medio medido.
- **Proporciones:** se escalan por el largo del catálogo. Varias quedan más altas que la referencia paleontológica (galimimo con cadera a 2,47 m frente a ~1,9 m real; espinosaurio con la reconstrucción antigua de patas largas). No las corregí: cambiarlas exige regenerar los 32 archivos y volver a probar; queda anotado.

## 6. Animaciones (lo hecho en esta ronda)
- **Capas que faltaban en el esqueleto procedural** (valen para la malla procedural y para las pieles nuevas):
  - pastar en los bípedos herbívoros y omnívoros (ornitomimos, terizinosaurio, iguanodonte, paquicefalosaurio): antes «pastaban» con la cabeza erguida; los carnívoros solo husmean;
  - llamar en saurópodos (yerguen el cuello), ceratópsidos, estegosaurios, anquilosaurios y cocodrilos: antes no movían la cabeza al llamar.
- **Cadáveres apoyados en el suelo:** antes el cuerpo giraba sobre los pies y quedaba **medio enterrado y corrido un par de metros** de donde murió el animal. Ahora cae de costado (a un lado u otro), el tronco queda encima de su posición, las patas, el cuello y la cola se vencen hacia el suelo y la altura final se mide una vez con los vértices del tronco ya tendido.
- Prueba nueva en `hf-test` (32 escenarios «capas»): la cabeza baja al pastar, sube al llamar y gira al mirar (medido por el centro de los vértices de la cabeza), la piel no se desgarra y el cadáver queda quieto y apoyado.

## 7. Cajas de impacto
- Las esferas de impacto de cada piel se calculan de su malla. La prueba nueva de **cobertura** detectó que en 5 bípedos (dilofosaurio, galimimo, oviraptor, espinosaurio, terizinosaurio) quedaban fuera los brazos y medio cuello (80–86 % de los vértices cubiertos). Ahora llevan esferas en los brazos y dos en el cuello: **todas las especies superan el 96,7 %**.

## 8. Pruebas (última ejecución)
- `hf-test`: carga, huesos y pesos, pose de enlace, cobertura de impactos, marcha/vuelo/nado sin desgarros con los pies apoyados, capas y muerte, respaldos (`?hf=0` y archivo ausente).
- Resto de la batería: ver el informe de entrega y `docs/PLAN_GDD.md`.
- `glb-test` ahora se ejecuta con `&hf=0`: mide el GLB animado del Parasaurolophus (que sigue como alternativa); por defecto esa especie usa su piel generada.
- `doma-test`: la comprobación de la silla del galimimo pasó de un rango absoluto de altura (pensado para la malla procedural) a medir que la silla quede **apoyada sobre el lomo real** del modelo (2,96 m de ancla sobre un lomo de 2,71 m).

## 9. Rendimiento
Medido solo con render por software (sin GPU real); sirve para comparar versiones, no para estimar FPS. Las pieles tienen 14 000 triángulos cada una (las procedurales, entre 3 000 y 9 000): el coste de CPU por criatura animada no cambió (los huesos son los mismos), el de GPU no está medido.

## 10. Pendiente gráfico
- Pteranodon y quetzalcoatlus con piel (hace falta otro modelo en postura simétrica).
- Corregir proporciones de las especies más desviadas (galimimo, espinosaurio, diplodocus) regenerando con escala por altura.
- Clips propios (no capas) para pastar o dormir: los modelos generados no traen animaciones.
