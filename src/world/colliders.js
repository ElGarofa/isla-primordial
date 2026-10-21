// Colisionadores estáticos (cilindros verticales) con rejilla espacial. Lo usan flora (árboles/rocas) y player.
// API estable: addCircle / remove / query. Todo en el plano XZ; `height` es la altura del cilindro desde el suelo.

const OFFSET = 8192;
const STRIDE = 16384;

export class StaticColliders {
  constructor(cellSize = 8) {
    this.cell = cellSize;
    this._grid = new Map();
    this._items = new Map();
    this._nextId = 1;
    this._stamp = 0;
  }

  _key(cx, cz) {
    return (cx + OFFSET) * STRIDE + (cz + OFFSET);
  }

  /** Añade un cilindro. Devuelve un id numérico. opts: { height, kind, owner } */
  addCircle(x, z, radius, opts = {}) {
    const id = this._nextId++;
    const c = {
      id, x, z, radius,
      height: opts.height ?? 8,
      kind: opts.kind ?? 'solido', // 'arbol' | 'roca' | 'solido' | 'estructura'...
      owner: opts.owner ?? null, // referencia libre (p. ej. id de flora)
      _q: 0,
    };
    this._items.set(id, c);
    const s = this.cell;
    const x0 = Math.floor((x - radius) / s), x1 = Math.floor((x + radius) / s);
    const z0 = Math.floor((z - radius) / s), z1 = Math.floor((z + radius) / s);
    c._cells = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let arr = this._grid.get(k);
        if (!arr) this._grid.set(k, (arr = []));
        arr.push(c);
        c._cells.push(k);
      }
    }
    return id;
  }

  remove(id) {
    const c = this._items.get(id);
    if (!c) return false;
    for (const k of c._cells) {
      const arr = this._grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      if (arr.length === 0) this._grid.delete(k);
    }
    this._items.delete(id);
    return true;
  }

  get(id) {
    return this._items.get(id) ?? null;
  }

  /** Rellena `out` con los colisionadores cuyo círculo intersecta el círculo (x, z, r). Devuelve `out`. */
  query(x, z, r, out = []) {
    out.length = 0;
    const s = this.cell;
    const stamp = ++this._stamp;
    const x0 = Math.floor((x - r) / s), x1 = Math.floor((x + r) / s);
    const z0 = Math.floor((z - r) / s), z1 = Math.floor((z + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this._grid.get(this._key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (c._q === stamp) continue;
          c._q = stamp;
          const dx = c.x - x, dz = c.z - z, rr = c.radius + r;
          if (dx * dx + dz * dz <= rr * rr) out.push(c);
        }
      }
    }
    return out;
  }
}
