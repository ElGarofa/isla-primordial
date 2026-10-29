import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = path.resolve(process.argv[2] ?? '/home/krox/isla/isla-primordial');
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const asModule = (relative) => import(pathToFileURL(path.join(sourceRoot, relative)).href);
const [items, fauna, provinces, world] = await Promise.all([
  asModule('src/core/items.js'),
  asModule('src/fauna/catalogo.js'),
  asModule('src/world/provincias.js'),
  asModule('src/world/generador.js'),
]);
const out = path.join(projectRoot, 'data');
await mkdir(out, { recursive: true });
const json = {
  'items.json': { items: items.ITEMS, recipes: items.RECIPES, forage: items.RECOLECCION, butchery: items.COSECHA, skills: items.HABILIDADES, qualities: items.CALIDADES, inventory_capacity: items.CAPACIDAD_BASE },
  'fauna.json': { catalogue: fauna.CATALOGO, detail: fauna.DETALLE, ecosystems: fauna.ECOSISTEMAS, flora: fauna.FLORA_MESOZOICA },
  'regions.json': { biomes: provinces.BIOMAS, biome_names: provinces.BIOMA_NOMBRE, biome_colors: provinces.BIOMA_COLOR, provinces: provinces.PROVINCIAS, seas: provinces.MARES, features: provinces.RASGOS },
};
for (const [name, value] of Object.entries(json)) await writeFile(path.join(out, name), JSON.stringify(value));

const map = world.generarMundo({ seed: 1337, size: 12288, n: 768 });
const count = map.n * map.n;
const header = 16;
const stride = 16;
const bytes = Buffer.allocUnsafe(header + count * stride);
bytes.write('IPWM', 0, 'ascii');
bytes.writeUInt32LE(1, 4);
bytes.writeUInt32LE(map.n, 8);
bytes.writeUInt32LE(map.size, 12);
let p = header;
for (let i = 0; i < count; i++, p += stride) {
  bytes.writeFloatLE(map.H[i], p);
  bytes[p + 4] = map.B[i];
  bytes[p + 5] = map.P[i];
  bytes[p + 6] = map.Z[i];
  bytes.writeFloatLE(map.DC[i], p + 7);
  bytes.writeFloatLE(map.DB[i], p + 11);
  bytes[p + 15] = map.HUM[i];
}
await writeFile(path.join(out, 'world_map.bin'), bytes);
console.log(`Datos importados: ${Object.keys(items.ITEMS).length} objetos, ${items.RECIPES.length} recetas, ${fauna.CATALOGO.length} especies y mundo ${map.size} m (${map.n}²).`);
