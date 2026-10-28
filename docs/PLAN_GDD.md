# Plan de implementación del GDD (mecánicas que faltan)

Orden: el de la hoja de ruta del GDD (§18). Cada sistema se hace **de a uno**, se prueba en partida (prueba automática + capturas) y recién entonces se marca. Reglas del GDD que se respetan: no duplicar sistemas (todo se apoya en los módulos que ya existen), datos separados de la lógica, guardado de todo estado nuevo, informe honesto de lo que queda pendiente.

Estado: ☐ pendiente · ◐ en curso · ☑ hecho y probado

## F2 · Supervivencia completa
| Sistema | Dónde | Qué hace | Prueba |
|---|---|---|---|
| ☐ Descanso y sueño | `survival/descanso.js` | estadística de **sueño**; dormir en una cama (o en el suelo, peor) acelera el tiempo hasta el amanecer o hasta descansar; despierta si se acerca un depredador; la cama fija el punto de reaparición | dormir con y sin cama, despertar por amenaza, guardado |
| ☐ Heridas | `survival/heridas.js` | **sangrado** (mordiscos y zarpazos) y **fractura** (caídas): pierden vida o frenan; el vendaje corta el sangrado, la férula acelera la fractura | daño con sangrado, curación, caídas |
| ☐ Conservación | `survival/frescura.js` | la comida perecedera se estropea (carne cruda → podrida); la cocinada dura más; la **carne seca** (secadero + sal) casi no se estropea | paso del tiempo, apilado de frescuras |
| ☐ Contenedores | `construccion/contenedores.js` + UI | cesta y cofre colocables con casillas; transferir a/desde la mochila; se guardan | meter/sacar, peso, guardado |
| ☐ Dificultad | ajustes + `survival` | fácil / normal / difícil: consumo, daño recibido, pérdida al morir | multiplicadores aplicados |
| ☐ Comparar equipo | UI inventario | al mirar un objeto, diferencias con lo equipado en esa ranura o mano | captura |
| ☐ Reglas de muerte | `survival` + UI | la bolsa se pierde si mueres otra vez antes de recogerla; se dice en pantalla | morir dos veces |
| ☐ Clima y refugio | `survival` | lluvia → mojado → más frío; bajo techo (construcción) no se moja | lluvia con y sin techo |

## F3 · Construcción y colonia
| Sistema | Dónde | Qué hace | Prueba |
|---|---|---|---|
| ☐ Construcción modular | `construccion/` | cimientos, suelos, paredes (lisa, puerta, ventana), puertas, techos, escaleras, rampas, vallas, empalizadas, pilares; madera / piedra / paja; vista previa verde/roja, giro, encaje a la rejilla y validación de apoyos; costes, demolición (reembolso), reparación; colisiones con el jugador y las criaturas; guardado | colocar/encajar/validar, colisión, demoler, guardar y cargar |
| ☐ Estaciones | `construccion/estaciones.js` | banco de trabajo, curtidor, secadero, horno de barro: recetas que las piden | fabricar con y sin estación |
| ☐ Habitantes (NPC) | `colonia/` | humanos procedurales con nombre, oficio, habilidades, necesidades (hambre, sueño), inventario; rescate y contratación; trabajos (talar, picar, recolectar, llevar al almacén, cocinar, vigilar) con prioridades; mensajes de bloqueo | tareas, necesidades, guardado |
| ☐ Agricultura | `colonia/cultivos.js` | parcela, semillas, riego y lluvia, etapas de crecimiento, cosecha; los habitantes pueden cultivar | crecer con/sin agua |

## F4 · Cooperativo temprano
| ☐ Dos jugadores | `red/` + `server/coop.mjs` | partida alojada: el anfitrión manda (criaturas, mundo); el invitado ve y es visto, comparte hora y clima, construcción y criaturas sincronizadas; desconexión limpia | dos navegadores headless en la misma partida |

## F5 · Mundo reactivo
| ☐ Facciones y reputación | `mundo/facciones.js` | tribus con aldeas (construidas con las piezas de construcción), reputación por facción y estados (aliada → guerra), memoria de acciones | acciones que suben/bajan reputación |
| ☐ Comercio y misiones | `mundo/comercio.js`, `mundo/misiones.js` | trueque con precios por facción; misiones (traer, cazar, rescatar) | completar misión, comerciar |
| ☐ Hostilidad e incursiones | `mundo/incursiones.js` | facciones hostiles atacan la base | defensa |
| ☐ Ecosistema y registro | `mundo/registro.js` | caza intensiva baja la población local; asentamientos prosperan o decaen | simulación por tiempo |

## Resto del GDD
| ☐ Crianza | `fauna/crianza.js` | pareja domesticada + comida + espacio → huevo/cría que crece; tope de población | nacimiento y crecimiento |
| ☐ Exploración | `mundo/lugares.js` | lugares de interés: cuevas, ruinas, nidos, refugios; marcas en el mapa | descubrir y marcar |
| ☐ Combate | `player/combate.js` | golpe ligero/fuerte, bloqueo, esquiva, coste de resistencia; avisos de ataque de criaturas | daño y resistencia |
| ☐ Accesibilidad | UI | reasignar controles, escala de interfaz, subtítulos de sonidos importantes, tutorial opcional | capturas |
