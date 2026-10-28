// CATÁLOGO DE ESPECIES — base de datos extensible. Una sola fuente de verdad para biología, sentidos, habilidades y ecología.
//
//  · FILAS: catálogo amplio (taxonomía, período, región, dieta, tamaño/masa aproximados, confianza científica, ecosistema).
//    Solo las especies con `DETALLE` + modelo en species.js son jugables (estado 'implementado'); el resto queda 'catalogado'
//    y se puede ir implementando sin tocar el resto del código (ver docs/AUDITORIA.md y docs/PLAN_EXPANSION.md).
//  · DETALLE: parámetros biológicos y de comportamiento de las especies implementadas; species.js los convierte en IA real.
//  · Cifras: aproximadas y redondeadas (tamaño = longitud total, o envergadura para pterosaurios; masa en kg). Las estimaciones
//    de masa y la conducta de la mayoría de especies son hipótesis; la columna `conf` resume qué tan sustentada está la reconstrucción
//    de comportamiento ('alta' | 'media' | 'baja' | 'ficcion').

// id | nombre común | nombre científico | grupo | período | región/hábitat | dieta | tamaño m | masa kg | conf | ecosistema
const FILAS = `
tyrannosaurus|Tiranosaurio|Tyrannosaurus rex|Gran terópodo|Cretácico tardío (Maastrichtiense)|Norteamérica occidental, llanuras costeras|carnívoro|12|8000|media|hell_creek
tarbosaurus|Tarbosaurio|Tarbosaurus bataar|Gran terópodo|Cretácico tardío|Mongolia, llanuras fluviales|carnívoro|10|4500|media|nemegt
giganotosaurus|Giganotosaurio|Giganotosaurus carolinii|Gran terópodo|Cretácico medio (Cenomaniense)|Patagonia, Argentina|carnívoro|12|6500|baja|patagonia_cenomaniense
carcharodontosaurus|Carcarodontosaurio|Carcharodontosaurus saharicus|Gran terópodo|Cretácico medio|Norte de África, manglares y llanuras|carnívoro|12|6000|baja|kem_kem
mapusaurus|Mapusaurio|Mapusaurus roseae|Gran terópodo|Cretácico medio (Cenomaniense)|Patagonia, Argentina|carnívoro|11|4000|baja|patagonia_cenomaniense
spinosaurus|Espinosaurio|Spinosaurus aegyptiacus|Gran terópodo (espinosáurido)|Cretácico medio|Norte de África, ríos y costa|piscívoro / carnívoro|14|7000|baja|kem_kem
baryonyx|Baryonyx|Baryonyx walkeri|Gran terópodo (espinosáurido)|Cretácico temprano|Inglaterra, llanuras de inundación|piscívoro / carnívoro|8|1700|media|wealden
suchomimus|Suchomimus|Suchomimus tenerensis|Gran terópodo (espinosáurido)|Cretácico temprano|Níger, ríos|piscívoro|10|3500|baja|tenere
allosaurus|Alosaurio|Allosaurus fragilis|Gran terópodo|Jurásico tardío|Norteamérica (Fm. Morrison), llanuras de inundación|carnívoro|8.5|2000|media|morrison
ceratosaurus|Ceratosaurio|Ceratosaurus nasicornis|Terópodo mediano-grande|Jurásico tardío|Norteamérica y Portugal|carnívoro|6|600|media|morrison
carnotaurus|Carnotauro|Carnotaurus sastrei|Gran terópodo (abelisáurido)|Cretácico tardío|Patagonia, Argentina|carnívoro|7.5|1500|baja|patagonia_maastrichtiense
majungasaurus|Majungasaurio|Majungasaurus crenatissimus|Gran terópodo (abelisáurido)|Cretácico tardío|Madagascar|carnívoro|6.5|1100|media|madagascar
acrocanthosaurus|Acrocantosaurio|Acrocanthosaurus atokensis|Gran terópodo|Cretácico temprano|Norteamérica, llanuras costeras|carnívoro|11.5|5000|media|cretacico_temprano_na
albertosaurus|Albertosaurio|Albertosaurus sarcophagus|Gran terópodo (tiranosáurido)|Cretácico tardío|Canadá (Alberta)|carnívoro|9|1700|media|dinosaur_park
daspletosaurus|Daspletosaurio|Daspletosaurus torosus|Gran terópodo (tiranosáurido)|Cretácico tardío (Campaniense)|Norteamérica occidental|carnívoro|9|2500|media|dinosaur_park
gorgosaurus|Gorgosaurio|Gorgosaurus libratus|Gran terópodo (tiranosáurido)|Cretácico tardío (Campaniense)|Canadá (Alberta)|carnívoro|8.6|2400|media|dinosaur_park
yutyrannus|Yutirano|Yutyrannus huali|Gran terópodo (tiranosauroide emplumado)|Cretácico temprano|China (Fm. Yixian), bosques templados|carnívoro|9|1400|media|yixian
torvosaurus|Torvosaurio|Torvosaurus tanneri|Gran terópodo|Jurásico tardío|Norteamérica y Portugal|carnívoro|10|4000|baja|morrison
velociraptor|Velociraptor|Velociraptor mongoliensis|Terópodo pequeño (dromeosáurido emplumado)|Cretácico tardío|Mongolia y China, zonas áridas|carnívoro|1.8|15|media|djadokhta
deinonychus|Deinonico|Deinonychus antirrhopus|Terópodo mediano (dromeosáurido)|Cretácico temprano|Norteamérica|carnívoro|3.4|70|media|cretacico_temprano_na
utahraptor|Utahraptor|Utahraptor ostrommaysorum|Terópodo mediano-grande (dromeosáurido)|Cretácico temprano|Utah, Norteamérica|carnívoro|6.5|500|baja|cretacico_temprano_na
dromaeosaurus|Dromeosaurio|Dromaeosaurus albertensis|Terópodo pequeño (dromeosáurido)|Cretácico tardío|Canadá|carnívoro|2|15|baja|dinosaur_park
microraptor|Microraptor|Microraptor zhaoianus|Terópodo diminuto emplumado|Cretácico temprano|China (Fm. Jiufotang), bosques|carnívoro / insectívoro|0.8|1|media|yixian
saurornitholestes|Saurornitholestes|Saurornitholestes langstoni|Terópodo pequeño (dromeosáurido)|Cretácico tardío|Norteamérica|carnívoro|1.8|15|baja|dinosaur_park
raptor|Raptor (ficción)|Dromaeosauridae ficticio (tipo Deinonychus/Utahraptor)|Terópodo mediano (dromeosáurido, ficción)|Cretácico temprano (referencia)|Norteamérica (referencia)|carnívoro|3.5|120|ficcion|isla_ficcion
compsognatus|Compsognathus|Compsognathus longipes|Terópodo pequeño|Jurásico tardío|Europa (Alemania, Francia), islas y lagunas|carnívoro (lagartos, pequeños vertebrados)|1|3|media|solnhofen
dilophosaurus|Dilofosaurio|Dilophosaurus wetherilli|Terópodo mediano|Jurásico temprano|Arizona, Norteamérica|carnívoro|7|400|media|kayenta
coelophysis|Celofisis|Coelophysis bauri|Terópodo pequeño|Triásico tardío|Norteamérica (Nuevo México)|carnívoro|3|20|media|chinle
ornithomimus|Ornitomimo|Ornithomimus edmontonicus|Terópodo ornitomimosaurio|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|omnívoro|3.5|150|media|hell_creek
gallimimus|Galimimo|Gallimimus bullatus|Terópodo ornitomimosaurio|Cretácico tardío|Mongolia (Fm. Nemegt)|omnívoro / herbívoro|6|450|media|nemegt
struthiomimus|Estrutiomimo|Struthiomimus altus|Terópodo ornitomimosaurio|Cretácico tardío|Canadá|omnívoro|4|150|media|dinosaur_park
oviraptor|Oviraptor|Oviraptor philoceratops|Terópodo oviraptorosaurio|Cretácico tardío|Mongolia|omnívoro|2|33|baja|djadokhta
citipati|Citipati|Citipati osmolskae|Terópodo oviraptorosaurio|Cretácico tardío|Mongolia|omnívoro|3|75|media|djadokhta
anzu|Anzu|Anzu wyliei|Terópodo oviraptorosaurio|Cretácico tardío (Maastrichtiense)|Norteamérica (Fm. Hell Creek)|omnívoro|3.5|250|baja|hell_creek
therizinosaurus|Terizinosaurio|Therizinosaurus cheloniformis|Terópodo terizinosáurido|Cretácico tardío|Mongolia|herbívoro / omnívoro|10|5000|baja|nemegt
shuvuuia|Shuvuuia|Shuvuuia deserti|Terópodo alvarezsáurido|Cretácico tardío|Mongolia, desierto|insectívoro|0.7|2|baja|djadokhta
archaeopteryx|Arqueopterix|Archaeopteryx lithographica|Terópodo emplumado (avialano basal)|Jurásico tardío|Alemania, islas y lagunas|insectívoro / carnívoro|0.5|1|baja|solnhofen
argentinosaurus|Argentinosaurio|Argentinosaurus huinculensis|Saurópodo (titanosaurio)|Cretácico medio|Patagonia, Argentina|herbívoro|32|70000|baja|patagonia_cenomaniense
patagotitan|Patagotitán|Patagotitan mayorum|Saurópodo (titanosaurio)|Cretácico medio-tardío|Patagonia, Argentina|herbívoro|31|57000|baja|patagonia_cenomaniense
puertasaurus|Puertasaurio|Puertasaurus reuili|Saurópodo (titanosaurio)|Cretácico tardío|Patagonia, Argentina|herbívoro|30|50000|baja|patagonia_maastrichtiense
dreadnoughtus|Dreadnoughtus|Dreadnoughtus schrani|Saurópodo (titanosaurio)|Cretácico tardío|Patagonia, Argentina|herbívoro|26|30000|baja|patagonia_maastrichtiense
saltasaurus|Saltasaurio|Saltasaurus loricatus|Saurópodo (titanosaurio acorazado)|Cretácico tardío|Argentina|herbívoro|9|7000|media|patagonia_maastrichtiense
futalognkosaurus|Futalognkosaurio|Futalognkosaurus dukei|Saurópodo (titanosaurio)|Cretácico tardío|Patagonia, Argentina|herbívoro|26|38000|baja|patagonia_cenomaniense
diplodocus|Diplodoco|Diplodocus carnegii|Saurópodo (diplodócido)|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|26|15000|media|morrison
apatosaurus|Apatosaurio|Apatosaurus ajax|Saurópodo (diplodócido)|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|22|18000|media|morrison
brontosaurus|Brontosaurio|Brontosaurus excelsus|Saurópodo (diplodócido)|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|22|15000|media|morrison
braquiosaurio|Braquiosaurio|Brachiosaurus altithorax|Saurópodo (braquiosáurido)|Jurásico tardío|Norteamérica (Fm. Morrison), bosques abiertos|herbívoro (ramoneo alto)|22|35000|media|morrison
giraffatitan|Giraffatitán|Giraffatitan brancai|Saurópodo (braquiosáurido)|Jurásico tardío|Tanzania (Tendaguru)|herbívoro (ramoneo alto)|22|35000|media|tendaguru
camarasaurus|Camarasaurio|Camarasaurus supremus|Saurópodo|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|18|18000|media|morrison
amargasaurus|Amargasaurio|Amargasaurus cazaui|Saurópodo (dicraeosáurido)|Cretácico temprano|Patagonia, Argentina|herbívoro|10|3000|baja|la_amarga
mamenchisaurus|Mamenquisaurio|Mamenchisaurus hochuanensis|Saurópodo de cuello largo|Jurásico tardío|China|herbívoro|22|20000|baja|shishugou
nigersaurus|Nigersaurio|Nigersaurus taqueti|Saurópodo (rebaquisáurido)|Cretácico medio|Níger, llanuras de inundación|herbívoro (pasto a ras)|9|4000|media|tenere
europasaurus|Europasaurio|Europasaurus holgeri|Saurópodo enano insular|Jurásico tardío|Alemania, isla|herbívoro|6|800|media|solnhofen
rapetosaurus|Rapetosaurio|Rapetosaurus krausei|Saurópodo (titanosaurio)|Cretácico tardío|Madagascar|herbívoro|15|8000|media|madagascar
supersaurus|Supersaurio|Supersaurus vivianae|Saurópodo (diplodócido)|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|33|35000|baja|morrison
triceratops|Triceratops|Triceratops horridus|Ceratópsido|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|herbívoro|9|6000|media|hell_creek
torosaurus|Torosaurio|Torosaurus latus|Ceratópsido|Cretácico tardío|Norteamérica occidental|herbívoro|8|6000|baja|hell_creek
styracosaurus|Estiracosaurio|Styracosaurus albertensis|Ceratópsido (centrosaurino)|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro|5.5|2700|media|dinosaur_park
centrosaurus|Centrosaurio|Centrosaurus apertus|Ceratópsido (centrosaurino)|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro|6|2500|media|dinosaur_park
pachyrhinosaurus|Paquirrinosaurio|Pachyrhinosaurus lakustai|Ceratópsido (centrosaurino)|Cretácico tardío|Canadá y Alaska|herbívoro|6|3000|media|prince_creek
chasmosaurus|Casmosaurio|Chasmosaurus belli|Ceratópsido (casmosaurino)|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro|5|2000|media|dinosaur_park
pentaceratops|Pentaceratops|Pentaceratops sternbergii|Ceratópsido (casmosaurino)|Cretácico tardío|Nuevo México|herbívoro|6.5|3500|baja|kirtland
kosmoceratops|Kosmoceratops|Kosmoceratops richardsoni|Ceratópsido (casmosaurino)|Cretácico tardío (Campaniense)|Utah (Laramidia sur)|herbívoro|4.5|1200|baja|kaiparowits
utahceratops|Utahceratops|Utahceratops gettyi|Ceratópsido (casmosaurino)|Cretácico tardío (Campaniense)|Utah (Laramidia sur)|herbívoro|4.5|2500|baja|kaiparowits
diabloceratops|Diabloceratops|Diabloceratops eatoni|Ceratópsido (centrosaurino basal)|Cretácico tardío|Utah|herbívoro|5|2000|baja|wahweap
nasutoceratops|Nasutoceratops|Nasutoceratops titusi|Ceratópsido (centrosaurino)|Cretácico tardío (Campaniense)|Utah|herbívoro|4.5|1500|baja|kaiparowits
einiosaurus|Einiosaurio|Einiosaurus procurvicornis|Ceratópsido (centrosaurino)|Cretácico tardío|Montana|herbívoro|6|1300|baja|two_medicine
protoceratops|Protoceratops|Protoceratops andrewsi|Ceratopsio basal|Cretácico tardío|Mongolia, dunas y llanuras|herbívoro|2|150|media|djadokhta
stegosaurus|Estegosaurio|Stegosaurus stenops|Estegosaurio|Jurásico tardío|Norteamérica (Fm. Morrison), llanuras de inundación|herbívoro (ramoneo bajo)|9|5000|media|morrison
kentrosaurus|Kentrosaurio|Kentrosaurus aethiopicus|Estegosaurio|Jurásico tardío|Tanzania (Tendaguru)|herbívoro|4.5|1000|media|tendaguru
dacentrurus|Dacentruro|Dacentrurus armatus|Estegosaurio|Jurásico tardío|Europa occidental|herbívoro|8|3000|baja|solnhofen
miragaia|Miragaia|Miragaia longicollum|Estegosaurio de cuello largo|Jurásico tardío|Portugal|herbívoro|6.5|2000|baja|lourinha
huayangosaurus|Huayangosaurio|Huayangosaurus taibaii|Estegosaurio basal|Jurásico medio|China|herbívoro|4.5|800|baja|shaximiao
tuojiangosaurus|Tuojiangosaurio|Tuojiangosaurus multispinus|Estegosaurio|Jurásico tardío|China|herbívoro|7|2800|baja|shaximiao
gigantspinosaurus|Gigantspinosaurio|Gigantspinosaurus sichuanensis|Estegosaurio|Jurásico tardío|China|herbívoro|4.2|500|baja|shaximiao
chungkingosaurus|Chungkingosaurio|Chungkingosaurus jiangbeiensis|Estegosaurio|Jurásico tardío|China|herbívoro|4|500|baja|shaximiao
wuerhosaurus|Wuerhosaurio|Wuerhosaurus homheni|Estegosaurio tardío|Cretácico temprano|China|herbívoro|6|3000|baja|tugulu
ankylosaurus|Anquilosaurio|Ankylosaurus magniventris|Anquilosáurido|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|herbívoro|7|5000|media|hell_creek
euoplocephalus|Euoplocéfalo|Euoplocephalus tutus|Anquilosáurido|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro|6|2000|media|dinosaur_park
pinacosaurus|Pinacosaurio|Pinacosaurus grangeri|Anquilosáurido|Cretácico tardío|Mongolia y China|herbívoro|5|1000|media|djadokhta
saichania|Saichania|Saichania chulsanensis|Anquilosáurido|Cretácico tardío|Mongolia|herbívoro|6|1500|baja|nemegt
tarchia|Tarchia|Tarchia kielanae|Anquilosáurido|Cretácico tardío|Mongolia|herbívoro|8|4000|baja|nemegt
zuul|Zuul|Zuul crurivastator|Anquilosáurido|Cretácico tardío (Campaniense)|Montana|herbívoro|6|2500|media|judith_river
scolosaurus|Escolosaurio|Scolosaurus cutleri|Anquilosáurido (validez discutida)|Cretácico tardío|Canadá|herbívoro|5.5|2000|baja|dinosaur_park
gastonia|Gastonia|Gastonia burgei|Nodosáurido / polacantino|Cretácico temprano|Utah|herbívoro|5|1500|baja|cretacico_temprano_na
polacanthus|Polacanto|Polacanthus foxii|Nodosáurido / polacantino|Cretácico temprano|Inglaterra|herbívoro|5|1500|baja|wealden
edmontonia|Edmontonia|Edmontonia rugosidens|Nodosáurido|Cretácico tardío|Norteamérica occidental|herbívoro|6.6|3000|media|dinosaur_park
borealopelta|Borealopelta|Borealopelta markmitchelli|Nodosáurido|Cretácico temprano|Canadá (Alberta)|herbívoro|5.5|1300|alta|clearwater
minmi|Minmi|Minmi paravertebra|Anquilosaurio basal|Cretácico temprano|Australia|herbívoro|3|300|baja|eromanga
antarctopelta|Antarctopelta|Antarctopelta oliveroi|Anquilosaurio|Cretácico tardío|Antártida|herbívoro|4|600|baja|antartida
stegouros|Estegurós|Stegouros elengassen|Anquilosaurio (parankylosaurio)|Cretácico tardío|Chile (Patagonia)|herbívoro|1.7|100|baja|patagonia_maastrichtiense
iguanodon|Iguanodon|Iguanodon bernissartensis|Ornitópodo|Cretácico temprano|Europa occidental|herbívoro|10|3500|media|wealden
ouranosaurus|Ouranosaurio|Ouranosaurus nigeriensis|Ornitópodo (vela dorsal)|Cretácico temprano|Níger|herbívoro|8|3000|baja|tenere
tenontosaurus|Tenontosaurio|Tenontosaurus tilletti|Ornitópodo|Cretácico temprano|Norteamérica|herbívoro|7|1000|media|cretacico_temprano_na
dryosaurus|Driosaurio|Dryosaurus altus|Ornitópodo|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|3.5|100|media|morrison
camptosaurus|Camptosaurio|Camptosaurus dispar|Ornitópodo|Jurásico tardío|Norteamérica (Fm. Morrison)|herbívoro|6|1000|media|morrison
hypsilophodon|Hipsilofodonte|Hypsilophodon foxii|Ornitópodo pequeño|Cretácico temprano|Inglaterra (Isla de Wight)|herbívoro|2|20|media|wealden
thescelosaurus|Tescelosaurio|Thescelosaurus neglectus|Ornitópodo|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|herbívoro|4|350|media|hell_creek
muttaburrasaurus|Muttaburrasaurio|Muttaburrasaurus langdoni|Ornitópodo|Cretácico temprano|Australia|herbívoro|8|2800|baja|eromanga
edmontosaurus|Edmontosaurio|Edmontosaurus annectens|Hadrosáurido|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|herbívoro|12|4000|media|hell_creek
shantungosaurus|Shantungosaurio|Shantungosaurus giganteus|Hadrosáurido|Cretácico tardío|China|herbívoro|15|13000|baja|wangshi
gryposaurus|Griposaurio|Gryposaurus notabilis|Hadrosáurido (nariz arqueada)|Cretácico tardío (Campaniense)|Canadá y Norteamérica|herbívoro|8|2500|baja|dinosaur_park
saurolophus|Saurolofo|Saurolophus osborni|Hadrosáurido|Cretácico tardío|Norteamérica y Mongolia|herbívoro|9|3000|baja|nemegt
parasaurolophus|Parasaurolofo|Parasaurolophus walkeri|Hadrosáurido lambeosaurino|Cretácico tardío (Campaniense)|Norteamérica occidental, llanuras costeras|herbívoro (ramoneo medio)|9.5|2500|media|dinosaur_park
corythosaurus|Coritosaurio|Corythosaurus casuarius|Hadrosáurido lambeosaurino|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro|9|3500|media|dinosaur_park
lambeosaurus|Lambeosaurio|Lambeosaurus lambei|Hadrosáurido lambeosaurino|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro|9.5|3500|media|dinosaur_park
hypacrosaurus|Hipacrosaurio|Hypacrosaurus stebingeri|Hadrosáurido lambeosaurino|Cretácico tardío|Norteamérica occidental|herbívoro|9|4000|media|two_medicine
maiasaura|Maiasaura|Maiasaura peeblesorum|Hadrosáurido saurolofino|Cretácico tardío (Campaniense)|Montana (Fm. Two Medicine)|herbívoro|9|3000|media|two_medicine
brachylophosaurus|Braquilofosaurio|Brachylophosaurus canadensis|Hadrosáurido saurolofino|Cretácico tardío|Norteamérica occidental|herbívoro|9|3000|media|judith_river
tsintaosaurus|Tsintaosaurio|Tsintaosaurus spinorhinus|Hadrosáurido lambeosaurino|Cretácico tardío|China|herbívoro|10|4000|baja|wangshi
olorotitan|Olorotitán|Olorotitan arharensis|Hadrosáurido lambeosaurino|Cretácico tardío (Maastrichtiense)|Rusia (Amur)|herbívoro|8|4000|baja|udurchukan
pachycephalosaurus|Paquicefalosaurio|Pachycephalosaurus wyomingensis|Paquicefalosaurio|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|herbívoro / omnívoro|4.5|450|baja|hell_creek
stegoceras|Estegocerás|Stegoceras validum|Paquicefalosaurio|Cretácico tardío (Campaniense)|Canadá (Alberta)|herbívoro / omnívoro|2|40|baja|dinosaur_park
prenocephale|Prenocéfalo|Prenocephale prenes|Paquicefalosaurio|Cretácico tardío|Mongolia|herbívoro / omnívoro|2.4|40|baja|nemegt
homalocephale|Homalocéfalo|Homalocephale calathocercos|Paquicefalosaurio|Cretácico tardío|Mongolia|herbívoro / omnívoro|3|40|baja|nemegt
sphaerotholus|Esferotolo|Sphaerotholus goodwini|Paquicefalosaurio|Cretácico tardío|Norteamérica|herbívoro / omnívoro|2.5|80|baja|kirtland
wannanosaurus|Wannanosaurio|Wannanosaurus yansiensis|Paquicefalosaurio basal|Cretácico tardío|China|herbívoro / omnívoro|0.6|3|baja|xiaoyan
plateosaurus|Plateosaurio|Plateosaurus engelhardti|Sauropodomorfo basal|Triásico tardío|Europa central, llanuras áridas|herbívoro|8|2000|media|trossingen
massospondylus|Masospóndilo|Massospondylus carinatus|Sauropodomorfo basal|Jurásico temprano|Sudáfrica|herbívoro / omnívoro|5|300|media|elliot
riojasaurus|Riojasaurio|Riojasaurus incertus|Sauropodomorfo basal|Triásico tardío|Argentina|herbívoro|10|1000|baja|los_colorados
mussaurus|Musaurio|Mussaurus patagonicus|Sauropodomorfo basal|Triásico tardío – Jurásico temprano|Patagonia, Argentina|herbívoro / omnívoro|3|70|media|laguna_colorada
eoraptor|Eoraptor|Eoraptor lunensis|Dinosaurio basal|Triásico tardío|Argentina (Ischigualasto)|omnívoro|1|10|baja|ischigualasto
herrerasaurus|Herrerasaurio|Herrerasaurus ischigualastensis|Dinosaurio basal (herrerasáurido)|Triásico tardío|Argentina (Ischigualasto)|carnívoro|4|250|baja|ischigualasto
eodromaeus|Eodromeo|Eodromaeus murphi|Dinosaurio basal (terópodo)|Triásico tardío|Argentina (Ischigualasto)|carnívoro|1.2|5|baja|ischigualasto
saturnalia|Saturnalia|Saturnalia tupiniquim|Sauropodomorfo basal|Triásico tardío|Brasil|omnívoro|1.5|10|baja|santa_maria
panphagia|Panfagia|Panphagia protos|Sauropodomorfo basal|Triásico tardío|Argentina (Ischigualasto)|omnívoro|1.3|5|baja|ischigualasto
buriolestes|Buriolestes|Buriolestes schultzi|Sauropodomorfo basal|Triásico tardío|Brasil|carnívoro / omnívoro|1.5|6|baja|santa_maria
lesothosaurus|Lesotosaurio|Lesothosaurus diagnosticus|Ornitisquio basal|Jurásico temprano|Lesoto y Sudáfrica|herbívoro|1|3|baja|elliot
heterodontosaurus|Heterodontosaurio|Heterodontosaurus tucki|Ornitisquio basal|Jurásico temprano|Sudáfrica|omnívoro|1.2|2|media|elliot
scelidosaurus|Escelidosaurio|Scelidosaurus harrisonii|Tireóforo basal|Jurásico temprano|Inglaterra|herbívoro|4|270|baja|lias
psittacosaurus|Psitacosaurio|Psittacosaurus mongoliensis|Ceratopsio basal|Cretácico temprano|Asia oriental|herbívoro|2|20|media|yixian
kulindadromeus|Kulindadromeus|Kulindadromeus zabaikalicus|Ornitisquio basal con estructuras filamentosas|Jurásico medio-tardío|Siberia (Rusia)|herbívoro|1.5|3|baja|ukureyskaya
tianyulong|Tianyulong|Tianyulong confuciusi|Ornitisquio basal con filamentos|Jurásico tardío – Cretácico temprano|China|herbívoro / omnívoro|0.7|1|baja|yixian
caudipteryx|Caudipterix|Caudipteryx zoui|Terópodo oviraptorosaurio emplumado|Cretácico temprano|China (Fm. Yixian)|omnívoro|0.9|5|media|yixian
anchiornis|Anquiornis|Anchiornis huxleyi|Terópodo emplumado|Jurásico tardío|China|insectívoro / carnívoro|0.4|0.1|media|tiaojishan
yi|Yi qi|Yi qi|Terópodo escansoriopterígido con alas membranosas|Jurásico medio-tardío|China|insectívoro (hipótesis)|0.35|0.4|baja|tiaojishan
confuciusornis|Confuciusornis|Confuciusornis sanctus|Ave basal|Cretácico temprano|China (Fm. Yixian)|omnívoro|0.5|0.5|media|yixian
quetzalcoatlus|Quetzalcoatlus|Quetzalcoatlus northropi|Pterosaurio azhdárquido|Cretácico tardío (Maastrichtiense)|Norteamérica (Texas), llanuras interiores|carnívoro / carroñero (hipótesis)|11|250|baja|hell_creek
pteranodon|Pteranodon|Pteranodon longiceps|Pterosaurio pteranodóntido|Cretácico tardío|Norteamérica, mar interior occidental|piscívoro|6|30|media|niobrara
rhamphorhynchus|Ranforrinco|Rhamphorhynchus muensteri|Pterosaurio ranforrincoideo|Jurásico tardío|Alemania, lagunas y costas|piscívoro|1.8|0.5|media|solnhofen
pterodactylus|Pterodáctilo|Pterodactylus antiquus|Pterosaurio pterodactiloideo|Jurásico tardío|Alemania, lagunas y costas|carnívoro / insectívoro|1.1|1|media|solnhofen
dimorphodon|Dimorfodonte|Dimorphodon macronyx|Pterosaurio basal|Jurásico temprano|Inglaterra, costas|carnívoro / insectívoro|1.4|2|baja|lias
tapejara|Tapejara|Tapejara wellnhoferi|Pterosaurio tapejárido|Cretácico temprano|Brasil|frugívoro / omnívoro (hipótesis)|3.5|5|baja|crato
tupandactylus|Tupandactylus|Tupandactylus imperator|Pterosaurio tapejárido|Cretácico temprano|Brasil|omnívoro (hipótesis)|4.5|8|baja|crato
anhanguera|Anhanguera|Anhanguera blittersdorffi|Pterosaurio anhanguérido|Cretácico temprano|Brasil, costas y lagunas|piscívoro|4.5|10|baja|crato
mosasaurus|Mosasaurio|Mosasaurus hoffmannii|Reptil marino (mosasáurido)|Cretácico tardío (Maastrichtiense)|Mares someros de Europa y Norteamérica|carnívoro|12|5000|media|maastricht_mar
tylosaurus|Tilosaurio|Tylosaurus proriger|Reptil marino (mosasáurido)|Cretácico tardío|Mar interior occidental|carnívoro|12|6000|media|niobrara
prognathodon|Prognatodonte|Prognathodon overtoni|Reptil marino (mosasáurido)|Cretácico tardío|Mar interior occidental|carnívoro (presas duras)|8|2000|baja|niobrara
plesiosaurus|Plesiosaurio|Plesiosaurus dolichodeirus|Reptil marino (plesiosaurio)|Jurásico temprano|Mares de Europa|piscívoro|3.5|300|media|lias
elasmosaurus|Elasmosaurio|Elasmosaurus platyurus|Reptil marino (elasmosáurido)|Cretácico tardío|Mar interior occidental|piscívoro|10|2000|media|niobrara
kronosaurus|Kronosaurio|Kronosaurus queenslandicus|Reptil marino (pliosáurido)|Cretácico temprano|Mares de Australia|carnívoro|9|7000|baja|eromanga_mar
ichthyosaurus|Ictiosaurio|Ichthyosaurus communis|Reptil marino (ictiosaurio)|Jurásico temprano|Mares de Europa|piscívoro|2|90|media|lias
ophthalmosaurus|Oftalmosaurio|Ophthalmosaurus icenicus|Reptil marino (ictiosaurio)|Jurásico medio-tardío|Mares de Europa y Sudamérica|piscívoro / teutófago|5.5|1000|media|oxford_mar
deinosuchus|Deinosuco|Deinosuchus riograndensis|Cocodrilomorfo (aligatoroide)|Cretácico tardío (Campaniense)|Norteamérica, ríos y costas|carnívoro|10|5000|baja|dinosaur_park
sarcosuchus|Sarcosuco|Sarcosuchus imperator|Cocodrilomorfo|Cretácico temprano|Norte de África, ríos|carnívoro (piscívoro)|9|4000|baja|tenere
purussaurus|Purusaurio|Purussaurus brasiliensis|Cocodrilomorfo (caimanino) — NO mesozoico|Mioceno (Cenozoico)|Amazonia, Sudamérica|carnívoro|10|8000|baja|neogeno_amazonia
kaprosuchus|Kaprosuco|Kaprosuchus saharicus|Cocodrilomorfo terrestre|Cretácico medio|Norte de África (Níger)|carnívoro|6|300|baja|kem_kem
xiphactinus|Xifactino|Xiphactinus audax|Pez óseo depredador|Cretácico tardío|Mar interior occidental|carnívoro|5|400|media|niobrara
leedsichthys|Leedsictis|Leedsichthys problematicus|Pez filtrador gigante|Jurásico medio|Mares de Europa|filtrador|14|20000|baja|oxford_mar
beelzebufo|Beelzebufo|Beelzebufo ampinga|Anfibio (rana gigante)|Cretácico tardío|Madagascar|carnívoro (emboscada)|0.4|4|baja|madagascar
repenomamus|Repenomamus|Repenomamus robustus|Mamífero (gobiconodóntido)|Cretácico temprano|China (Fm. Yixian)|carnívoro / carroñero|1|12|media|yixian
didelphodon|Didelfodón|Didelphodon vorax|Mamífero (metaterio)|Cretácico tardío (Maastrichtiense)|Norteamérica occidental|omnívoro (presas duras)|0.5|5|baja|hell_creek
`;

export const COLUMNAS = ['id', 'nombre', 'cientifico', 'grupo', 'periodo', 'region', 'dieta', 'tamano', 'masa', 'confianza', 'ecosistema'];

/** Catálogo completo (filas). `estado` pasa a 'implementado' cuando hay modelo y DETALLE. */
export const CATALOGO = FILAS.trim().split('\n').map((l) => {
  const f = l.split('|');
  const e = {};
  COLUMNAS.forEach((k, i) => { e[k] = f[i]; });
  e.tamano = parseFloat(e.tamano); e.masa = parseFloat(e.masa);
  e.estado = 'catalogado';
  e.era = /Mioceno|Cenozoico/.test(e.periodo) ? 'cenozoico' : /Triásico/.test(e.periodo) ? 'triasico' : /Jurásico/.test(e.periodo) ? 'jurasico' : 'cretacico';
  e.tipoAnimal = /Pterosaurio/.test(e.grupo) ? 'pterosaurio' : /Reptil marino/.test(e.grupo) ? 'reptil_marino' : /Cocodrilomorfo/.test(e.grupo) ? 'cocodrilomorfo' : /Pez/.test(e.grupo) ? 'pez' : /Anfibio|Mamífero/.test(e.grupo) ? 'otro' : /Ave basal/.test(e.grupo) ? 'dinosaurio_ave' : 'dinosaurio';
  return e;
});
export const POR_ID = Object.fromEntries(CATALOGO.map((e) => [e.id, e]));

// Fauna acuática, pequeña y flora: pendientes de modelo; se listan por separado para no mezclar con dinosaurios.
export const FLORA_MESOZOICA = [
  { id: 'helechos_arboreos', nombre: 'Helechos arbóreos (Cyatheales)', periodo: 'Triásico – actualidad', nota: 'Presentes en toda la era; base del sotobosque.' },
  { id: 'cicadas', nombre: 'Cícadas y bennettitales', periodo: 'Triásico – Cretácico', nota: 'Dominantes en el Jurásico; palmeras actuales no existían como tal.' },
  { id: 'coniferas', nombre: 'Coníferas (Araucaria, Podocarpus, Metasequoia)', periodo: 'Triásico – Cretácico', nota: 'Bosques altos del Jurásico y Cretácico.' },
  { id: 'ginkgos', nombre: 'Ginkgos', periodo: 'Jurásico – Cretácico', nota: 'Muy extendidos en el hemisferio norte.' },
  { id: 'equisetos', nombre: 'Equisetos (colas de caballo)', periodo: 'Paleozoico – actualidad', nota: 'Orillas húmedas.' },
  { id: 'angiospermas_tempranas', nombre: 'Angiospermas tempranas (magnoliidas, plátanos primitivos)', periodo: 'Cretácico temprano en adelante', nota: 'Incompatibles con ecosistemas del Jurásico.' },
];

// ----------------------------------------------------------------------------------------------------------------------------------------------
// DETALLE de las especies implementadas. Estos números alimentan la IA real (species.js → derivarIA).
//   sentidos.vista (m, en condiciones de luz plena) · fov (rad, campo visual total) · oido (m con ruido 1.0) · olfato (m a favor del viento)
//   energia.esprint (s de carrera a tope) · energia.recup (fracción/s en reposo) · hambre.tasa (fracción por minuto de juego) · hambre.caza (umbral)
// ----------------------------------------------------------------------------------------------------------------------------------------------
export const DETALLE = {
  tyrannosaurus: {
    temperamento: 'territorial', social: 'solitario (hipótesis de grupos familiares: debatida)', ciclo: 'activo de día y de noche; descansa tras comer',
    sentidos: { vista: 70, fov: 1.7, oido: 90, olfato: 160 }, energia: { esprint: 11, recup: 0.045 }, hambre: { tasa: 0.05, caza: 0.45 },
    caza: ['gallimimus', 'parasaurolophus', 'stegosaurus', 'triceratops', 'ankylosaurus'], teme: [], peligro: 1.0,
    habilidades: ['rastreo_olor', 'acecho', 'exhibicion_territorial', 'defensa_cadaver', 'carroneo', 'abandonar_caza'],
    habParams: { acecho: { dEmboscada: 16 } },
    vulnerabilidades: 'cuello y flancos; la fatiga limita la persecución; los brazos son vestigiales',
    interacciones: 'Depredador tope. Solo caza presa asequible (valora riesgo/beneficio) y reclama cadáveres.',
    cosecha: [['carne_cruda', 14], ['cuero', 8], ['hueso', 8]], doma: { max: 3, nota: 'Se puede habituar a tu presencia si está saciado y la observas desde lejos, pero nunca pasa de ahí.', riesgo: 'Habituado no es manso: pierde el recelo hacia ti y, si vuelve a tener hambre, te caza igual.', comida: { carne_cruda: 0.35, carne_cocida: 0.5 }, hab: { seg: 600, dMin: 18 }, ofrendas: 8 }, montura: false,
    reproduccion: 'huevos en nido; no implementada', confianza: { anatomia: 'alta', comportamiento: 'media' },
    licencia: 'Velocidad punta (7 m/s) y rugido son licencias de juego; la locomoción real está en debate (≈5–8 m/s como máximo). Sin plumas visibles (hipótesis de plumaje parcial no representada).',
  },
  raptor: {
    temperamento: 'agresivo (ficción)', social: 'manada (ficción: no hay evidencia de caza coordinada)', ciclo: 'activo de día; duerme en madriguera nocturna (no modelada)',
    sentidos: { vista: 42, fov: 2.0, oido: 55, olfato: 70 }, energia: { esprint: 9, recup: 0.06 }, hambre: { tasa: 0.07, caza: 0.35 },
    caza: ['compsognatus', 'gallimimus'], teme: ['tyrannosaurus'], peligro: 0.55,
    habilidades: ['rastreo_olor', 'acecho', 'emboscada', 'carroneo', 'abandonar_caza', 'llamada_alerta'],
    habParams: { acecho: { dEmboscada: 11 }, llamada_alerta: { radio: 90, cd: 20, solo: ['depredador_mayor'] } },
    vulnerabilidades: 'poca resistencia; huye si queda herido',
    interacciones: 'Caza presas pequeñas y acosa al jugador en grupo. Evita al Tyrannosaurus.',
    cosecha: [['carne_cruda', 3], ['cuero', 2], ['hueso', 1]], doma: { max: 3, nota: 'Se habitúa si está saciado y no te acercas; jamás obedece.', riesgo: 'Un raptor habituado te ignora mientras esté lleno; con hambre ataca (y en manada).', comida: { carne_cruda: 0.3, carne_cocida: 0.45 }, hab: { seg: 420, dMin: 32 }, ofrendas: 8 }, montura: false,
    reproduccion: 'no implementada', confianza: { anatomia: 'ficcion', comportamiento: 'ficcion' },
    licencia: 'FICCIÓN: “raptor” sin plumas, tamaño de Deinonychus/Utahraptor con cabeza y garra de la saga cinematográfica. Los dromeosáuridos reales estaban emplumados.',
  },
  compsognatus: {
    temperamento: 'tímido', social: 'grupos pequeños (ficción parcial)', ciclo: 'activo de día',
    sentidos: { vista: 22, fov: 3.4, oido: 40, olfato: 45 }, energia: { esprint: 7, recup: 0.08 }, hambre: { tasa: 0.1, caza: 0.3 },
    caza: [], teme: ['raptor', 'tyrannosaurus'], peligro: 0.05,
    habilidades: ['llamada_alerta', 'carroneo', 'esprint_zigzag'],
    habParams: { llamada_alerta: { radio: 50, cd: 12, solo: ['depredador_mayor', 'jugador'] } },
    vulnerabilidades: 'presa de todos los depredadores', interacciones: 'Carroñero oportunista y cazador de lagartos (contenido estomacal fósil).',
    cosecha: [['carne_cruda', 1]], doma: { max: 4, nota: 'Pequeño y tímido: se habitúa y acepta un collar. Es compañía, no animal de trabajo.', riesgo: 'Se asusta con ruidos fuertes y huye si lo golpeas.', comida: { carne_cruda: 0.3, carne_cocida: 0.4 }, hab: { seg: 150 }, ofrendas: 4, manejo: { nivel: 0, equipo: 'collar_id' } }, montura: false,
    reproduccion: 'no implementada', confianza: { anatomia: 'media', comportamiento: 'media' },
    licencia: 'Vida en grupos: licencia de juego.',
  },
  gallimimus: {
    temperamento: 'tímido', social: 'rebaño (hipótesis: rastros de juveniles agrupados)', ciclo: 'activo de día; descansa agrupado',
    sentidos: { vista: 60, fov: 4.6, oido: 70, olfato: 40 }, energia: { esprint: 16, recup: 0.05 }, hambre: { tasa: 0.05, caza: 1 },
    caza: [], teme: ['tyrannosaurus', 'raptor'], peligro: 0.1, coordinada: true,
    habilidades: ['llamada_alerta', 'huida_coordinada', 'esprint_zigzag'],
    habParams: { llamada_alerta: { radio: 120, cd: 18, solo: ['depredador_mayor', 'jugador'] } },
    vulnerabilidades: 'sin armas; depende de la velocidad y de la vigilancia del rebaño', interacciones: 'Presa principal de los depredadores medianos.',
    cosecha: [['carne_cruda', 5], ['cuero', 2], ['hueso', 2]], doma: { max: 6, nota: 'Herbívoro gregario y veloz: se habitúa con paciencia, aprende a seguirte y, bien cuidado, tolera una montura ligera.', riesgo: 'Muy asustadizo: cualquier carrera o golpe cerca de él deshace la habituación. Si pasa hambre, pierde la confianza.', comida: { baya: 0.18, hoja_grande: 0.22 }, hab: { seg: 150 }, ofrendas: 4, manejo: { nivel: 0, equipo: 'cabestro' }, cuidado: { dias: 1.5, biomas: ['pradera', 'playa', 'selva'] } }, montura: { jinete: true, tipos: ['ligera'], carga: { items: ['bolsa_carga'], mul: 0.8 }, proteccion: false, arnes: true, ancla: [0, 2.3, 0.2], nota: 'Dorso estrecho pero largo: una silla baja y bolsas pequeñas; no soporta alforjas ni coraza.' },
    reproduccion: 'huevos en nido; no implementada', confianza: { anatomia: 'media', comportamiento: 'baja' },
    licencia: 'Velocidad (14 m/s) es una estimación derivada de las proporciones de las patas.',
  },
  parasaurolophus: {
    temperamento: 'tímido', social: 'rebaño (huellas y yacimientos de hadrosaurios sugieren vida gregaria)', ciclo: 'alimentación y descanso por turnos con centinelas',
    sentidos: { vista: 85, fov: 4.4, oido: 130, olfato: 35 }, energia: { esprint: 13, recup: 0.05 }, hambre: { tasa: 0.05, caza: 1 },
    caza: [], teme: ['tyrannosaurus', 'raptor'], peligro: 0.2, coordinada: true, vigia: true,
    habilidades: ['escaneo_vigia', 'llamada_alerta', 'huida_coordinada'],
    habParams: { escaneo_vigia: { radio: 85, cada: 9, falsosPositivos: 0.06 }, llamada_alerta: { radio: 220, cd: 16, solo: ['depredador_mayor', 'jugador'] } },
    vulnerabilidades: 'sin defensas activas salvo huida y vigilancia', interacciones: 'Presa de grandes depredadores. Su cresta hueca amplifica llamadas de baja frecuencia (hipótesis con modelos de resonancia).',
    cosecha: [['carne_cruda', 8], ['cuero', 4], ['hueso', 4]], doma: { max: 6, nota: 'Rebaño tranquilo y fuerte: se domestica con paciencia y alimento vegetal, y acepta silla de transporte y alforjas.', riesgo: 'Su vigía lo delata todo: si lo asustas, avisa a todo el rebaño. Sin comida ni descanso, deja de seguirte.', comida: { hoja_grande: 0.25, baya: 0.15, liana: 0.1 }, hab: { seg: 240 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'cabestro' }, cuidado: { dias: 2, biomas: ['pradera', 'selva'] } }, montura: { jinete: true, tipos: ['transporte'], carga: { items: ['alforjas', 'bolsa_carga'], mul: 1 }, proteccion: false, arnes: true, ancla: [0, 3.25, -0.3], nota: 'Dorso ancho y paso firme: silla de transporte y alforjas.' },
    reproduccion: 'huevos en nido; no implementada', confianza: { anatomia: 'alta', comportamiento: 'media' },
    licencia: 'NO es el Parasaur de ARK: aquí solo tiene vigilancia por sentidos reales (oído fino, campo visual amplio) y llamada de alarma. Sin detección “mágica” de radio completo; depende de oclusión, ruido y distancia, con falsos positivos.',
  },
  stegosaurus: {
    temperamento: 'defensivo', social: 'pequeños grupos o solitario (poca evidencia)', ciclo: 'ramonea a baja altura durante el día',
    sentidos: { vista: 28, fov: 3.6, oido: 45, olfato: 40 }, energia: { esprint: 6, recup: 0.05 }, hambre: { tasa: 0.04, caza: 1 },
    caza: [], teme: ['tyrannosaurus', 'raptor'], peligro: 0.65, defiende: true,
    habilidades: ['cola_defensiva', 'movilidad_reducida'],
    habParams: { cola_defensiva: { radio: 5.6, dano: 34 } },
    vulnerabilidades: 'cabeza pequeña y baja, cuello expuesto; lento', interacciones: 'Se coloca de lado y golpea con el thagomizer. Una cicatriz fósil en un Allosaurus encaja con una púa de estegosaurio.',
    cosecha: [['carne_cruda', 10], ['cuero', 6], ['hueso', 6]], doma: { max: 5, nota: 'Herbívoro lento: puede domesticarse, pero sus placas y púas impiden cualquier silla o carga.', riesgo: 'Su cola es un arma: si lo irritas, golpea con fuerza aunque esté domesticado de palabra.', comida: { hoja_grande: 0.25, liana: 0.2, baya: 0.12 }, hab: { seg: 300 }, ofrendas: 6, manejo: { nivel: 1, equipo: 'cabestro' }, cuidado: { dias: 2.5, biomas: ['pradera', 'selva'] } }, montura: false,
    reproduccion: 'no implementada', confianza: { anatomia: 'alta', comportamiento: 'media' },
    licencia: 'Función de las placas (exhibición/termorregulación) no representada mecánicamente.',
  },
  ankylosaurus: {
    temperamento: 'defensivo', social: 'solitario o parejas', ciclo: 'ramonea vegetación baja',
    sentidos: { vista: 26, fov: 3.4, oido: 50, olfato: 70 }, energia: { esprint: 4, recup: 0.04 }, hambre: { tasa: 0.04, caza: 1 },
    caza: [], teme: ['tyrannosaurus', 'raptor'], peligro: 0.75, defiende: true,
    habilidades: ['armadura_natural', 'cola_defensiva', 'movilidad_reducida'],
    habParams: { cola_defensiva: { radio: 5.0, dano: 46, aturde: 1.2 } },
    vulnerabilidades: 'vientre blando (si se le vuelca); lento', interacciones: 'La maza caudal rompe huesos (modelos biomecánicos). Reduce el daño de ataques frontales y dorsales.',
    cosecha: [['carne_cruda', 8], ['cuero', 10], ['hueso', 7]], doma: { max: 4, nota: 'Se puede habituar y guiar con cabestro, pero no se domestica del todo: su instinto defensivo es demasiado fuerte.', riesgo: 'Su maza caudal rompe huesos. Cualquier susto brusco puede provocar un golpe.', comida: { hoja_grande: 0.2, baya: 0.15, liana: 0.1 }, hab: { seg: 420 }, ofrendas: 8, manejo: { nivel: 2, equipo: 'cabestro' } }, montura: false,
    reproduccion: 'no implementada', confianza: { anatomia: 'alta', comportamiento: 'media' },
    licencia: 'Velocidad y giro lentos por reconstrucción de masa; no puede huir lejos.',
  },
  triceratops: {
    temperamento: 'defensivo', social: 'pequeños grupos (yacimientos de juveniles; gregarismo adulto discutido)', ciclo: 'ramonea y descansa de día',
    sentidos: { vista: 26, fov: 3.0, oido: 55, olfato: 55 }, energia: { esprint: 7, recup: 0.04 }, hambre: { tasa: 0.04, caza: 1 },
    caza: [], teme: ['tyrannosaurus', 'raptor'], peligro: 0.8, defiende: true,
    habilidades: ['embestida', 'formacion_defensiva', 'postura_intimidacion'],
    habParams: { embestida: { dano: 28 }, postura_intimidacion: { dur: 2.2, radio: 24 } },
    vulnerabilidades: 'flancos y cola; lento al girar', interacciones: 'Marcas de mordida de tiranosáurido en cuernos y huesos sugieren enfrentamientos reales.',
    cosecha: [['carne_cruda', 6], ['cuero', 4], ['hueso', 3]], doma: { max: 6, nota: 'Herbívoro defensivo: cuesta habituarlo, pero una vez domesticado es el animal de carga más fuerte; admite montura reforzada y coraza.', riesgo: 'Si lo asustas dentro de su distancia de defensa, embiste. Domesticado, sigue defendiéndose de los depredadores.', comida: { hoja_grande: 0.25, liana: 0.15, baya: 0.12 }, hab: { seg: 300 }, ofrendas: 6, manejo: { nivel: 1, equipo: 'cabestro' }, cuidado: { dias: 3, biomas: ['pradera', 'selva'] } }, montura: { jinete: true, tipos: ['transporte', 'reforzada'], carga: { items: ['alforjas', 'bolsa_carga'], mul: 1.3 }, proteccion: true, arnes: true, ancla: [0, 2.85, 0.4], nota: 'Lomo ancho tras la gola: silla de transporte o reforzada, alforjas y protección.' },
    reproduccion: 'no implementada', confianza: { anatomia: 'alta', comportamiento: 'media' },
    licencia: 'La formación defensiva en círculo es una hipótesis inspirada en bóvidos actuales.',
  },
  braquiosaurio: {
    temperamento: 'pasivo', social: 'rebaño (huellas de saurópodos)', ciclo: 'ramonea casi todo el día',
    sentidos: { vista: 40, fov: 3.0, oido: 70, olfato: 20 }, energia: { esprint: 3, recup: 0.03 }, hambre: { tasa: 0.03, caza: 1 },
    caza: [], teme: [], peligro: 0.5,
    habilidades: ['pisoteo'],
    habParams: { pisoteo: { dano: 45, radio: 1.35 } },
    vulnerabilidades: 'prácticamente inmune a depredadores solitarios; vulnerable por tamaño solo en juveniles', interacciones: 'Su paso daña a quien esté bajo sus pies.',
    cosecha: [['carne_cruda', 10], ['cuero', 6], ['hueso', 5]], doma: { max: 3, nota: 'Un gigante pacífico: se habitúa, pero su tamaño impide manejarlo o equiparlo.', riesgo: 'Al caminar puede aplastar sin querer a quien esté a sus pies.', comida: { hoja_grande: 0.3, liana: 0.2 }, hab: { seg: 360 }, ofrendas: 6 }, montura: false,
    reproduccion: 'no implementada', confianza: { anatomia: 'media', comportamiento: 'baja' },
    licencia: 'Escala y posición del cuello alto son interpretación del modelo.',
  },
  pteranodon: {
    temperamento: 'tímido', social: 'bandadas costeras (hipótesis)', ciclo: 'planea de día',
    sentidos: { vista: 160, fov: 4.0, oido: 40, olfato: 0 }, energia: { esprint: 30, recup: 0.1 }, hambre: { tasa: 0.03, caza: 1 },
    caza: [], teme: [], peligro: 0.05,
    habilidades: [],
    vulnerabilidades: 'frágil', interacciones: 'Vuela en círculos sobre la isla.',
    cosecha: [['carne_cruda', 2], ['cuero', 2], ['hueso', 1]], doma: { max: 0, nota: 'Animal volador: no se puede habituar ni manejar con los medios del juego.', comida: {}, hab: { seg: 1 }, ofrendas: 1 }, montura: false,
    reproduccion: 'no implementada', confianza: { anatomia: 'media', comportamiento: 'baja' },
    licencia: 'Sin pesca ni descanso en acantilados todavía (pendiente).',
  },
};

// Ecosistemas coherentes (período + región). 'isla_ficcion' es la licencia de juego: mezcla deliberada.
export const ECOSISTEMAS = {
  isla_ficcion: { nombre: 'Isla de ficción (mezcla deliberada)', nota: 'LICENCIA: reúne especies de distintos períodos y continentes en un refugio imaginario. No es un ecosistema real.', todas: true },
  hell_creek: { nombre: 'Hell Creek (Maastrichtiense, Norteamérica)', especies: ['tyrannosaurus', 'triceratops', 'ankylosaurus'], nota: 'Conjunto coherente; faltan Edmontosaurus, Thescelosaurus y Ornithomimus (catalogados).' },
  morrison: { nombre: 'Formación Morrison (Jurásico tardío, Norteamérica)', especies: ['stegosaurus', 'braquiosaurio'], nota: 'Faltan Allosaurus, Diplodocus, Camarasaurus (catalogados).' },
  nemegt: { nombre: 'Nemegt (Cretácico tardío, Mongolia)', especies: ['gallimimus'], nota: 'Faltan Tarbosaurus y Saurolophus (catalogados).' },
};
export function especiesDeEcosistema(id) {
  const e = ECOSISTEMAS[id];
  return !e || e.todas ? null : e.especies;
}

/** Marca como implementadas las especies con DETALLE (se llama desde species.js). */
export function marcarImplementadas(ids) {
  for (const id of ids) if (POR_ID[id]) POR_ID[id].estado = 'implementado';
}

export function resumen() {
  const por = {};
  for (const e of CATALOGO) { por[e.estado] = (por[e.estado] ?? 0) + 1; }
  return { total: CATALOGO.length, ...por };
}
