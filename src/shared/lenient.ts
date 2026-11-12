// Lecture tolérante d'un fichier de données : chaque champ (et chaque élément d'une liste) est validé
// séparément, une valeur invalide est ignorée sans perdre le reste ; `lossy` signale une perte.
import * as z from 'zod/mini';

export class Lenient {
  /** au moins une valeur ignorée (le fichier d'origine mérite une copie avant réécriture) */
  lossy = false;
  readonly #obj: Readonly<Record<string, unknown>>;

  constructor(value: unknown) {
    const r = z.safeParse(z.record(z.string(), z.unknown()), value);
    if (r.success) this.#obj = r.data;
    else {
      this.#obj = {};
      this.lossy = true;
    }
  }

  /** Champ `key` s'il est valide (absent : undefined, sans perte). */
  field<T>(key: string, schema: z.ZodMiniType<T>): T | undefined {
    const v = this.#obj[key];
    if (v === undefined) return undefined;
    const r = z.safeParse(schema, v);
    if (r.success) return r.data;
    this.lossy = true;
    return undefined;
  }

  /** Liste `key` : ses éléments valides seulement. */
  items<T>(key: string, schema: z.ZodMiniType<T>): T[] | undefined {
    const v = this.#obj[key];
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) {
      this.lossy = true;
      return undefined;
    }
    const out: T[] = [];
    for (const item of v) {
      const r = z.safeParse(schema, item);
      if (r.success) out.push(r.data);
      else this.lossy = true;
    }
    return out;
  }

  /** Dictionnaire `key` : ses entrées valides seulement. */
  entries<T>(key: string, schema: z.ZodMiniType<T>): Record<string, T> | undefined {
    const v = this.#obj[key];
    if (v === undefined) return undefined;
    const r = z.safeParse(z.record(z.string(), z.unknown()), v);
    if (!r.success) {
      this.lossy = true;
      return undefined;
    }
    const out: Record<string, T> = {};
    for (const [k, item] of Object.entries(r.data)) {
      const p = z.safeParse(schema, item);
      if (p.success) out[k] = p.data;
      else this.lossy = true;
    }
    return out;
  }
}
