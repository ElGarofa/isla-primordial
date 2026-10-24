# Plan de expansión por etapas

Regla: ampliar los módulos existentes (`core/items.js`, `survival`, `fauna`, `ui`), sin duplicar inventario, catálogo ni gestor de recetas.

| Etapa | Contenido | Criterio de "terminado" |
|---|---|---|
| 0 | Copia de seguridad, auditoría, corrección de defectos triviales | Documentos + build OK |
| 1 ✅ | Catálogo de especies en datos; 5 especies nuevas con modelo; sistema de habilidades; ecología básica (hambre, descanso, depredación, carroñeo) | Hecho: `tools/ai-test.mjs` 16/16, capturas `fauna_*`, ver `docs/FAUNA_HABILIDADES.md` (sed y sueño pendientes) |
| 2 ✅ | Objetos con peso/volumen/durabilidad/calidad; 53 objetos (recursos, herramientas, armas sin armas de fuego, munición, ropa, mochila; 62 con el equipo animal de la etapa 3); 35 recetas (44 con el equipo animal) con aprendizaje por descubrimiento y oficios; combate con arco/honda/jabalina; despiece de cadáveres | Hecho: `tools/items-test.mjs` (1142 comprobaciones, todo objeto alcanzable) y `tools/craft-test.mjs` 21/21; ver `docs/ITEMS_RECETAS.md` |
| 3 ✅ | Domesticación por niveles (habituado → bajo manejo → domesticado → equipado); equipamiento animal (9 objetos, familia F); monturas solo en gallimimus, parasaurolophus y triceratops | Hecho: `tools/doma-test.mjs` 21/21 (habituación real, ofrendas, cabestro, órdenes, cuidado en días de juego, maltrato/abandono, equipo por anatomía, carga, montura con orilla y muerte, depredadores, guardado). Ver `docs/DOMESTICACION.md`. **Sin hacer:** reproducción/crianza (opcional en el pedido), carros, animación del jinete |
| 4+ | Pendiente: construcción, estaciones, NPC, economía (el documento llegó cortado antes de esas secciones) | — |

Licencias de ficción: se documentan en cada ficha de especie (`ficcion`).
