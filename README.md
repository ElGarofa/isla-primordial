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
| Interactuar (beber, recoger, fogata) | E |
| Usar objeto (comer, colocar fogata) | F |
| Inventario y fabricación | Tab |
| Mapa | M |
| Barra rápida | 1–9 |
| Pausa | Esc |

## Qué incluye

- Isla de 1.5 km con playas, selva, praderas, montaña y nieve; océano con olas; ciclo día/noche de 25 min; lluvia y tormentas.
- Flora instanciada con viento (palmeras, selva, coníferas, arbustos, helechos, hierba, rocas); los árboles se talan.
- Cinco especies con esqueleto, marcha con IK y comportamiento propio: raptor (caza en manada), compsognatus (huye), triceratops (embiste si lo atacás), braquiosaurio (pasivo), pteranodon (vuela en círculos).
- Supervivencia: vida, hambre, sed, temperatura, resistencia; inventario, fabricación (hacha, pico, lanza, antorcha, fogata), cocina, muerte con bolsa de pertenencias, guardado automático.
- Brazos y herramientas en primera persona con animación.
- Audio sintetizado en vivo (pasos, rugidos, clima, música adaptativa) e interfaz en español.

## Herramientas de desarrollo

- `?debug=1` en la URL expone `window.__game`.
- `node tools/shot.mjs --list` / `--preset nombre` genera capturas con Chromium headless (por software, lento).
- `node tools/audio-test.mjs` mide todas las recetas de audio.
- `docs/ARQUITECTURA.md` describe los módulos; `docs/RUBRICA_AAA.md` la rúbrica visual.

## Limitaciones conocidas

- No es calidad Ark / AAA de estudio: es una base jugable con buen nivel visual para un proyecto 100 % procedural.
- La oclusión ambiental (AO) está desactivada por un defecto sin resolver.
- El rendimiento (60 fps) y el presupuesto de draw calls solo se verificaron con render por software; en GPU real falta medirlo. La calidad se puede bajar con `?quality=low`.
- El audio se verificó con métricas, no escuchándolo.
