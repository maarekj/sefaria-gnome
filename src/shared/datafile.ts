// Fichiers de données JSON de l'utilisateur (réglages, lecture) : lecture tolérante, copie de
// sauvegarde (`.bak`) d'un fichier en partie invalide avant qu'il ne soit réécrit, écriture atomique.
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
