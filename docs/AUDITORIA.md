# Auditoría del proyecto (antes de la expansión)

Fecha: 2026-10-21. Copia de seguridad: `backups/isla-primordial-v1-antes-expansion.tar.gz` (fuera de la carpeta del proyecto).
Método: lectura del código, compilación (`vite build`), pruebas con Chromium headless (render por software, SwiftShader) y capturas. **No se midió en GPU real.**

## Estado real por sistema

| Sistema | Estado | Evidencia |
|---|---|---|
| Mundo (terreno, agua, biomas) | Funciona | capturas, `getHeight` única fuente de verdad |
| Flora (instanciada, viento, tala) | Funciona | tala probada: árbol cae, suelta madera |
| Jugador (movimiento, colisión, nado, golpes) | Funciona | prueba de movimiento y colisión |
| Primera persona (brazos, 4 herramientas) | Funciona; puños poco logrados | capturas `jugador_vm_*` |
| Fauna (5 especies, esqueleto, IK, IA) | Funciona | persecución, huida, embestida, botín verificados |
| Supervivencia (stats, inventario 30, fogata, cocina, guardado v1, muerte) | Funciona | prueba de punta a punta |
| Fabricación | ~~Básica: 7 recetas~~ → Etapa 2: 35 recetas, aprendizaje, oficios y calidad | `core/items.js`, `survival/saber.js`, `tools/craft-test.mjs` |
| Objetos | ~~16 objetos sin estado~~ → Etapa 2: 53 objetos con peso, volumen, durabilidad, calidad y reparación; Etapa 3: +9 de equipo animal | `core/items.js`, `docs/ITEMS_RECETAS.md` |
| UI (HUD, mochila, mapa, menús, tutorial) | Funciona | capturas `ui_*` |
| Audio (34 recetas sintetizadas) | Medido, no escuchado | `tools/audio-test.mjs` |
| Efectos (fuego, lluvia, partículas) | Funciona | capturas `fx_*` |

## Defectos conocidos

1. Oclusión ambiental (AO) desactivada (defecto de render sin resolver).
2. La antorcha creaba **dos fuegos** (uno en `survival` y otro en el viewmodel). Corregido en la etapa 0.
3. Puños en primera persona poco convincentes.
4. El guardado solo guarda la fauna **propia o habituada** (etapa 3); el resto de la fauna salvaje reaparece. ~~Sin conocimiento ni migración~~ → Etapa 2: formato v2 (equipo, durabilidad, saber) con migración desde v1 probada.
5. ~~Las criaturas solo reaccionan al jugador~~ → Etapa 1: cazan, tienen hambre/energía, carroñean y se alertan. Siguen sin beber ni dormir.
6. Sin sonido de pasos de criaturas. ~~Sin alertas hacia la UI~~ → Etapa 1: marcas en la brújula + lista de alertas.
7. Rendimiento en GPU real sin medir.

## Funcionalidad pedida y ausente (secciones 1–7 del documento recibido)

- Catálogo extenso de especies (hay 5; pedido final: >200; primera versión: conjunto reducido y funcional).
- ~~Habilidades de especie conectadas a la IA, domesticación por niveles, monturas~~ → Etapas 1 y 3. **Crianza/reproducción: no implementada** (era opcional).
- ~~Catálogo de objetos con peso, durabilidad, estado; recursos naturales, herramientas primitivas, armas, munición, vestimenta~~ → Etapa 2. ~~Pendiente: equipamiento animal (familia F)~~ → Etapa 3.
- ~~Sistema de aprendizaje, progresión por uso, calidad~~ → Etapa 2.
- ~~Tabla de aprovechamiento por especie~~ → Etapa 2 (`COSECHA`, despiece con herramienta).
- **El documento llegó cortado** en la sección 7F: construcción, estaciones, NPC, facciones, economía y progresión no se pudieron leer.


## Nota del 27-oct-2026 (mapa grande)

El mundo de la auditoría (isla de 1,5 km) fue sustituido por el continente de `docs/MAPA.md`. Las pruebas `nado`, `especies` y `glb` buscaban terreno cerca del origen del mapa antiguo y se adaptaron; los resultados y las limitaciones del mapa están en ese documento.
