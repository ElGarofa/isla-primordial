// Bus de eventos mínimo. Los módulos se comunican por aquí o a través de ctx.<modulo>.
export class Events {
  constructor() {
    this._map = new Map();
  }
  /** Suscribe y devuelve una función para desuscribirse. */
  on(type, fn) {
    let set = this._map.get(type);
    if (!set) this._map.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  off(type, fn) {
    this._map.get(type)?.delete(fn);
  }
  emit(type, data) {
    const set = this._map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (e) { console.error(`[evento:${type}]`, e); }
    }
  }
}
