# Objetos, recetas y aprendizaje (Etapas 2 y 3)

> Documento generado por `node tools/gen-items-doc.mjs` desde `src/core/items.js` (única fuente de verdad). No editar a mano.
> 67 objetos · 45 recetas · 10 tablas de despiece.

## Cómo funciona

- **Un solo catálogo** (`core/items.js`, datos puros que también importan las pruebas en Node). El inventario, las recetas, la recolección y el despiece leen de él; no hay un segundo gestor.
- **Peso y volumen.** La mochila base carga **60 kg** y **150 L**. El peso es un límite blando: por encima de la capacidad vas más lento (hasta −45 % de velocidad, a 1,6× la capacidad ya no entra nada más). El volumen es un límite duro. La mochila de cuero suma +30 kg y +60 L.
- **Durabilidad y estado.** Cada herramienta, arma y prenda es una instancia con `dur`, `cal` y `rep`. Se gasta al usarla (más si es la herramienta equivocada) y se rompe a 0. Estados: Nuevo > 75 % · Usado > 40 % · Desgastado > 15 % · Casi roto.
- **Calidad** (al fabricar): Tosca (×0.85 efecto, ×0.8 durabilidad) · Normal (×1 efecto, ×1 durabilidad) · Buena (×1.12 efecto, ×1.25 durabilidad) · Excelente (×1.25 efecto, ×1.5 durabilidad). Sale de tu nivel de oficio frente al que pide la receta, más un poco de azar.
- **Reparar.** Consume los materiales de la ficha del objeto y devuelve un 40 % de la durabilidad máxima; cada reparación resta un 10 % de ese máximo (tope de 4 remiendos).
- **Ropa.** Cinco ranuras (Cabeza, Torso, Piernas, Pies, Espalda). La armadura reduce el daño de las criaturas con `A/(A+30)` y desgasta una prenda al azar; no protege del frío, el hambre ni las caídas. El abrigo sube la temperatura corporal con frío; algunas piezas cambian el ruido que haces (lo oyen las criaturas).
- **Armas.** Daño, alcance, velocidad, penetración (reduce la coraza natural de la criatura golpeada), aturdimiento y ruido salen de la ficha. Arco y honda gastan munición (con probabilidad de romperse al impactar; si no, queda en el suelo); la jabalina se arroja y se recoge con la durabilidad que le queda.
- **Aprendizaje.** No conoces todas las recetas. Se descubren **por tener** un material, **por despiezar** una especie, **por fabricar** algo previo o **por nivel de oficio** (Talla, Cuero, Caza, Cocina; niveles 0–5 a 0 / 15 / 45 / 110 / 230 / 420 XP). Las recetas por descubrir aparecen como pistas.
- **Despiece.** Los cadáveres ya no sueltan botín solos: se usa "Despiezar" con un cuchillo (cuero, hueso, tendón…) o un hacha (cuerno, osteodermos). A mano solo se saca carne (la mitad). Lo que otros animales hayan devorado reduce la carne. Dura más que antes y desaparece poco después de despiezado.
- **Equipo animal (familia F).** Cabestro y collar para manejar animales ya confiados; arnés, sillas (ligera, de transporte, reforzada), alforjas, bolsas y protección. Qué admite cada especie depende de su anatomía (`montura` en `fauna/catalogo.js`): ver `docs/DOMESTICACION.md`. Se equipa desde el panel del animal, no desde la ropa del jugador.
- **Partidas antiguas (v1)** se migran al cargar: los objetos reciben durabilidad completa y calidad normal, y se recalculan las recetas conocidas.

## Oficios

- **Talla y carpintería** (`talla`): Herramientas de piedra, madera y hueso.
- **Cuero y costura** (`cuero`): Despiece, curtido, ropa y mochilas.
- **Caza y proyectiles** (`caza`): Arcos, hondas, flechas y jabalinas.
- **Cocina y primeros auxilios** (`cocina`): Cocinar y vendar.
- **Manejo de animales** (`manejo`): Habituar, ganar confianza, domar y equipar criaturas. Se aprende tratando con ellas, no fabricando.

## Familia A — Recursos naturales y materiales

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Madera | 0.6 kg | 0.5 L | pila 100 | Troncos y ramas resistentes. |
| Rama | 0.15 kg | 0.25 L | pila 60 | Vara recta y flexible: flechas, arcos y mangos. |
| Corteza | 0.08 kg | 0.12 L | pila 60 | Tiras de corteza; se deshilachan en fibra. |
| Resina | 0.05 kg | 0.03 L | pila 30 | Savia pegajosa que endurece: sirve de pegamento. |
| Liana | 0.06 kg | 0.08 L | pila 60 | Enredadera larga y fuerte de la selva. |
| Hoja grande | 0.03 kg | 0.1 L | pila 40 | Hoja ancha y resistente. |
| Fibra | 0.03 kg | 0.04 L | pila 200 | Fibras vegetales trenzables. |
| Piedra | 1.2 kg | 0.5 L | pila 100 | Roca pesada, útil para herramientas. |
| Pedernal | 0.3 kg | 0.15 L | pila 50 | Produce chispas al golpearlo. |
| Cuero | 0.8 kg | 0.6 L | pila 50 | Piel de criatura lista para trabajar. |
| Hueso | 0.5 kg | 0.4 L | pila 50 | Hueso duro, ideal para armas. |
| Grasa | 0.3 kg | 0.25 L | pila 30 | Grasa animal: impermeabiliza y conserva. |
| Tendón | 0.05 kg | 0.03 L | pila 40 | Cordón elástico y muy resistente. |
| Pluma | 0.01 kg | 0.03 L | pila 80 | Plumas para dar estabilidad a las flechas. |
| Diente grande | 0.08 kg | 0.04 L | pila 30 | Diente aserrado de un gran depredador. |
| Cuerno | 1.4 kg | 0.8 L | pila 10 | Cuerno macizo de un herbívoro acorazado. |
| Osteodermo | 1.1 kg | 0.6 L | pila 20 | Placa ósea de la armadura de un anquilosaurio. |
| Arcilla | 1 kg | 0.5 L | pila 50 | Barro fino y pegajoso de los pantanos: se moldea y se cuece. |
| Obsidiana | 0.4 kg | 0.2 L | pila 40 | Vidrio volcánico negro: se talla en filos más cortantes que la piedra. |
| Sal | 0.15 kg | 0.08 L | pila 60 | Costras de sal de playas y salares: conserva la carne. |
| Ámbar | 0.05 kg | 0.03 L | pila 30 | Resina fosilizada de los bosques fríos: dorada, dura y rara. |
| Cuerda | 0.1 kg | 0.08 L | pila 40 | Cuerda trenzada de fibra o liana. |

## Familia B — Herramientas primitivas

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Hacha de piedra | 2.2 kg | 1.6 L | dur 70 · daño 14 · [talar, contundente] · repara con 1× Piedra, 1× Fibra | Tala árboles con eficacia. |
| Pico de piedra | 2.4 kg | 1.6 L | dur 70 · daño 10 · [picar, contundente] · repara con 1× Piedra, 1× Fibra | Rompe rocas y mena. |
| Cuchillo de piedra | 0.3 kg | 0.2 L | dur 45 · daño 8 · [corta] · repara con 1× Piedra | Filo tosco para cortar y despiezar. |
| Cuchillo de hueso | 0.25 kg | 0.2 L | dur 40 · daño 9 · [corta] · repara con 1× Hueso | Más fino y afilado que el de piedra. |
| Cuchillo de diente | 0.3 kg | 0.2 L | dur 90 · daño 13 · [corta] · repara con 1× Resina | Un diente de depredador montado como cuchillo: corta casi todo. |
| Cuchillo de obsidiana | 0.3 kg | 0.2 L | dur 55 · daño 11 · [corta] · repara con 1× Obsidiana | Filo de vidrio volcánico: corta mejor que la piedra, pero se mella. |
| Punzón de hueso | 0.1 kg | 0.1 L | dur 60 · daño 4 · [perfora] · repara con 1× Hueso | Perfora cuero para coserlo. |
| Martillo de piedra | 2 kg | 1.2 L | dur 80 · daño 12 · [martillar, contundente] · repara con 1× Piedra, 1× Fibra | Machaca y da forma a piedra y hueso. |
| Antorcha | 0.6 kg | 0.6 L | dur 120 · daño 6 | Ilumina la noche. |
| Cantimplora | 0.4 kg | 0.8 L |  | Se llena en ríos y lagos. |

## Familia C — Armas (sin armas de fuego ni ballestas)

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Lanza | 1.6 kg | 1.5 L | dur 50 · daño 28 · alcance 2.6 m · penetra 10 % · [perforante] · repara con 1× Piedra, 1× Fibra | Alcance largo y buen daño. |
| Lanza de hueso | 1.5 kg | 1.5 L | dur 55 · daño 33 · alcance 2.7 m · penetra 20 % · [perforante] · repara con 1× Hueso, 1× Cuerda | Punta de hueso: más ligera y penetrante. |
| Lanza de cuerno | 1.9 kg | 1.6 L | dur 90 · daño 42 · alcance 2.7 m · penetra 40 % · [perforante] · repara con 1× Resina, 1× Cuerda | Punta de cuerno macizo: perfora armaduras. |
| Garrote | 1.4 kg | 1.2 L | dur 80 · daño 14 · alcance 2 m · aturde 15 % · [contundente] · repara con 1× Madera | Rama pesada. Aturde a veces. |
| Maza de piedra | 3 kg | 1.6 L | dur 75 · daño 24 · alcance 2.1 m · penetra 35 % · aturde 25 % · [contundente] · repara con 1× Piedra, 1× Fibra | Golpea con fuerza a través de la coraza. |
| Jabalina | 1 kg | 1 L | dur 30 · daño 30 · penetra 15 % · arrojadiza · [perforante] · repara con 1× Piedra, 1× Fibra | Se arroja. Hay que recogerla después. |
| Arco | 0.9 kg | 1.6 L | dur 130 · daño 4 · usa flecha · repara con 1× Cuerda, 1× Resina | Arco de rama y cuerda. Dispara flechas. |
| Honda | 0.2 kg | 0.2 L | dur 90 · daño 2 · usa guijarro · repara con 1× Cuerda | Lanza guijarros a buena velocidad. |

## Familia D — Munición

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Guijarro | 0.15 kg | 0.06 L | pila 60 · daño 9 | Piedra lisa para honda. |
| Flecha de madera | 0.03 kg | 0.04 L | pila 40 · daño 12 | Punta endurecida al fuego. Barata y frágil. |
| Flecha de piedra | 0.05 kg | 0.04 L | pila 40 · daño 19 · penetra 10 % | Punta de piedra tallada. |
| Flecha de hueso | 0.04 kg | 0.04 L | pila 40 · daño 22 · penetra 30 % | Punta de hueso: ligera y penetrante. |

## Familia E — Vestimenta y mochila

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Capucha de cuero | 0.5 kg | 0.6 L | dur 90 · ranura cabeza · armadura 2 · abrigo 1.5 · repara con 1× Cuero, 1× Fibra | Protege la cabeza del frío y los golpes leves. |
| Casco de hueso | 1.6 kg | 1.4 L | dur 120 · ranura cabeza · armadura 5 · repara con 1× Hueso, 1× Cuerda | Cráneo de criatura reforzado con cuero. |
| Chaleco de cuero | 1.4 kg | 1.6 L | dur 110 · ranura torso · armadura 4 · abrigo 3 · repara con 1× Cuero, 1× Cuerda | Cuero cosido: abriga y amortigua. |
| Peto de osteodermos | 8.5 kg | 3.5 L | dur 200 · ranura torso · armadura 14 · abrigo 1 · ruido ×1.35 · repara con 1× Osteodermo, 1× Tendón | Placas óseas cosidas a cuero. Pesado, ruidoso, casi impenetrable. |
| Pantalón de cuero | 1.1 kg | 1.3 L | dur 110 · ranura piernas · armadura 3 · abrigo 3 · repara con 1× Cuero, 1× Cuerda | Protege las piernas de espinas y mordiscos. |
| Sandalias de cuero | 0.4 kg | 0.6 L | dur 90 · ranura pies · armadura 1 · abrigo 0.5 · ruido ×0.85 · repara con 1× Cuero, 1× Cuerda | Pisadas más silenciosas y pies protegidos. |
| Capa de piel | 2.2 kg | 2.2 L | dur 120 · ranura espalda · armadura 1 · abrigo 6 · impermeable · repara con 1× Cuero, 1× Grasa | Cuero engrasado: abriga mucho y repele la lluvia. |
| Mochila de cuero | 1 kg | 1 L | dur 150 · ranura espalda · abrigo 0.5 · +30 kg, +60 L · repara con 1× Cuero, 1× Cuerda | Aumenta lo que puedes cargar. |

## Comida y curación

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Baya | 0.03 kg | 0.04 L | pila 50 | Fruto silvestre comestible. |
| Carne cruda | 1 kg | 0.8 L | pila 20 | Mejor cocinarla antes de comer. |
| Carne cocida | 0.7 kg | 0.6 L | pila 20 | Nutritiva y segura. |
| Vendaje de hojas | 0.06 kg | 0.1 L | pila 10 | Cura heridas leves. |

## Familia F — Equipo animal (Etapa 3)

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Cabestro | 0.6 kg | 0.7 L | dur 180 · ranura animal cabeza · cabestro de manejo · repara con 1× Cuerda, 1× Cuero | Cabezada de cuerda y cuero: permite guiar a un animal grande que ya confía en ti. |
| Collar de identificación | 0.1 kg | 0.1 L | dur 200 · ranura animal cabeza · collar de manejo · repara con 1× Cuero | Tira de cuero con un hueso grabado: sirve para manejar animales pequeños y reconocer al tuyo. |
| Arnés de cuero | 2.5 kg | 2.2 L | dur 160 · ranura animal lomo · arnés · repara con 1× Cuero, 1× Cuerda | Correas cruzadas sobre el lomo: base para las alforjas y las bolsas de carga. |
| Alforjas | 3 kg | 3 L | dur 150 · ranura animal carga · carga 70 kg / 140 L (× factor de la especie) · repara con 1× Cuero, 1× Cuerda | Dos grandes bolsas de cuero a los costados: llevan mucho peso. Solo en animales robustos. |
| Bolsa de carga | 1.2 kg | 1.6 L | dur 120 · ranura animal carga · carga 25 kg / 50 L (× factor de la especie) · repara con 1× Cuero, 1× Cuerda | Bolsa pequeña atada al arnés: para animales ligeros. |
| Montura ligera | 4 kg | 3.5 L | dur 150 · ranura animal lomo · arnés · silla ligera · repara con 1× Cuero, 1× Tendón | Silla baja y estribos de cuerda para un corredor veloz de dos patas. Sirve de arnés. |
| Montura de transporte | 7 kg | 5 L | dur 200 · ranura animal lomo · arnés · silla transporte · repara con 1× Cuero, 1× Tendón | Silla ancha con respaldo, hecha para un animal pesado y de paso firme. Sirve de arnés. |
| Montura reforzada | 12 kg | 7 L | dur 280 · ranura animal lomo · arnés · silla reforzada · repara con 1× Hueso, 1× Tendón | Armazón de madera y hueso con correas dobles: aguanta a un animal que embiste y recibe golpes. |
| Protección para animal | 9 kg | 5 L | dur 220 · ranura animal proteccion · −28 % de daño al animal · repara con 1× Hueso, 1× Cuero | Placas de hueso y osteodermos cosidas sobre cuero: reduce el daño que recibe el animal. |

## Bebida

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Agua fresca | 0.5 kg | 0.5 L | pila 10 | Agua potable. |

## Colocables

| Objeto | Peso | Vol. | Datos | Descripción |
|---|---|---|---|---|
| Fogata | 3 kg | 2 L | pila 5 | Cocina, da calor y luz. |

## Recetas (45)

| Producto | Materiales | Requisitos | Oficio | XP | Se aprende |
|---|---|---|---|---|---|
| Hacha de piedra | 3× Madera, 2× Piedra, 4× Fibra | — | Talla 0 | 4 | Desde el principio |
| Pico de piedra | 3× Madera, 3× Piedra, 4× Fibra | — | Talla 0 | 4 | Desde el principio |
| Lanza | 4× Madera, 1× Piedra, 3× Fibra | — | Talla 0 | 4 | Desde el principio |
| Antorcha | 2× Madera, 2× Fibra | — | Talla 0 | 2 | Desde el principio |
| Cantimplora | 2× Cuero, 3× Fibra | — | Cuero 0 | 3 | Desde el principio |
| Fogata | 6× Madera, 4× Piedra, 1× Pedernal | — | Talla 0 | 3 | Desde el principio |
| Carne cocida | 1× Carne cruda | fogata encendida | Cocina 0 | 1 | Desde el principio |
| Cuerda | 4× Fibra | — | Talla 0 | 1 | Desde el principio |
| Cuchillo de piedra | 1× Piedra, 1× Madera, 2× Fibra | — | Talla 0 | 3 | Desde el principio |
| Garrote | 2× Rama, 1× Fibra | — | Talla 0 | 2 | Desde el principio |
| Guijarro ×4 | 1× Piedra | — | Caza 0 | 1 | Desde el principio |
| Cuerda ×2 (liana) | 2× Liana | — | Talla 0 | 1 | Al tener Liana |
| Fibra ×3 | 2× Corteza | herramienta: algo que corte | Talla 0 | 1 | Al tener Corteza |
| Vendaje de hojas ×2 | 2× Hoja grande, 1× Fibra, 1× Resina | — | Cocina 0 | 2 | Al tener Hoja grande |
| Cuchillo de hueso | 1× Hueso, 2× Fibra, 1× Resina | herramienta: algo que corte | Talla 0 | 3 | Al tener Hueso |
| Punzón de hueso | 1× Hueso | herramienta: algo que corte | Talla 0 | 2 | Al tener Hueso |
| Martillo de piedra | 2× Madera, 2× Piedra, 2× Fibra | — | Talla 0 | 3 | Al fabricar Cuchillo de piedra |
| Cuchillo de diente | 1× Diente grande, 1× Madera, 1× Resina | herramienta: algo que corte | Talla 1 | 5 | Al tener Diente grande |
| Cuchillo de obsidiana | 1× Obsidiana, 1× Madera, 2× Fibra | herramienta: martillo | Talla 1 | 5 | Al tener Obsidiana |
| Arco | 3× Rama, 2× Cuerda | herramienta: algo que corte | Caza 0 | 5 | Al tener Rama |
| Honda | 1× Cuero, 2× Cuerda | — | Caza 0 | 3 | Al fabricar Cuerda |
| Jabalina | 3× Madera, 1× Piedra, 2× Fibra | — | Caza 0 | 4 | Al fabricar Lanza |
| Flecha de madera ×2 | 1× Rama, 1× Pluma | herramienta: algo que corte | Caza 0 | 2 | Al fabricar Arco |
| Flecha de piedra ×2 | 1× Rama, 1× Piedra, 1× Pluma, 1× Resina | herramienta: algo que corte | Caza 1 | 3 | Al fabricar Flecha de madera |
| Flecha de hueso ×2 | 1× Rama, 1× Hueso, 1× Pluma, 1× Resina | herramienta: algo que corte | Caza 1 | 3 | Al fabricar Flecha de piedra |
| Lanza de hueso | 1× Hueso, 4× Madera, 1× Cuerda | herramienta: algo que corte | Talla 1 | 5 | Al fabricar Cuchillo de hueso |
| Maza de piedra | 3× Madera, 3× Piedra, 4× Fibra | — | Talla 1 | 5 | Al fabricar Garrote |
| Lanza de cuerno | 1× Cuerno, 4× Madera, 1× Cuerda | herramienta: algo que corte | Talla 2 | 8 | Al despiezar triceratops |
| Capucha de cuero | 2× Cuero, 2× Fibra | herramienta: punzón | Cuero 0 | 4 | Al fabricar Punzón de hueso |
| Sandalias de cuero | 2× Cuero, 1× Cuerda | herramienta: punzón | Cuero 0 | 4 | Al fabricar Punzón de hueso |
| Chaleco de cuero | 4× Cuero, 2× Cuerda | herramienta: punzón | Cuero 1 | 6 | Al fabricar Punzón de hueso |
| Pantalón de cuero | 3× Cuero, 2× Cuerda | herramienta: punzón | Cuero 1 | 6 | Al fabricar Punzón de hueso |
| Mochila de cuero | 6× Cuero, 3× Cuerda | herramienta: punzón | Cuero 2 | 8 | Al fabricar Chaleco de cuero |
| Capa de piel | 5× Cuero, 1× Grasa, 2× Cuerda | herramienta: punzón | Cuero 2 | 8 | Al tener Grasa |
| Casco de hueso | 5× Hueso, 1× Cuero, 2× Cuerda | herramienta: algo que corte | Cuero 2 | 7 | Al llegar a Cuero y costura 2 |
| Peto de osteodermos | 6× Osteodermo, 3× Cuero, 4× Tendón | herramienta: punzón | Cuero 3 | 14 | Al despiezar ankylosaurus |
| Cabestro | 2× Cuerda, 1× Cuero | — | Cuero 0 | 3 | Al tener Cuerda |
| Collar de identificación | 1× Cuero, 1× Cuerda, 1× Hueso | herramienta: punzón | Cuero 0 | 3 | Al fabricar Cabestro |
| Arnés de cuero | 5× Cuero, 3× Cuerda, 2× Tendón | herramienta: punzón | Cuero 1 | 6 | Al fabricar Cabestro |
| Bolsa de carga | 3× Cuero, 2× Cuerda | herramienta: punzón | Cuero 1 | 5 | Al fabricar Arnés de cuero |
| Alforjas | 6× Cuero, 3× Cuerda, 4× Fibra | herramienta: punzón | Cuero 2 | 8 | Al fabricar Arnés de cuero |
| Montura ligera | 6× Cuero, 2× Madera, 3× Tendón, 3× Cuerda | herramienta: punzón | Cuero 2 | 10 | Al llegar a Manejo de animales 1 |
| Montura de transporte | 8× Cuero, 4× Madera, 4× Tendón, 4× Cuerda | herramienta: punzón | Cuero 2 | 12 | Al fabricar Montura ligera |
| Montura reforzada | 8× Cuero, 6× Hueso, 5× Tendón, 4× Cuerda | herramienta: punzón | Cuero 3 | 16 | Al fabricar Montura de transporte |
| Protección para animal | 8× Cuero, 6× Hueso, 2× Osteodermo, 3× Cuerda | herramienta: punzón | Cuero 3 | 16 | Al llegar a Manejo de animales 2 |

## Recolección en el mundo

| Fuente | Fase | Objeto | Cantidad | Prob. | Condición |
|---|---|---|---|---|---|
| arbol | cada golpe | Madera | 1 | 100 % | sin talar |
| arbol | cada golpe | Madera | 2 | 100 % | herramienta talar |
| arbol | cada golpe | Fibra | 1 | 30 % | — |
| arbol | cada golpe | Rama | 1–2 | 40 % | — |
| arbol | cada golpe | Corteza | 1 | 25 % | herramienta talar |
| arbol | cada golpe | Resina | 1 | 8 % | — |
| arbol | cada golpe | Liana | 1 | 14 % | bioma selva |
| arbol | cada golpe | Resina | 1–2 | 22 % | bioma selva |
| arbol | cada golpe | Hoja grande | 1–2 | 30 % | bioma selva |
| arbol | cada golpe | Hoja grande | 1 | 25 % | bioma playa |
| arbol | cada golpe | Resina | 1–2 | 28 % | bioma taiga |
| arbol | cada golpe | Ámbar | 1 | 7 % | bioma taiga |
| arbol | cada golpe | Resina | 1 | 15 % | bioma bosque |
| arbol | cada golpe | Fibra | 1–2 | 35 % | bioma pantano |
| arbol | al caer/romperse | Madera | 5 | 100 % | — |
| arbol | al caer/romperse | Rama | 2–4 | 100 % | — |
| arbol | al caer/romperse | Corteza | 2–3 | 100 % | herramienta talar |
| roca | cada golpe | Piedra | 2 | 100 % | herramienta picar |
| roca | cada golpe | Pedernal | 1 | 15 % | herramienta picar |
| roca | cada golpe | Piedra | 1 | 30 % | sin picar |
| roca | cada golpe | Pedernal | 1 | 18 % | herramienta picar, bioma montana |
| roca | cada golpe | Pedernal | 1 | 18 % | herramienta picar, bioma desierto |
| roca | al caer/romperse | Piedra | 4 | 100 % | — |
| roca | al caer/romperse | Pedernal | 1 | 100 % | — |
| veta_obsidiana | cada golpe | Obsidiana | 1 | 50 % | herramienta picar |
| veta_obsidiana | al caer/romperse | Obsidiana | 2–4 | 100 % | — |
| veta_sal | cada golpe | Sal | 1–2 | 60 % | herramienta picar |
| veta_sal | cada golpe | Sal | 1 | 25 % | sin picar |
| veta_sal | al caer/romperse | Sal | 3–5 | 100 % | — |
| veta_arcilla | cada golpe | Arcilla | 1–2 | 100 % | — |
| veta_arcilla | al caer/romperse | Arcilla | 4–6 | 100 % | — |
| cactus | cada golpe | Agua fresca | 1–2 | 100 % | herramienta corta |
| cactus | cada golpe | Fibra | 1 | 50 % | — |
| baya | cada golpe | Baya | 3–5 | 100 % | — |
| baya | cada golpe | Fibra | 1 | 100 % | — |
| baya | cada golpe | Hoja grande | 1–2 | 50 % | — |

## Despiece por especie

"Req." = etiqueta de herramienta que hace falta (sin ella se pierde y se avisa). Sin ninguna herramienta solo se obtiene carne, a la mitad.

| Especie | Obtiene |
|---|---|
| compsognatus | Carne cruda 1 · Cuero 1 (req. corta) 70 % · Hueso 1 (req. corta) 80 % · Pluma 1–2 (req. corta) |
| gallimimus | Carne cruda 3–4 · Cuero 1–2 (req. corta) · Hueso 2–3 (req. corta) · Pluma 3–6 (req. corta) · Tendón 1–2 (req. corta) 50 % |
| raptor | Carne cruda 2–3 · Cuero 1–2 (req. corta) · Hueso 1–2 (req. corta) · Pluma 2–4 (req. corta) 80 % · Diente grande 1–2 (req. corta) 50 % · Tendón 1 (req. corta) 40 % |
| parasaurolophus | Carne cruda 6–9 · Cuero 3–4 (req. corta) · Hueso 3–5 (req. corta) · Grasa 1–2 (req. corta) · Tendón 1–3 (req. corta) |
| stegosaurus | Carne cruda 8–12 · Cuero 4–5 (req. corta) · Hueso 5–7 (req. corta) · Grasa 2–3 (req. corta) · Tendón 2–3 (req. corta) |
| ankylosaurus | Carne cruda 7–10 · Cuero 3–4 (req. corta) · Hueso 4–6 (req. corta) · Osteodermo 3–5 (req. talar) · Grasa 1–2 (req. corta) · Tendón 1–2 (req. corta) |
| triceratops | Carne cruda 8–12 · Cuero 4–6 (req. corta) · Hueso 5–8 (req. corta) · Cuerno 1–2 (req. talar) · Grasa 2–3 (req. corta) · Tendón 2–3 (req. corta) |
| tyrannosaurus | Carne cruda 14–20 · Cuero 5–7 (req. corta) · Hueso 8–12 (req. corta) · Diente grande 2–5 (req. corta) 90 % · Grasa 3–5 (req. corta) · Tendón 3–5 (req. corta) |
| braquiosaurio | Carne cruda 20–30 · Cuero 8–10 (req. corta) · Hueso 10–15 (req. corta) · Grasa 5–8 (req. corta) · Tendón 4–6 (req. corta) |
| pteranodon | Carne cruda 2–3 · Cuero 1–2 (req. corta) · Hueso 1–2 (req. corta) |

## Pruebas

- `node tools/items-test.mjs` — integridad de datos y **alcanzabilidad**: todos los objetos se pueden conseguir desde cero siguiendo el grafo real de aprendizaje.
- `node tools/craft-test.mjs` — en navegador: las 45 recetas (consumo, producción, desgaste, XP, evento), rechazos, aprendizaje, oficios, rotura, reparación, carga, armadura, melé, arco, honda, jabalina, despiece, guardado v2 y migración desde v1.
