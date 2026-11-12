// Cache borné : les entrées les moins récemment utilisées sont évincées.

/** Cache LRU : `get` remet l'entrée en tête, `set` évince la plus ancienne au-delà de `max`. */
export class Lru<K, V> {
  readonly #map = new Map<K, V>();
  readonly #max: number;

  constructor(max: number) {
    this.#max = max;
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    const v = this.#map.get(key);
    if (v !== undefined) {
      this.#map.delete(key);
      this.#map.set(key, v);
    }
    return v;
  }

  set(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    for (const k of this.#map.keys()) {
      if (this.#map.size <= this.#max) break;
      this.#map.delete(k);
    }
  }

  keys(): K[] {
    return [...this.#map.keys()];
  }
}
