// Fichiers de données JSON de l'utilisateur (réglages, lecture) : lecture tolérante, copie de
// sauvegarde (`.bak`) d'un fichier en partie invalide avant qu'il ne soit réécrit, écriture atomique.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Lenient } from './lenient.ts';

const decoder = new TextDecoder();

/** Copie `file.bak` du contenu d'origine (garde ce qui va être perdu à la prochaine écriture). */
function backup(file: string, bytes: Uint8Array): void {
  try {
    GLib.file_set_contents(`${file}.bak`, bytes);
    console.warn(`${file} : valeurs invalides ignorées, copie d'origine dans ${file}.bak`);
  } catch (error) {
    console.error(`copie de ${file} impossible : ${String(error)}`);
  }
}

/** Contenu de `file` (`parse` lit ses champs valides) ; absent : `fallback`. */
export function readDataFile<T>(file: string, parse: (l: Lenient) => T, fallback: T): T {
  let bytes: Uint8Array;
  try {
    [, bytes] = GLib.file_get_contents(file);
  } catch {
    return fallback;
  }
  let json: unknown;
  try {
    json = JSON.parse(decoder.decode(bytes));
  } catch {
    backup(file, bytes);
    return fallback;
  }
  const l = new Lenient(json);
  const value = parse(l);
  if (l.lossy) backup(file, bytes);
  return value;
}

/** Écriture atomique (fichier temporaire puis renommage). */
export function writeDataFile(file: string, value: unknown): void {
  GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
  GLib.file_set_contents(file, JSON.stringify(value, null, 2));
}

Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

/** Délai de regroupement des écritures (plusieurs modifications rapprochées : une seule écriture). */
export const WRITE_DELAY_MS = 500;

/** Écrivains en attente (écriture finale à la fermeture de l'application). */
const writers = new Set<DataWriter>();

/**
 * Écriture différée et regroupée d'un fichier de données : la dernière valeur est écrite après
 * `WRITE_DELAY_MS`, de façon asynchrone et atomique ; `flush` écrit tout de suite (fermeture).
 */
export class DataWriter {
  readonly #file: string;
  readonly #what: string;
  #value: unknown = undefined;
  #dirty = false;
  #timer = 0;
  /** écriture asynchrone en cours (la suivante attend sa fin : pas de croisement) */
  #writing: Promise<void> | null = null;

  constructor(file: string, what: string) {
    this.#file = file;
    this.#what = what;
  }

  /** Valeur à enregistrer (remplace une valeur en attente). */
  schedule(value: unknown): void {
    this.#value = value;
    this.#dirty = true;
    writers.add(this);
    if (this.#timer !== 0) return;
    this.#timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WRITE_DELAY_MS, () => {
      this.#timer = 0;
      void this.#writeAsync();
      return GLib.SOURCE_REMOVE;
    });
  }

  async #writeAsync(): Promise<void> {
    // une seule écriture à la fois (plusieurs appels peuvent attendre la même)
    // oxlint-disable-next-line eslint/no-await-in-loop -- attente séquentielle voulue (une écriture à la fois)
    while (this.#writing !== null) await this.#writing;
    if (!this.#dirty) return;
    this.#dirty = false;
    const data = new TextEncoder().encode(JSON.stringify(this.#value, null, 2));
    this.#writing = (async () => {
      try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(this.#file), 0o755);
        await Gio.File.new_for_path(this.#file).replace_contents_bytes_async(new GLib.Bytes(data), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
      } catch (error) {
        console.error(`${this.#what} non enregistrés : ${String(error)}`);
      } finally {
        this.#writing = null;
        // retiré seulement une fois écrit (une fermeture pendant l'écriture la refait en synchrone)
        if (!this.#dirty && this.#timer === 0) writers.delete(this);
      }
    })();
    await this.#writing;
  }

  /**
   * Écrit tout de suite la dernière valeur (synchrone) : en attente, ou dont l'écriture asynchrone
   * n'est pas finie (le processus va s'arrêter avant).
   */
  flush(): void {
    if (this.#timer !== 0) GLib.source_remove(this.#timer);
    this.#timer = 0;
    writers.delete(this);
    if (!this.#dirty && this.#writing === null) return;
    this.#dirty = false;
    try {
      writeDataFile(this.#file, this.#value);
    } catch (error) {
      console.error(`${this.#what} non enregistrés : ${String(error)}`);
    }
  }
}

/** Écriture finale de toutes les valeurs en attente (fermeture de l'application). */
export function flushDataFiles(): void {
  for (const w of writers) w.flush();
}
