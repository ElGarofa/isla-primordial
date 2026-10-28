# Plan de expansión por etapas

Regla: ampliar los módulos existentes (`core/items.js`, `survival`, `fauna`, `ui`), sin duplicar inventario, catálogo ni gestor de recetas.

| Etapa | Contenido | Criterio de "terminado" |
|---|---|---|
| 0 | Copia de seguridad, auditoría, corrección de defectos triviales | Documentos + build OK |
| 1 ✅ | Catálogo de especies en datos; 5 especies nuevas con modelo; sistema de habilidades; ecología básica (hambre, descanso, depredación, carroñeo) | Hecho: `tools/ai-test.mjs` 16/16, capturas `fauna_*`, ver `docs/FAUNA_HABILIDADES.md` (sed y sueño pendientes) |
| 2 ✅ | Objetos con peso/volumen/durabilidad/calidad; 53 objetos (recursos, herramientas, armas sin armas de fuego, munición, ropa, mochila; 62 con el equipo animal de la etapa 3); 35 recetas (44 con el equipo animal) con aprendizaje por descubrimiento y oficios; combate con arco/honda/jabalina; despiece de cadáveres | Hecho: `tools/items-test.mjs` (1142 comprobaciones, todo objeto alcanzable) y `tools/craft-test.mjs` 21/21; ver `docs/ITEMS_RECETAS.md` |
| 3 ✅ | Domesticación por niveles (habituado → bajo manejo → domesticado → equipado); equipamiento animal (9 objetos, familia F); monturas solo en gallimimus, parasaurolophus y triceratops | Hecho: `tools/doma-test.mjs` 21/21 (habituación real, ofrendas, cabestro, órdenes, cuidado en días de juego, maltrato/abandono, equipo por anatomía, carga, montura con orilla y muerte, depredadores, guardado). Ver `docs/DOMESTICACION.md`. **Sin hacer:** reproducción/crianza (opcional en el pedido), carros, animación del jinete |
| 3b 🔶 | Modelos 3D reales de fauna (GLB): **solo Parasaurolophus** como prueba de calidad (`docs/MODELOS_3D.md`, `tools/glb-test.mjs` 14/14); el resto de especies espera la aprobación del resultado | Pendiente de revisión del usuario antes de migrar las demás |
| 4+ | Pendiente: construcción, estaciones, NPC, economía (el documento llegó cortado antes de esas secciones) | — |

Licencias de ficción: se documentan en cada ficha de especie (`ficcion`).


## Etapas 4 a 12 (plan del 25-oct-2026)

Orden pensado para que cada etapa se apoye en las anteriores y se pueda comprobar por separado. Equipo de pruebas: 2 CPU, así que las pruebas con navegador se serializan (`tools/lock.sh`). Reglas de trabajo en `docs/GUIA_AGENTES.md`.

| Etapa | Contenido | Criterio de «terminado» |
|---|---|---|
| 4a | **Fauna: bípedos** — marco `src/fauna/familias/` (constructores paramétricos con esqueleto y siluetas distintas), todos los terópodos y dinosaurios basales bípedos del catálogo; Tyrannosaurus y raptor con modelo GLB | `tools/especies-test.mjs` (construcción, presupuesto, silueta distinta, simulación sin NaN) + suites existentes |
| 4b | **Fauna: cuadrúpedos y herbívoros** — saurópodos, ceratópsidos, estegosaurios, anquilosaurios, hadrosaurios, ornitópodos, paquicefalosaurios; Triceratops, Stegosaurus y Apatosaurus con GLB | idem |
| 4c | **Fauna: aéreos, acuáticos y otros** — pterosaurios, reptiles marinos, cocodrilomorfos, peces, anfibio, mamíferos; vuelo, natación y buceo | idem + movimiento por agua/aire |
| 5a ✅ | **Mundo grande** — continente de ≈ 80 km² de tierra con ecosistemas coherentes (cada formación del catálogo es una región), biomas, terreno por teselas con LOD jerárquico, mapa y minimapa | **Hecho (27-oct):** 95,6 km² de tierra / 151 km² totales, 12 provincias y 5 mares por época, terreno por teselas, mapa M, población por provincia con frontera; `tools/mundo-test.mjs` 14/14. **Sin hacer:** minimapa. Ver `docs/MAPA.md` |
| 5b 🔶 | **Flora y recursos por bioma** — flora mesozoica apropiada, nodos de minerales, arcilla, sílex, obsidiana, cobre, hierro, carbón, azufre repartidos por geología | **Parcial (27-oct):** flora distinta por bioma y 4 recursos nuevos (arcilla, obsidiana, sal, ámbar) con cuchillo de obsidiana, comprobados en `mundo-test`. **Sin hacer:** cobre, hierro, carbón, azufre |
| 6 | **Infraestructura de sistemas** — guardado versionado por registro, estructuras colocables (estaciones, contenedores, cultivos, piezas), objetos con estado (frescura, cocción, humedad) | guardar/cargar a ida y vuelta con todo lo anterior |
| 7 | **Almacenamiento, cocina y conservación, agricultura, cuero/fibras/tejidos, cerámica, metalurgia** — objetos, recetas y estaciones con progreso temporal | pruebas de cadena completa (de materia prima a producto) y de fallo |
| 8 | **Construcción modular** con soporte, colisión, estabilidad, desgaste, reparación y fuego | pruebas de colocación válida/inválida, colapso por falta de soporte, guardado |
| 9 | **Física y realismo, supervivencia ampliada y combate** — sueño, fatiga, heridas, hemorragia, fracturas, infecciones; ataques ligeros/pesados, bloqueo, esquiva, aturdimiento | pruebas de causa → efecto → recuperación |
| 10 | **Habilidades del personaje, NPC, asentamientos, facciones y economía** | simulación de varios días de juego sin NPC atascados y con flujos de recursos con origen y destino |
| 11 | **Ecosistema y simulación animal por distancia** — cerca/media/lejos, regiones descargadas con población persistente | pruebas de no teletransporte ni duplicación al cruzar niveles |
| 12 | **HUD e inventario profesionales, arquitectura y rendimiento, guardado final, documentación y verificación global** | todas las suites + informe honesto |

Estado (27-oct-2026): etapas 4a–4c y 5a hechas, 5b parcial; el usuario pidió **detenerse tras el mapa** para probarlo antes de seguir con las etapas 6 a 12.
