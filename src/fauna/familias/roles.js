// ROLES ECOLÓGICOS — plantillas de comportamiento por grupo funcional (no por especie): cómo ve, oye y huele, qué habilidades usa, cuánto daño hace,
// cómo se aprovecha su cadáver y hasta dónde se puede domesticar. Cada especie elige un rol y puede sobrescribir lo que la distinga (ver las tablas
// de familia). Los números siguen escalas por masa/longitud (nucleo.js) calibradas con las especies hechas a mano (T. rex, raptor, Parasaurolophus…).
import { danoDe, cdDe, peligroDepredador, clamp } from './nucleo-medidas.js';

const L3 = (L) => Math.pow(Math.max(0.3, L), 0.3);
const cuidadoH = (biomas = ['pradera', 'selva']) => ({ dias: 2, biomas });
const MONT = (m, nota) => {
  const { masa, g } = m;
  if (!g.ancla || masa < 350 || masa > 12000) return false;
  const tipo = masa < 1300 ? 'ligera' : 'transporte';
  return { jinete: true, tipos: [tipo], carga: { items: tipo === 'ligera' ? ['bolsa_carga'] : ['alforjas', 'bolsa_carga'], mul: tipo === 'ligera' ? 0.8 : 1 }, proteccion: false, arnes: true, ancla: g.ancla, nota: nota ?? (tipo === 'ligera' ? 'Dorso largo y estrecho: una silla baja y bolsas pequeñas.' : 'Dorso ancho y paso firme: silla de transporte y alforjas.') };
};

export const ROLES = {
  // ------------------------------------------------------------------------------------------------ depredadores
  gran_pred: {
    tipo: 'depredador', temperamento: 'territorial', ciclo: 'activo de día y de noche; descansa tras comer', cazaUmbral: 0.45,
    sent: { vista: 36, fov: 1.75, oido: 45, olfato: 75 },
    ai: (m) => ({ ataque: clamp(0.3 * m.L, 1.4, 4.4), dano: danoDe(m.masa), cd: cdDe(m.masa), huye: 0.15 }),
    energia: (m) => ({ esprint: clamp(6 + 0.4 * m.L, 7, 12), recup: 0.045 }),
    peligro: (m) => peligroDepredador(m.masa),
    social: () => 'solitario o en parejas (conducta de grupo: hipótesis)',
    hab: ['rastreo_olor', 'acecho', 'exhibicion_territorial', 'defensa_cadaver', 'carroneo', 'abandonar_caza'],
    habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 1.3, 8, 17) } }),
    vul: 'cuello y flancos; la fatiga limita la persecución',
    inter: () => 'Depredador de gran talla de su ecosistema: solo caza presa asequible (valora riesgo/beneficio) y reclama cadáveres.',
    cos: (m) => ({ diente: 2 + m.masa / 1500, rasgos: 0 }),
    doma: () => ({ max: 3, nota: 'Se puede habituar a tu presencia si está saciado y lo observas desde lejos, pero nunca pasa de ahí.', riesgo: 'Habituado no es manso: pierde el recelo hacia ti y, si vuelve a tener hambre, te caza igual.', comida: { carne_cruda: 0.35, carne_cocida: 0.5 }, hab: { seg: 600, dMin: 18 }, ofrendas: 8 }),
  },
  pred_manada: {
    tipo: 'depredador', temperamento: 'agresivo', ciclo: 'activo de día; descansa en grupo', cazaUmbral: 0.35,
    sent: { vista: 32, fov: 2.0, oido: 40, olfato: 55 },
    ai: (m) => ({ ataque: clamp(0.4 * m.L, 1.3, 3), dano: danoDe(m.masa), cd: cdDe(m.masa), agresivo: true, manada: true, huye: 0.2 }),
    energia: () => ({ esprint: 9, recup: 0.06 }),
    peligro: (m) => peligroDepredador(m.masa),
    social: () => 'grupos pequeños (la caza coordinada es hipótesis; algunos yacimientos sugieren agrupación)',
    hab: ['rastreo_olor', 'acecho', 'emboscada', 'carroneo', 'abandonar_caza', 'llamada_alerta'],
    habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 2.2, 5, 11) }, llamada_alerta: { radio: 90, cd: 20, solo: ['depredador_mayor'] } }),
    vul: 'poca resistencia; huye si queda herido',
    inter: () => 'Cazador veloz de presas medianas y pequeñas; acosa en grupo.',
    cos: () => ({ diente: 2 }),
    doma: () => ({ max: 3, nota: 'Se habitúa si está saciado y no te acercas; jamás obedece.', riesgo: 'Un depredador habituado te ignora mientras esté lleno; con hambre ataca (y en manada).', comida: { carne_cruda: 0.3, carne_cocida: 0.45 }, hab: { seg: 420, dMin: 32 }, ofrendas: 8 }),
  },
  pred_solitario: {
    tipo: 'depredador', temperamento: 'cauteloso', ciclo: 'crepuscular y diurno', cazaUmbral: 0.4,
    sent: { vista: 34, fov: 1.9, oido: 42, olfato: 62 },
    ai: (m) => ({ ataque: clamp(0.32 * m.L, 1.2, 3.2), dano: danoDe(m.masa), cd: cdDe(m.masa), huye: 0.25 }),
    energia: () => ({ esprint: 8, recup: 0.055 }),
    peligro: (m) => peligroDepredador(m.masa),
    social: () => 'solitario',
    hab: ['rastreo_olor', 'acecho', 'emboscada', 'carroneo', 'abandonar_caza'],
    habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 1.8, 4, 12) } }),
    vul: 'sin armadura; evita enfrentarse a presas que se defienden',
    inter: () => 'Cazador de emboscada de presas medianas.',
    cos: () => ({ diente: 2 }),
    doma: () => ({ max: 3, nota: 'Solo se habitúa: no deja de ser un cazador.', riesgo: 'Con hambre ataca igual.', comida: { carne_cruda: 0.3, carne_cocida: 0.45 }, hab: { seg: 420, dMin: 26 }, ofrendas: 8 }),
  },
  pred_pequeno: {
    tipo: 'presa', temperamento: 'tímido', ciclo: 'activo de día y al anochecer', cazaUmbral: 0.3,
    sent: { vista: 26, fov: 3.0, oido: 38, olfato: 42 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(10 + 4 * m.L, 10, 22), manada: m.L > 1 }),
    energia: () => ({ esprint: 8, recup: 0.07 }),
    peligro: () => 0.06,
    social: () => 'solitario o en grupos pequeños',
    hab: ['llamada_alerta', 'carroneo', 'esprint_zigzag'],
    habParams: () => ({ llamada_alerta: { radio: 50, cd: 14, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'presa de todos los depredadores',
    inter: () => 'Caza invertebrados y pequeños vertebrados, y carroñea; huye de casi todo.',
    doma: () => ({ max: 4, nota: 'Pequeño y tímido: se habitúa y acepta un collar. Es compañía, no animal de trabajo.', riesgo: 'Se asusta con ruidos fuertes y huye si lo golpeas.', comida: { carne_cruda: 0.3, carne_cocida: 0.4 }, hab: { seg: 160 }, ofrendas: 4, manejo: { nivel: 0, equipo: 'collar_id' } }),
  },

  // ------------------------------------------------------------------------------------------------ omnívoros veloces y pequeños herbívoros
  corredor: {
    tipo: 'presa', temperamento: 'tímido', ciclo: 'activo de día; descansa agrupado', coordinada: true,
    sent: { vista: 36, fov: 4.6, oido: 48, olfato: 28 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(18 + 5 * m.L, 20, 36), manada: true }),
    energia: () => ({ esprint: 16, recup: 0.05 }),
    peligro: () => 0.1,
    social: () => 'rebaño (hipótesis)',
    hab: ['llamada_alerta', 'huida_coordinada', 'esprint_zigzag'],
    habParams: (m) => ({ llamada_alerta: { radio: clamp(60 + 8 * m.L, 70, 120), cd: 18, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'sin armas; depende de la velocidad y de la vigilancia del rebaño',
    inter: () => 'Presa principal de los depredadores medianos; omnívoro oportunista.',
    doma: (m) => ({ max: m.masa > 300 ? 6 : 5, nota: m.masa > 300 ? 'Gregario y veloz: se habitúa con paciencia, aprende a seguirte y, bien cuidado, tolera una montura ligera.' : 'Gregario y veloz: se habitúa y puede seguirte, pero es demasiado ligero para cargas.', riesgo: 'Muy asustadizo: cualquier carrera o golpe cerca de él deshace la habituación. Si pasa hambre, pierde la confianza.', comida: { baya: 0.18, hoja_grande: 0.22 }, hab: { seg: 150 }, ofrendas: 4, manejo: { nivel: 0, equipo: 'cabestro' }, cuidado: cuidadoH(['pradera', 'playa', 'selva']) }),
    montura: (m) => MONT(m, 'Dorso estrecho pero largo: una silla baja y bolsas pequeñas; no soporta alforjas ni coraza.'),
  },
  omnivoro_ave: {
    tipo: 'presa', temperamento: 'cauteloso', ciclo: 'activo de día', coordinada: false,
    sent: { vista: 36, fov: 3.8, oido: 45, olfato: 30 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(14 + 4 * m.L, 14, 26), manada: m.L > 2 }),
    energia: () => ({ esprint: 11, recup: 0.06 }),
    peligro: () => 0.14,
    social: () => 'parejas o grupos pequeños; cuidado de nidos (hipótesis: hay adultos fosilizados sobre nidos)',
    hab: ['llamada_alerta', 'esprint_zigzag'],
    habParams: () => ({ llamada_alerta: { radio: 70, cd: 16, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'sin armas salvo las garras de las manos; huye',
    inter: () => 'Omnívoro de dieta variada (frutos, semillas, pequeños animales y huevos).',
    doma: (m) => ({ max: m.masa > 60 ? 5 : 4, nota: 'Pico y garras inofensivos para ti si lo tratas con calma: se habitúa y acepta un cabestro.', riesgo: 'Defiende su nido a picotazos y arañazos.', comida: { baya: 0.2, hoja_grande: 0.12, carne_cruda: 0.12 }, hab: { seg: 220 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'collar_id' } }),
  },
  pequeno_herb: {
    tipo: 'presa', temperamento: 'tímido', ciclo: 'activo de día; ramonea cerca de la cobertura', coordinada: true,
    sent: { vista: 32, fov: 4.2, oido: 46, olfato: 26 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(16 + 5 * m.L, 16, 30), manada: true }),
    energia: () => ({ esprint: 12, recup: 0.07 }),
    peligro: () => 0.05,
    social: () => 'grupos o rebaños pequeños (hipótesis: hallazgos agrupados)',
    hab: ['llamada_alerta', 'huida_coordinada', 'esprint_zigzag'],
    habParams: () => ({ llamada_alerta: { radio: 80, cd: 16, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'presa de casi todos los depredadores; sin defensas activas',
    inter: () => 'Ramoneador de vegetación baja; da la alarma y se dispersa en zigzag.',
    doma: (m) => ({ max: m.masa > 25 ? 5 : 4, nota: 'Pequeño y asustadizo: se habitúa con paciencia y alimento vegetal.', riesgo: 'Huye con cualquier movimiento brusco.', comida: { baya: 0.2, hoja_grande: 0.2, liana: 0.1 }, hab: { seg: 150 }, ofrendas: 4, manejo: { nivel: 0, equipo: 'collar_id' } }),
  },
  herbivoro_vigia: {
    tipo: 'herbivoro', temperamento: 'tímido', ciclo: 'alimentación y descanso por turnos con centinelas', coordinada: true, vigia: true,
    sent: { vista: 36, fov: 4.4, oido: 58, olfato: 20 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(26 + 1.2 * m.L, 28, 44), manada: true }),
    energia: () => ({ esprint: 13, recup: 0.05 }),
    peligro: (m) => clamp(0.12 * Math.log10(Math.max(10, m.masa)) - 0.22, 0.05, 0.4),
    social: () => 'rebaño (hallazgos de grupos y rastros de manada)',
    hab: ['escaneo_vigia', 'llamada_alerta', 'huida_coordinada'],
    habParams: (m) => ({ escaneo_vigia: { radio: 70 + 1.5 * m.L, cada: 9, falsosPositivos: 0.06 }, llamada_alerta: { radio: clamp(120 + 9 * m.L, 150, 230), cd: 16, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'sin defensas activas salvo huida y vigilancia',
    inter: () => 'Presa de grandes depredadores; los centinelas del rebaño dan la alarma.',
    doma: () => ({ max: 6, nota: 'Rebaño tranquilo: se domestica con paciencia y alimento vegetal, y acepta silla de transporte y alforjas.', riesgo: 'Su vigía lo delata todo: si lo asustas, avisa a todo el rebaño. Sin comida ni descanso, deja de seguirte.', comida: { hoja_grande: 0.25, baya: 0.15, liana: 0.1 }, hab: { seg: 240 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'cabestro' }, cuidado: cuidadoH() }),
    montura: (m) => MONT(m),
  },
  herbivoro_defensivo: {
    tipo: 'herbivoro', temperamento: 'defensivo', ciclo: 'ramonea y descansa de día',
    sent: { vista: 20, fov: 3.4, oido: 36, olfato: 34 },
    ai: (m) => ({ ataque: clamp(0.3 * m.L, 1.4, 3.4), dano: Math.round(danoDe(m.masa) * 0.8), cd: cdDe(m.masa) + 0.4, defiende: true, huye: 0 }),
    energia: () => ({ esprint: 6, recup: 0.05 }),
    peligro: (m) => +clamp(0.25 + 0.15 * Math.log10(Math.max(10, m.masa)), 0.2, 0.85).toFixed(2),
    social: () => 'pequeños grupos o solitario',
    hab: ['postura_intimidacion', 'embestida'],
    habParams: (m) => ({ embestida: { dano: Math.round(danoDe(m.masa) * 0.75) }, postura_intimidacion: { dur: 2.2, radio: 22 } }),
    vul: 'flancos y cola; lento al girar',
    inter: () => 'Se planta y embiste antes que huir.',
    doma: (m) => ({ max: 4, nota: 'Defensivo: se puede habituar y guiar con cabestro, pero no se domestica del todo.', riesgo: 'Si lo asustas dentro de su distancia de defensa, embiste.', comida: { hoja_grande: 0.25, liana: 0.15, baya: 0.12 }, hab: { seg: 330 }, ofrendas: 7, manejo: { nivel: 1, equipo: 'cabestro' } }),
  },
  omnivoro_basal: {
    tipo: 'presa', temperamento: 'tímido', ciclo: 'activo de día; se refugia en madrigueras o entre rocas',
    sent: { vista: 26, fov: 3.6, oido: 42, olfato: 40 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(12 + 4 * m.L, 12, 24), manada: m.L > 1 }),
    energia: () => ({ esprint: 9, recup: 0.07 }),
    peligro: () => 0.06,
    social: () => 'solitario o en grupos pequeños',
    hab: ['llamada_alerta', 'esprint_zigzag'],
    habParams: () => ({ llamada_alerta: { radio: 55, cd: 14, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'presa de casi todos los depredadores',
    inter: () => 'Omnívoro de dieta mixta (plantas bajas, insectos y pequeños animales).',
    doma: () => ({ max: 4, nota: 'Pequeño: se habitúa y acepta un collar. Es compañía, no animal de trabajo.', riesgo: 'Huye si lo asustas.', comida: { baya: 0.2, carne_cruda: 0.15, hoja_grande: 0.1 }, hab: { seg: 150 }, ofrendas: 4, manejo: { nivel: 0, equipo: 'collar_id' } }),
  },
  sauropodomorfo: {
    tipo: 'herbivoro', temperamento: 'pasivo', ciclo: 'ramonea a media altura casi todo el día', coordinada: true, vigia: true,
    sent: { vista: 30, fov: 3.6, oido: 50, olfato: 22 },
    ai: (m) => ({ huye: 1, huyeDist: clamp(22 + m.L, 22, 36), manada: true }),
    energia: () => ({ esprint: 8, recup: 0.05 }),
    peligro: (m) => clamp(0.12 * Math.log10(Math.max(10, m.masa)) - 0.22, 0.05, 0.4),
    social: () => 'rebaño (hallazgos de grupos de edades mezcladas)',
    hab: ['escaneo_vigia', 'llamada_alerta', 'huida_coordinada'],
    habParams: () => ({ escaneo_vigia: { radio: 55, cada: 10, falsosPositivos: 0.05 }, llamada_alerta: { radio: 120, cd: 18, solo: ['depredador_mayor', 'jugador'] } }),
    vul: 'sin defensas salvo la garra del pulgar y el rebaño',
    inter: () => 'Ramoneador de hojas a media altura: puede erguirse sobre las patas traseras.',
    doma: () => ({ max: 6, nota: 'Mansos y robustos: se domestican con paciencia y alimento vegetal.', riesgo: 'Su vigía lo delata todo; la garra del pulgar araña si se asusta.', comida: { hoja_grande: 0.25, liana: 0.15, baya: 0.12 }, hab: { seg: 260 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'cabestro' }, cuidado: cuidadoH() }),
    montura: (m) => MONT(m),
  },
};

// ---------------------------------------------------------------------------------------------------------------- cuadrúpedos
// Saurópodos gigantes (≥ 9 t): pasivos, no huyen de un depredador solitario; su paso es el arma (pisoteo). Calibrado con el braquiosaurio hecho a mano.
ROLES.saur_gigante = {
  tipo: 'herbivoro', temperamento: 'pasivo', ciclo: 'ramonea casi todo el día', blindaje: 1.1,
  sent: { vista: 40, fov: 3.0, oido: 70, olfato: 20 },
  ai: () => ({ pasivo: true, manada: true }),
  energia: () => ({ esprint: 3, recup: 0.03 }),
  peligro: (m) => +clamp(0.2 * Math.log10(Math.max(100, m.masa)) - 0.4, 0.3, 0.7).toFixed(2),
  social: () => 'rebaño (huellas de saurópodos: manadas de edades mezcladas)',
  hab: ['pisoteo'],
  habParams: (m) => ({ pisoteo: { dano: Math.round(15.5 * Math.pow(m.masa / 1000, 0.3)), radio: +clamp(0.06 * m.L, 1.0, 2.2).toFixed(2) } }),
  vul: 'prácticamente inmune a depredadores solitarios; solo los juveniles son presa fácil',
  inter: () => 'Su paso daña a quien esté bajo sus pies. Las crías y juveniles caminan en medio del rebaño.',
  doma: () => ({ max: 3, nota: 'Un gigante pacífico: se habitúa, pero su tamaño impide manejarlo o equiparlo.', riesgo: 'Al caminar puede aplastar sin querer a quien esté a sus pies.', comida: { hoja_grande: 0.3, liana: 0.2 }, hab: { seg: 360 }, ofrendas: 6 }),
  montura: () => false,
};
// Saurópodos y prosaurópodos medianos (< 9 t): rebaño vigilante que huye de los grandes depredadores (mismas habilidades que el rol sauropodomorfo + pisoteo).
ROLES.saur_mediano = {
  ...ROLES.sauropodomorfo, blindaje: 1.1, temperamento: 'pasivo',
  hab: ['escaneo_vigia', 'llamada_alerta', 'huida_coordinada', 'pisoteo'],
  habParams: (m) => ({ ...ROLES.sauropodomorfo.habParams(m), pisoteo: { dano: Math.round(15.5 * Math.pow(m.masa / 1000, 0.3)), radio: +clamp(0.06 * m.L, 0.8, 1.6).toFixed(2) } }),
  inter: () => 'Ramoneador de hojas y helechos a diferentes alturas; su pisada daña a quien quede debajo. Huye en rebaño ante los grandes depredadores.',
  doma: (m) => ({ max: m.masa > 3000 ? 4 : 6, nota: m.masa > 3000 ? 'Grande y manso: se habitúa y sigue al jugador, pero cuesta manejarlo.' : 'Mansos y robustos: se domestican con paciencia y alimento vegetal.', riesgo: 'Su vigía lo delata todo; si se asusta, pisotea sin mirar.', comida: { hoja_grande: 0.25, liana: 0.15, baya: 0.12 }, hab: { seg: 280 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'cabestro' }, cuidado: cuidadoH() }),
};
// Ceratópsidos: herbívoros defensivos con cuernos y gola; embisten y forman círculo defensivo (hipótesis inspirada en bóvidos actuales).
ROLES.ceratopsido = {
  ...ROLES.herbivoro_defensivo, blindaje: 0.9,
  hab: ['embestida', 'formacion_defensiva', 'postura_intimidacion'],
  habParams: (m) => ({ embestida: { dano: Math.round(danoDe(m.masa) * 0.78) }, postura_intimidacion: { dur: 2.2, radio: clamp(14 + 1.1 * m.L, 16, 26) } }),
  social: () => 'pequeños grupos (yacimientos masivos de algunos géneros sugieren manadas; el gregarismo adulto es discutido)',
  inter: () => 'Se planta, baja la cabeza y embiste con los cuernos; en grupo puede formar un círculo defensivo (hipótesis).',
  doma: (m) => ({ max: m.masa > 1200 ? 6 : 5, nota: m.masa > 1200 ? 'Herbívoro defensivo: cuesta habituarlo, pero una vez domesticado es un animal de carga muy fuerte.' : 'Herbívoro defensivo de talla media: se habitúa con paciencia y puede llevar bultos.', riesgo: 'Si lo asustas dentro de su distancia de defensa, embiste. Domesticado, sigue defendiéndose de los depredadores.', comida: { hoja_grande: 0.25, liana: 0.15, baya: 0.12 }, hab: { seg: 300 }, ofrendas: 6, manejo: { nivel: 1, equipo: 'cabestro' }, cuidado: { dias: 3, biomas: ['pradera', 'selva'] } }),
  montura: (m) => (m.g.ancla && m.masa >= 1000 && m.masa <= 8000 ? { jinete: true, tipos: m.masa >= 2000 ? ['transporte', 'reforzada'] : ['transporte'], carga: { items: ['alforjas', 'bolsa_carga'], mul: m.masa >= 2000 ? 1.3 : 1 }, proteccion: m.masa >= 2000, arnes: true, ancla: m.g.ancla, nota: 'Lomo ancho tras la gola: silla de transporte (o reforzada) y alforjas.' } : false),
};
// Estegosaurios: lentos, de cola armada; se colocan de lado y golpean con ella.
ROLES.estegosaurio = {
  tipo: 'herbivoro', temperamento: 'defensivo', ciclo: 'ramonea a baja altura durante el día', blindaje: 0.95,
  sent: { vista: 28, fov: 3.6, oido: 45, olfato: 40 },
  ai: (m) => ({ defiende: true, ataque: clamp(0.45 * m.L, 1.5, 4), dano: 0, cd: 3, huye: 0 }),
  energia: () => ({ esprint: 6, recup: 0.05 }),
  peligro: (m) => +clamp(0.12 * Math.log10(Math.max(30, m.masa)) + 0.2, 0.3, 0.75).toFixed(2),
  social: () => 'pequeños grupos o solitario (poca evidencia)',
  hab: ['cola_defensiva', 'movilidad_reducida'],
  habParams: (m) => ({ cola_defensiva: { radio: +clamp(0.62 * m.L, 2.2, 6).toFixed(1), dano: Math.round(danoDe(m.masa) * 0.97) } }),
  vul: 'cabeza pequeña y baja, cuello expuesto; lento',
  inter: () => 'Se coloca de lado y golpea con la cola armada.',
  cos: (m) => ({ osteodermo: clamp(Math.round(m.masa / 700), 1, 6) }),
  doma: () => ({ max: 5, nota: 'Herbívoro lento: puede domesticarse, pero sus placas y púas impiden cualquier silla o carga.', riesgo: 'Su cola es un arma: si lo irritas, golpea con fuerza aunque esté domesticado de palabra.', comida: { hoja_grande: 0.25, liana: 0.2, baya: 0.12 }, hab: { seg: 300 }, ofrendas: 6, manejo: { nivel: 1, equipo: 'cabestro' }, cuidado: { dias: 2.5, biomas: ['pradera', 'selva'] } }),
  montura: () => false,
};
// Anquilosaurios y tireóforos: blindados, de cola con maza o púas. Los pequeños (< 600 kg) prefieren huir tras la coraza.
ROLES.anquilosaurio = {
  tipo: 'herbivoro', temperamento: 'defensivo', ciclo: 'ramonea vegetación baja', blindaje: 1.1,
  sent: { vista: 26, fov: 3.4, oido: 50, olfato: 70 },
  ai: (m) => (m.masa < 600 ? { huye: 1, huyeDist: clamp(10 + 3 * m.L, 10, 18) } : { defiende: true, ataque: clamp(0.5 * m.L, 1.5, 4), dano: 0, cd: 4, huye: 0 }),
  energia: () => ({ esprint: 4, recup: 0.04 }),
  peligro: (m) => +clamp(0.12 * Math.log10(Math.max(30, m.masa)) + 0.3, 0.35, 0.8).toFixed(2),
  social: () => 'solitario o parejas',
  hab: ['armadura_natural', 'cola_defensiva', 'movilidad_reducida'],
  habParams: (m) => ({ cola_defensiva: { radio: +clamp(0.7 * m.L, 1.8, 5.2).toFixed(1), dano: Math.round(danoDe(m.masa) * 1.3), aturde: 1.2 } }),
  vul: 'vientre blando (si se le vuelca); lento',
  inter: () => 'Reduce el daño de los ataques frontales y dorsales; el vientre y la cola quedan expuestos. Su arma de cola rompe huesos.',
  cos: (m) => ({ osteodermo: clamp(Math.round(m.masa / 800), 2, 8) }),
  doma: (m) => (m.masa < 400
    ? { max: 5, nota: 'Pequeño y acorazado: se habitúa con paciencia y acepta un collar.', riesgo: 'Se enrolla tras su coraza y huye si lo asustas.', comida: { hoja_grande: 0.2, baya: 0.15, liana: 0.1 }, hab: { seg: 200 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'collar_id' } }
    : { max: 4, nota: 'Se puede habituar y guiar con cabestro, pero no se domestica del todo: su instinto defensivo es demasiado fuerte.', riesgo: 'Cualquier susto brusco puede provocar un golpe de cola.', comida: { hoja_grande: 0.2, baya: 0.15, liana: 0.1 }, hab: { seg: 420 }, ofrendas: 8, manejo: { nivel: 2, equipo: 'cabestro' } }),
  montura: () => false,
};

// ---------------------------------------------------------------------------------------------------------------- voladores (pterosaurios)
// Sin IA terrestre: sobrevuelan en círculos (Creature.thinkFlight) con los parámetros de vuelo de la especie (`g.vuelo`). No se habitúan ni se montan (los medios del juego no lo permiten).
// Las diferencias de dieta y tamaño van en cuatro variantes; el resto (sentidos, energía, cosecha) sigue las escalas por tamaño.
const VOLADOR = {
  tipo: 'volador', temperamento: 'tímido', ciclo: 'planea de día', blindaje: 0.65,
  sent: { vista: 110, fov: 4.0, oido: 40, olfato: 0 },
  ai: (m) => ({ vuelo: m.g.vuelo ?? true }),
  energia: () => ({ esprint: 30, recup: 0.1 }),
  peligro: (m) => +clamp(0.03 + 0.012 * Math.log10(Math.max(1, m.masa)), 0.03, 0.08).toFixed(2),
  social: () => 'solitario o bandadas costeras (hipótesis)',
  hab: [], habParams: () => ({}),
  vul: 'frágil; solo se alcanza con proyectiles cuando vuela bajo',
  inter: () => 'Sobrevuela el terreno en círculos; no aterriza ni caza todavía (pendiente).',
  cos: (m) => ({ sinGrasa: m.masa < 100 }),
  doma: () => ({ max: 0, nota: 'Animal volador: no se puede habituar ni manejar con los medios del juego.', comida: {}, hab: { seg: 1 }, ofrendas: 1 }),
  montura: () => false,
};
ROLES.volador_grande = { ...VOLADOR, ciclo: 'planea de día aprovechando las térmicas', social: () => 'solitario o parejas (hipótesis)', vul: 'frágil para su tamaño, pero muy alto: solo se alcanza con proyectiles de largo alcance', inter: () => 'Planea a gran altura y sobrevuela las llanuras; sin aterrizaje ni forrajeo en tierra todavía (pendiente).' };
ROLES.volador_pequeno = { ...VOLADOR, ciclo: 'activo de día', social: () => 'bandadas pequeñas (hipótesis)', sent: { vista: 90, fov: 4.2, oido: 45, olfato: 0 } };
ROLES.volador_pescador = { ...VOLADOR, ciclo: 'planea de día sobre aguas costeras', social: () => 'bandadas costeras (hipótesis)', inter: () => 'Sobrevuela costas y lagunas; pescar en vuelo queda pendiente.' };
ROLES.volador_frugivoro = { ...VOLADOR, ciclo: 'activo de día sobre el bosque', social: () => 'solitario o parejas (hipótesis)', inter: () => 'Sobrevuela el bosque; su dieta (frutos y semillas, tal vez carroña) es una hipótesis y no tiene efecto en el juego aún.' };

// ---------------------------------------------------------------------------------------------------------------- cocodrilomorfos, mamíferos y anfibios
// Cocodrilos gigantes: emboscadores de orilla. Fuera del agua son torpes (de momento solo andan: nadar y arrastrar a la presa al agua queda para el sistema acuático).
ROLES.cocodrilo_gigante = {
  ...ROLES.gran_pred, temperamento: 'emboscador', ciclo: 'acecha inmóvil junto al agua; caza al amanecer y al anochecer', blindaje: 1.15,
  sent: { vista: 30, fov: 2.2, oido: 45, olfato: 60 },
  ai: (m) => ({ ataque: clamp(0.26 * m.L, 1.6, 3.2), dano: danoDe(m.masa), cd: +(cdDe(m.masa) * 1.15).toFixed(2), huye: 0.1 }),
  energia: () => ({ esprint: 7, recup: 0.04 }),
  social: () => 'solitario; territorial en su tramo de río o costa (hipótesis)',
  hab: ['rastreo_olor', 'acecho', 'emboscada', 'carroneo', 'armadura_natural', 'abandonar_caza'],
  habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 0.9, 5, 9) }, armadura_natural: { frontal: 0.3, trasera: 0.2 } }),
  vul: 'vientre blando, ojos y morro; lento y sin emboscada lejos del agua',
  inter: () => 'Espera inmóvil y se lanza sobre lo que se acerca; los osteodermos del lomo amortiguan los golpes.',
  cos: (m) => ({ diente: 3 + m.masa / 1500, osteodermo: clamp(Math.round(m.masa / 700), 2, 9) }),
};
// Cocodrilo terrestre de colmillos (Kaprosuchus): patas erguidas y más rápido en tierra; caza como un suido carnívoro (hipótesis).
ROLES.cocodrilo_terrestre = {
  ...ROLES.pred_solitario, temperamento: 'agresivo', ciclo: 'activo de día y de noche', blindaje: 1.05,
  sent: { vista: 32, fov: 2.2, oido: 45, olfato: 60 },
  ai: (m) => ({ ataque: clamp(0.36 * m.L, 1.3, 2.6), dano: danoDe(m.masa), cd: cdDe(m.masa), huye: 0.2 }),
  energia: () => ({ esprint: 9, recup: 0.05 }),
  hab: ['rastreo_olor', 'acecho', 'emboscada', 'carroneo', 'armadura_natural', 'abandonar_caza'],
  habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 1.4, 5, 9) }, armadura_natural: { frontal: 0.25, trasera: 0.15 } }),
  vul: 'vientre y flancos; sin la ventaja del agua pierde fuelle en una persecución larga',
  inter: () => 'Cazador terrestre de colmillos largos: embiste y muerde para sujetar a la presa.',
  cos: (m) => ({ diente: 3, osteodermo: clamp(Math.round(m.masa / 150), 1, 4) }),
};
// Mamífero carnívoro pequeño (Repenomamus): valiente para su tamaño, caza crías y presas pequeñas y carroñea.
ROLES.mamifero_carnivoro = {
  ...ROLES.pred_solitario, temperamento: 'cauteloso', ciclo: 'activo de noche y al amanecer; descansa en madrigueras', blindaje: 0.9,
  sent: { vista: 24, fov: 3.2, oido: 55, olfato: 85 },
  ai: (m) => ({ ataque: clamp(0.5 * m.L, 0.7, 1.4), dano: danoDe(m.masa), cd: cdDe(m.masa), huye: 0.4 }),
  energia: () => ({ esprint: 8, recup: 0.07 }),
  hab: ['rastreo_olor', 'acecho', 'carroneo', 'abandonar_caza', 'esprint_zigzag'],
  habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 2, 2, 4) } }),
  vul: 'pequeño: cualquier depredador grande lo supera; huye herido',
  inter: () => 'Rastrea por olfato y muerde con fuerza; si el rival es mucho mayor, se esconde.',
  cos: () => ({ diente: 1, sinGrasa: true }),
  doma: () => ({ max: 4, nota: 'Pequeño y esquivo: se habitúa con comida y paciencia; no es un animal de trabajo.', riesgo: 'Si lo acorralas muerde.', comida: { carne_cruda: 0.3, carne_cocida: 0.4 }, hab: { seg: 200, dMin: 6 }, ofrendas: 5, manejo: { nivel: 0, equipo: 'collar_id' } }),
};
// Mamífero omnívoro pequeño (Didelphodon): tímido, huye de casi todo.
ROLES.mamifero_omnivoro = { ...ROLES.omnivoro_basal, ciclo: 'activo al crepúsculo y de noche', hab: ['llamada_alerta', 'esprint_zigzag', 'carroneo'], inter: () => 'Omnívoro oportunista: come invertebrados, huevos y carroña; sus molares trituran presas duras (caparazones, huesos).' };
// Anfibio emboscador (Beelzebufo): se queda quieto y salta sobre lo que cabe en su boca.
ROLES.anfibio_emboscador = {
  tipo: 'depredador', temperamento: 'emboscador', ciclo: 'inmóvil entre la hojarasca; caza de noche y tras la lluvia', cazaUmbral: 0.4, blindaje: 0.8,
  sent: { vista: 22, fov: 4.0, oido: 30, olfato: 10 },
  ai: (m) => ({ ataque: clamp(0.9 * m.L, 0.5, 0.9), dano: danoDe(m.masa), cd: cdDe(m.masa), huye: 0.5 }),
  energia: () => ({ esprint: 5, recup: 0.05 }),
  peligro: () => 0.08,
  social: () => 'solitario',
  hab: ['acecho', 'emboscada', 'abandonar_caza'],
  habParams: () => ({ acecho: { dEmboscada: 1.6 } }),
  vul: 'pequeño y lento caminando; el ojo y la boca son puntos débiles',
  inter: () => 'Espera inmóvil y se abalanza sobre presas pequeñas (lagartos, mamíferos y crías de dinosaurio).',
  cos: () => ({ sinGrasa: true }),
  doma: () => ({ max: 3, nota: 'Se puede habituar a tu presencia si está saciado; no se maneja.', riesgo: 'Si pasas muy cerca, muerde.', comida: { carne_cruda: 0.3 }, hab: { seg: 150, dMin: 3 }, ofrendas: 4 }),
  montura: () => false,
};

// ---------------------------------------------------------------------------------------------------------------- animales marinos (reptiles marinos y peces)
// Viven en el agua (ver fauna/nado.js): nadan a la profundidad que pida su estado, suben a respirar (los reptiles) y no salen a tierra, así que solo alcanzan al jugador
// mientras esté en el agua o en su orilla. No se pueden habituar ni montar con los medios del juego.
const SIN_DOMA = () => ({ max: 0, nota: 'Animal marino: no se puede habituar ni manejar con los medios del juego.', comida: {}, hab: { seg: 1 }, ofrendas: 1 });
// Grandes depredadores marinos (mosasáuridos, pliosaurios): persiguen a cualquier presa o nadador a su alcance; el cuello y el hocico son sus puntos débiles.
ROLES.marino_gran_pred = {
  tipo: 'depredador', temperamento: 'territorial', ciclo: 'caza a cualquier hora; sube a la superficie a respirar', cazaUmbral: 0.45, blindaje: 0.9,
  sent: { vista: 42, fov: 2.0, oido: 75, olfato: 95 },
  ai: (m) => ({ ataque: clamp(0.42 * m.L, 2.2, 6.5), dano: danoDe(m.masa), cd: cdDe(m.masa), huye: 0.15 }),
  energia: (m) => ({ esprint: clamp(8 + 0.4 * m.L, 9, 13), recup: 0.04 }),
  peligro: (m) => peligroDepredador(m.masa),
  social: () => 'solitario (la conducta de grupo es hipótesis)',
  hab: ['rastreo_olor', 'acecho', 'emboscada', 'carroneo', 'abandonar_caza'],
  habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 0.9, 6, 12) } }),
  vul: 'ojos, hocico y flancos; es un reptil que respira aire: debe subir a la superficie cada cierto tiempo',
  inter: () => 'Depredador de los mares: persigue en el agua a presas y a quien nade; no sale a tierra. Mientras estés en la orilla o fuera del agua no puede alcanzarte.',
  cos: (m) => ({ diente: 3 + m.masa / 1500 }),
  doma: SIN_DOMA, montura: () => false,
};
// Reptiles marinos medianos y pequeños (plesiosaurios, ictiosaurios): cazan peces y cefalópodos (no representados en el juego), así que solo huyen de lo que se acerca; son presa de los grandes.
ROLES.marino_medio = {
  tipo: 'presa', temperamento: 'cauteloso', ciclo: 'caza peces y calamares a cualquier hora; sube a respirar', cazaUmbral: 0.3, blindaje: 0.9,
  sent: { vista: 36, fov: 2.6, oido: 75, olfato: 55 },
  ai: (m) => ({ huye: 1, huyeDist: clamp(18 + 3 * m.L, 20, 40) }),
  energia: () => ({ esprint: 12, recup: 0.05 }),
  peligro: (m) => +clamp(0.02 + 0.07 * Math.log10(Math.max(10, m.masa)), 0.05, 0.4).toFixed(2),
  social: () => 'solitario o en grupos pequeños (hipótesis)',
  hab: ['esprint_zigzag'], habParams: () => ({}),
  vul: 'sin armas apreciables; huye al verse acechado, pero debe subir a respirar',
  inter: () => 'Se alimenta de peces y calamares (todavía no hay presas pequeñas en el juego): se aparta de lo que se acerca y es presa de los grandes depredadores marinos.',
  cos: (m) => ({ diente: 1 + m.masa / 2500 }),
  doma: SIN_DOMA, montura: () => false,
};
// Peces depredadores (Xiphactinus): emboscan a lo que nada cerca; también son presa de los reptiles marinos mayores.
ROLES.pez_emboscador = {
  tipo: 'presa', temperamento: 'agresivo', ciclo: 'caza a cualquier hora cerca de la superficie', cazaUmbral: 0.35, blindaje: 0.8,
  sent: { vista: 38, fov: 3.0, oido: 70, olfato: 80 },
  ai: (m) => ({ ataque: clamp(0.4 * m.L, 1.2, 3), dano: danoDe(m.masa), cd: cdDe(m.masa), agresivo: true, huye: 0.25 }),
  energia: () => ({ esprint: 8, recup: 0.05 }),
  peligro: (m) => +clamp(0.1 + 0.08 * Math.log10(Math.max(10, m.masa)), 0.15, 0.5).toFixed(2),
  social: () => 'solitario (hipótesis)',
  hab: ['acecho', 'emboscada', 'abandonar_caza'], habParams: (m) => ({ acecho: { dEmboscada: clamp(m.L * 1.2, 3, 6) } }),
  vul: 'el cuerpo comprimido y las aletas; no resiste el daño de un depredador grande',
  inter: () => 'Pez de dientes enormes: arremete contra lo que nada cerca. Un mosasaurio o un pliosaurio puede cazarlo.',
  cos: () => ({ diente: 2 }),
  doma: SIN_DOMA, montura: () => false,
};
// Peces filtradores gigantes (Leedsichthys): nadan despacio con la boca abierta; no atacan, se apartan.
ROLES.filtrador_gigante = {
  tipo: 'herbivoro', temperamento: 'pasivo', ciclo: 'filtra plancton cerca de la superficie casi todo el día', cazaUmbral: 1, blindaje: 1.0,
  sent: { vista: 40, fov: 3.2, oido: 70, olfato: 15 },
  ai: () => ({ huye: 1, huyeDist: 26 }),
  energia: () => ({ esprint: 6, recup: 0.04 }),
  peligro: () => 0.3,
  social: () => 'solitario o en pequeños grupos (hipótesis)',
  hab: [], habParams: () => ({}),
  vul: 'enorme pero sin defensas: depende de su tamaño y de apartarse',
  inter: () => 'Nada despacio con la boca abierta filtrando plancton. No ataca: se aparta de lo que se acerca.',
  cos: () => ({}),
  doma: SIN_DOMA, montura: () => false,
};
