# Supervivencia completa (fase F2 del GDD)

Lo que pide el GDD en §6 «Supervivencia y progresión» e «Inventario y objetos» y que faltaba: descanso y heridas, conservación de la comida, contenedores, comparación de equipo, reglas explícitas de pérdida al morir, dificultad y clima con refugio. Cada sistema está en su propio archivo, se apoya en los que ya existían (inventario, recetas, interactuables, guardado) y se guarda con la partida. Prueba automática: `tools/lock.sh node tools/f2-test.mjs` (escenarios listados al final).

## Teclas nuevas
| Tecla | Acción |
|---|---|
| **F** con una pieza en la barra | Vista previa de colocación (verde: cabe; roja: dice por qué no) |
| **Clic** / **R** o rueda / **clic derecho** o **Esc** | Colocar / girar 15° / cancelar |
| **E** sobre una cama, cesta, cofre o vasija | Dormir / abrir el contenedor |
| **X** sobre algo construido | Recoger (devuelve el objeto; los contenedores, vacíos) |
| **Z** | Dormir: en tu cama si estás junto a ella, si no en el suelo. Cualquier tecla de movimiento, E o Esc despierta |

## 1. Piezas colocables (`src/construccion/`)
Base de la construcción del F3: el mismo módulo colocará cimientos, paredes y techos.
- **Cama de hojas** (fibra 12, hoja grande 4, rama 4; se sabe desde el inicio), **cesta** (8 casillas; fibra 14, rama 2; desde el inicio), **refugio de ramas** (faldón con techo; rama 10, hoja 8, cuerda 2, madera 4, con algo que corte; se aprende al hacer la cama), **cofre de madera** (16 casillas; madera 14, cuerda 2, resina 1, con hacha y Talla 1; se aprende al hacer la cesta), **vasija de barro** (6 casillas que conservan la comida 2,5 veces más; arcilla 4 y fibra 1 en la fogata; se aprende al tener arcilla).
- Validación: tierra firme en las nueve muestras de la huella, desnivel máximo por pieza, sin árboles ni rocas dentro, sin chocar con otra construcción, sin quedar encima del jugador, a 6 m como mucho. La pieza se inclina con el terreno.
- Colisiones: el cofre, la cesta y la vasija son sólidos; el refugio tiene los horcones y el faldón trasero (se entra por delante); la cama se pisa.
- Bajo cada pieza (y bajo cada fogata) se abre un **claro**: no crece hierba ni matorral atravesándola. Al recogerla, vuelven.
- Mallas por código con las fotos de corteza y frondas de la flora; tablas, cestería, barro y paja dibujados por código.

## 2. Descanso y sueño (`src/survival/descanso.js`)
- Estadística **sueño** (barra violeta): de 100 a 0 en 1,6 días de juego despierto (correr cansa un 50 % más).
- **Cansado** (< 25): la energía se recupera al 60 % y como mucho hasta 80; párpados pesados en pantalla. **Agotado** (< 10): energía al 35 % y tope de 45, y la vida no se recupera sola.
- **Dormir** acelera el tiempo de juego ×40 (una noche ≈ 14 s). De noche duerme hasta el alba; de día, hasta descansar. En la cama recupera el sueño en 6 h y algo de vida; en el suelo tarda casi el doble y apenas cura. Comida y agua se gastan a medio ritmo. El fuego y la conservación de la comida siguen el tiempo de juego.
- No deja dormir: con un depredador salvaje cerca, en el agua, montado, sangrando o sin sueño. **Despierta**: el alba, descansar, una amenaza que se acerca, el daño, el frío, el hambre, la sed o una tecla.
- La cama en la que duermes es tu **punto de reaparición**: al morir se elige «en tu cama» o «en la playa».

## 3. Contenedores (`src/ui/contenedor.js` + `construccion`)
- E abre el panel: mochila a la izquierda y contenedor a la derecha. Clic pasa la casilla entera, Mayús + clic la mitad, también se arrastra. «Guardar todo» deja la barra rápida (1–9); «Tomar todo» saca lo que quepa por peso y volumen.
- Las casillas conservan durabilidad, calidad, remiendos y frescura. Se cierra con E, Tab, Esc o al alejarse.
- **Arreglado de paso:** la misma pulsación de E que abría un panel (el del animal también) lo cerraba en el mismo instante.

## 4. Conservación de la comida (`src/survival/frescura.js`)
- Cada casilla perecedera lleva su **frescura**: la carne cruda se pudre en 0,6 días de juego, las bayas en 1,5, la carne cocida en 2 y la **carne seca** en 20 (carne cruda 2 + sal 1 en la fogata, Cocina 1; da 6 de sed). Al apilar se promedia por cantidad. A cero se convierte en **restos podridos** (no se comen; abono para los cultivos del F3).
- Comer algo pasado (< 60 %) alimenta un 80 %; casi podrido (< 25 %), la mitad y puede intoxicar (45 %). La carne cruda intoxica a veces (12 %).
- Barra fina de frescura en la casilla y, en el detalle, estado y tiempo que le queda.

## 5. Heridas (`src/survival/heridas.js`)
- **Sangrado** (niveles 1–3): sobre todo por mordiscos y zarpazos (por golpes romos, mucho menos; la armadura lo reduce). Quita 0,12 de vida por segundo y nivel; el nivel 1 para solo a los 45 s; los graves bajan de nivel despacio. El **vendaje** lo corta.
- **Fractura**: por caídas altas, pisotones, embestidas y coletazos. Cojeas (68 % de velocidad), no corres y saltas poco durante un día de juego. La **férula** (rama 2, cuerda 1, hoja 1) la deja en un tercio y cojeas menos (85 %).
- **Intoxicación**: náuseas que gastan agua y comida y algo de vida; pasa sola y beber la acorta.
- Sangrando o intoxicado no se recupera vida sola. Los estados se ven en el HUD (sobre las barras) con su ayuda. Se guardan y se borran al morir.

## 6. Clima y refugio (`src/survival/clima.js`)
- **Mojado** sube con la lluvia (6 puntos/s con lluvia fuerte) y al meterse en el agua; la capa impermeable deja pasar un 25 %. Bajo un techo construido no llueve; bajo un árbol, la mitad.
- Mojado enfría hasta 8 °C; la tormenta, 3 °C más si no hay techo. Se seca al aire (más con sol) y mucho más deprisa junto al fuego.
- Una fogata bajo techo no se consume más deprisa con la lluvia.

## 7. Dificultad (`src/survival/dificultad.js`)
Se elige al empezar («Nueva partida»), se cambia en Ajustes y se guarda con la partida.
| | Consumo (hambre, sed, sueño) | Daño recibido | Recolección | Al morir |
|---|---|---|---|---|
| Fácil | ×0,65 | ×0,6 | ×1,5 | conservas la ropa puesta y la barra rápida; la bolsa vieja se suma a la nueva |
| Normal | ×1 | ×1 | ×1 | todo a la bolsa; morir otra vez antes de recogerla la pierde |
| Difícil | ×1,3 | ×1,4 | ×1 | como normal y la bolsa desaparece al cabo de un día de juego |

## 8. Reglas de muerte
- La bolsa queda donde caíste, **marcada en el mapa** (con las horas que le quedan en difícil) y se recoge con E. Las reglas se dicen en la pantalla de muerte junto con lo que se perdió.
- **Arreglado:** la bolsa se borraba al reaparecer (no se podía recuperar nada) y no se guardaba con la partida. Ahora sigue ahí y se guarda.

## 9. Comparar equipo
En el detalle de un objeto del inventario: la ropa se compara con lo puesto en su ranura y las herramientas y armas con lo que llevas en la mano (daño, golpes por segundo, alcance, penetración, aturdimiento, armadura, abrigo, ruido, carga, peso, durabilidad), con subidas en verde y bajadas en rojo.

## 10. El mundo recuerda lo talado
Los árboles talados y las rocas picadas se guardan con la partida (antes volvían al cargar). Rebrotan a los tres días de juego, al recargarse su zona, salvo dentro de un claro de construcción.

## Pruebas (`tools/f2-test.mjs`)
Piezas y recetas · colocar con la vista previa · validación (agua, pendiente, árbol, otra pieza, jugador) · colisiones · recoger con X · contenedor (casillas, apilado, durabilidad, peso) · techo · guardado de piezas · sueño (bajada y efectos) · dormir en la cama de noche · dormir en el suelo · amenazas y daño despiertan · reaparición en la cama · guardado del sueño · frescura (orden y podredumbre) · frescura al apilar, vasija y guardado · comer según frescura · carne seca · sangrado y vendaje · fracturas y férula · intoxicación y guardado de heridas · mojado (techo, árbol, capa, frío, secado) · fogata bajo techo · dificultad · muerte normal (bolsa, E, guardado, segunda muerte) · muerte fácil y difícil · árbol talado guardado · panel de contenedor (con interfaz) · comparar equipo (con interfaz).

## Capturas (`docs/capturas/supervivencia/`)
| Archivo | Qué se ve |
|---|---|
| `piezas_colocables.jpg`, `campamento.jpg` | las cinco piezas y un campamento con fogata |
| `vista_previa_valida.jpg`, `vista_previa_invalida.jpg` | colocación en verde y en rojo con el motivo |
| `cansado.jpg`, `durmiendo.jpg` | párpados pesados con poco sueño y la pantalla de dormir |
| `estados_heridas_clima.jpg` | estados sobre las barras con su ayuda (sangrado grave, hueso roto, empapado) y la barra de sueño |
| `panel_contenedor.jpg`, `comparar_equipo.jpg` | panel mochila ↔ cofre y un peto de osteodermos comparado con el chaleco de cuero puesto |
| `elegir_dificultad.jpg`, `mapa_bolsa_cama.jpg`, `muerte_reglas.jpg` | elegir dificultad, bolsa y cama en el mapa, pantalla de muerte con las reglas |

## Límites conocidos
- Las piezas no tienen vida ni se deterioran todavía (llega con la construcción modular del F3, junto con reparación y demolición con reembolso parcial).
- El refugio protege de la lluvia solo bajo su faldón; no hay paredes.
- Dormido, el reloj se acelera pero las criaturas se mueven a su ritmo normal (14 s reales de noche): la amenaza se comprueba durante ese tiempo, no se simulan las 9 horas de fauna.
- La comida tirada en el suelo no se estropea; solo la de la mochila y la de los contenedores.
- Las capturas son de render por software; la interfaz nueva no se probó con jugadores.
- En `src/construccion/` ya están `modular.js` y `modular-colocar.js` (datos, mallas y reglas de apoyo de la construcción modular del F3), **todavía sin conectar al juego**: no se cargan ni se pueden usar hasta la próxima entrega.
