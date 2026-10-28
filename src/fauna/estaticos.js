// Especies con modelo 3D estático (generado) acoplado al esqueleto procedural. Ver estatico.js y docs/MODELOS_3D.md (§ modelos generados).
// glb/rig: rutas bajo public/. La procedencia y licencia de cada archivo está en public/models/fauna/LICENCIAS.md.
export const ESTATICOS = {
  carnotaurus: { glb: 'models/fauna/generados/carnotaurus.glb', rig: 'models/fauna/generados/carnotaurus.rig.json' },
};
// Pieles texturizadas generadas (Higgsfield/Tripo) con el esqueleto de la especie ajustado por tools/autorig.mjs (rig versión 2).
import { ESTATICOS_HF } from './estaticos-hf.js';
const usarHF = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hf') === '0');
if (usarHF) for (const id of ESTATICOS_HF) if (!ESTATICOS[id]) ESTATICOS[id] = { glb: `models/fauna/hf/${id}.glb`, rig: `models/fauna/hf/${id}.rig.json`, v: 2, prioridad: true };
