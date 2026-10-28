# Guía para quien trabaje en el proyecto (personas y agentes)

Proyecto: **Isla Primordial**, juego de supervivencia prehistórica en Three.js 0.186 + Vite 8, todo en español. Directorio: `/home/claude/isla-primordial`.
Antes de tocar nada lee `docs/ARQUITECTURA.md`, `docs/PLAN_EXPANSION.md` y el documento del módulo que vas a ampliar.

## Reglas de oro
1. **No recrear ni destruir.** Se amplía lo existente. No dupliques inventario (`ctx.survival.inventory`), catálogo de objetos/recetas (`src/core/items.js`), controlador de criaturas (`src/fauna/creature.js`) ni gestor de guardado.
2. **Cada módulo es una carpeta `src/<modulo>/index.js`** con `export async function create(ctx)`. Se comunican por `ctx.<modulo>` y `ctx.events`. Sin dependencias circulares ni estado duplicado.
3. **Archivos propios.** Trabajas solo en los archivos que te asigna tu encargo; si necesitas tocar uno compartido (`core/items.js`, `survival/index.js`, `ui/index.js`, `fauna/creature.js`, `fauna/species.js`…) haz cambios mínimos y quirúrgicos y anótalos en tu informe. Otros agentes trabajan a la vez en otros archivos: nunca reformatees ni reescribas archivos enteros.
4. **Nada de pruebas inventadas.** Ejecuta de verdad. Si algo no se puede comprobar aquí (GPU real, FPS reales, oído humano), dilo.
5. **Honestidad visual.** Mira tus capturas (herramienta Read sobre el PNG) antes de afirmar que algo se ve bien. Si una forma es una aproximación procedural, no la llames realista.
6. **Rendimiento.** Instancias, geometría y materiales compartidos, construcción perezosa y con presupuesto por fotograma, nada de `new` en bucles calientes, IA a intervalos, LOD. Máquina de pruebas modesta.
7. **Todo el texto visible va en español.** Identificadores en español o inglés técnico, como el código existente.
8. **Datos en archivos de datos.** Objetos nuevos → `src/core/items/<familia>.js` (ver `src/core/items/README.md` si existe); especies → `src/fauna/familias/`.

## Entorno (importante)
- **Solo 2 CPU y 8 GB.** Las pruebas con navegador (Playwright + vite + render por software) son pesadas: ejecútalas SIEMPRE con `tools/lock.sh` (serializa con `flock`), p. ej. `tools/lock.sh node tools/ai-test.mjs`. Usa `?quality=low`, viewport pequeño y pocas capturas; no lances varias a la vez.
- Playwright: `/opt/npm-tools/node_modules/playwright` (ya instalado, no reinstalar). Chromium sin GPU: WebGL por software (lento pero determinista).
- Servidores en segundo plano: `setsid nohup ... &`. **Nunca `pkill -f` con un patrón que coincida con tu propio comando.**
- La red del shell solo llega a raw.githubusercontent.com, npm y PyPI. WebFetch/WebSearch sirven para consultar páginas públicas.
- Capturas: `node tools/shot.mjs --list` / `--preset nombre --out shots/xxx` (PNG + report.json). Mira los PNG con Read.
- Arnés de pruebas en navegador: `?debug=1&ui=0&quality=low` expone `window.__game` (`g.ctx`, `g.advance(n, dt)`).

## Suites existentes que NO deben romperse (ejecutar con `tools/lock.sh`)
| Prueba | Comando | Resultado esperado |
|---|---|---|
| Modelo 3D | `node tools/glb-test.mjs` | 14/14 |
| IA y habilidades | `node tools/ai-test.mjs` | 16/16 |
| Crafteo | `node tools/craft-test.mjs` | 21/21 |
| Domesticación | `node tools/doma-test.mjs` | 21/21 (una pasada de seis dio 19/21 con dos escenarios inestables que pasan solos) |
| Objetos y recetas | `node tools/items-test.mjs` | 0 fallos (no usa navegador) |
| Audio | `node tools/audio-test.mjs` | 0 errores (no usa navegador) |
| Build | `npx vite build` | OK |
Si cambias algo que las hace fallar por una razón legítima (p. ej. un bioma renombrado), actualiza la prueba y explícalo.

## Entregable de cada encargo
Código + pruebas automáticas nuevas (`tools/<tema>-test.mjs`, mismo estilo que las existentes) + documento corto en `docs/` + informe final con: archivos creados/modificados, qué funciona de verdad (con cifras reales de las pruebas), qué NO está hecho o es aproximado, y cómo probarlo en el navegador.
