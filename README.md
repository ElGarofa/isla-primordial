# Isla Primordial

Juego de supervivencia en primera persona hecho con Three.js + Vite. Todo (terreno, flora, dinosaurios, texturas, sonido y música) se genera por código: no hay assets externos.

## Cómo jugarlo

```bash
npm install
npm run dev        # http://localhost:5173
```

Producción: `npm run build` y `npm run preview`.

## Controles

| Acción | Tecla |
|---|---|
| Moverse / correr / agacharse / saltar | W A S D / Shift / Ctrl / Espacio |
| Golpear / usar | Clic izquierdo |
| Interactuar (beber, recoger, fogata; ofrecer comida o atender a un animal) | E |
| Montar / desmontar un animal domesticado y equipado | G |
| Montado: trote / galope / frenar / desviar | W / Mayús / S / A D |
| Usar objeto (comer, colocar fogata) | F |
| Inventario y fabricación | Tab |
| Mapa | M |
| Barra rápida | 1–9 |
| Pausa | Esc |

## Qué incluye

- Isla de 1.5 km con playas, selva, praderas, montaña y nieve; océano con olas; ciclo día/noche de 25 min; lluvia y tormentas.
- Flora instanciada con viento (palmeras, selva, coníferas, arbustos, helechos, hierba, rocas); los árboles se talan.
- Diez especies con esqueleto, marcha con IK, sentidos propios y habilidades: Tyrannosaurus (rastrea, acecha, carroñea), raptor (acecha y embosca), compsognatus, gallimimus (huyen en grupo), parasaurolophus (vigía que alerta a la manada y al jugador), stegosaurus y ankylosaurus (golpe de cola), triceratops (formación y embestida), braquiosaurio (pisoteo), pteranodon (vuela). Catálogo de 162 especies en datos (`?eco=hell_creek|morrison|nemegt` filtra por ecosistema coherente). Ver `docs/FAUNA_HABILIDADES.md`.
- Supervivencia: vida, hambre, sed, temperatura, resistencia; mochila con peso y volumen, 62 objetos con durabilidad y calidad, 44 recetas que se **descubren** (por tener un material, despiezar, fabricar o subir de oficio), cuatro oficios con nivel, ropa con armadura/abrigo/ruido, arco, honda y jabalina, despiece de cadáveres con cuchillo o hacha, cocina, muerte con bolsa de pertenencias, guardado automático (v2, migra partidas v1). Ver `docs/ITEMS_RECETAS.md`.
- **Domesticación por niveles** (Etapa 3): salvaje → alertado → habituado → bajo manejo → domesticado → equipado. Se avanza con presencia tranquila, ofrendas de la comida de cada especie, cabestro y cuidado durante días de juego; maltratar o abandonar hace perder niveles; los grandes depredadores nunca pasan de habituados y siguen cazando con hambre. Equipo según la anatomía (sillas, arnés, alforjas, protección) y **montura** en gallimimus, parasaurolophus y triceratops. Panel del animal con órdenes (seguir / quedarse / libre), equipo y carga. Ver `docs/DOMESTICACION.md`.
- Brazos y herramientas en primera persona con animación.
- Audio sintetizado en vivo (pasos, rugidos, clima, música adaptativa) e interfaz en español.

## Herramientas de desarrollo

- `?debug=1` en la URL expone `window.__game`.
- `node tools/shot.mjs --list` / `--preset nombre` genera capturas con Chromium headless (por software, lento).
- `node tools/audio-test.mjs` mide todas las recetas de audio.
- `node tools/ai-test.mjs [regex]` prueba por simulación la IA y las habilidades de la fauna (16 escenarios).
- `node tools/items-test.mjs` valida los datos de objetos y recetas y que todo objeto se pueda conseguir desde cero.
- `node tools/craft-test.mjs [regex]` prueba en navegador las 35 recetas, combate a distancia, ropa, peso, reparación, despiece y guardado (21 escenarios).
- `node tools/doma-test.mjs [regex]` prueba por simulación la domesticación de punta a punta: habituación, ofrendas, cabestro, órdenes, cuidado en días de juego, maltrato y abandono, equipo por anatomía, carga, liberar, montura (orilla y muerte), depredadores, guardado (21 escenarios).
- `node tools/gen-items-doc.mjs` regenera `docs/ITEMS_RECETAS.md` desde los datos; `node tools/gen-doma-doc.mjs` hace lo mismo con `docs/DOMESTICACION.md`.
- `docs/ARQUITECTURA.md` describe los módulos; `docs/RUBRICA_AAA.md` la rúbrica visual.

## Limitaciones conocidas

- No es calidad Ark / AAA de estudio: es una base jugable con buen nivel visual para un proyecto 100 % procedural.
- La oclusión ambiental (AO) está desactivada por un defecto sin resolver.
- El rendimiento (60 fps) y el presupuesto de draw calls solo se verificaron con render por software; en GPU real falta medirlo. La calidad se puede bajar con `?quality=low`.
- El audio se verificó con métricas, no escuchándolo.
- Sin reproducción ni crianza de animales (era opcional en el pedido), sin carros, y el jinete va en primera persona sin animación ni modelo propio. Las pruebas de domesticación son simuladas: no se probó con jugadores humanos.
- No existen todavía construcción, estaciones de trabajo, NPC, facciones ni economía: esas secciones del documento de ampliación llegaron cortadas y no se leyeron.
