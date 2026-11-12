// Données de lecture de l'utilisateur : onglets ouverts (reprise au lancement), historique et
// signets. Fichier $XDG_DATA_HOME/sefaria-gnome/reading.json, validé par zod
// (entrée par entrée : une entrée invalide est ignorée, le fichier d'origine copié en .bak).
import GLib from 'gi://GLib';
import { type Accessor, createState, type Setter } from 'gnim';
import * as z from 'zod/mini';
import { DataWriter, readDataFile } from './datafile.ts';

/** Passage mémorisé (référence et son nom hébreu). */
export interface Place {
  readonly ref: string;
  readonly heRef: string;
}

export interface ReadingData {
  /** références des onglets ouverts et index de l'onglet affiché */
  readonly tabs: readonly string[];
  readonly current: number;
  /** passages ouverts, du plus récent au plus ancien, sans doublon */
  readonly history: readonly Place[];
  readonly bookmarks: readonly Place[];
}

/** Taille maximale de l'historique. */
export const HISTORY_MAX = 100;

const PlaceSchema = z.object({ ref: z.string().check(z.minLength(1)), heRef: z.string() });

const EMPTY: ReadingData = { tabs: [], current: 0, history: [], bookmarks: [] };

export const readingFile = (): string => GLib.build_filenamev([GLib.get_user_data_dir(), 'sefaria-gnome', 'reading.json']);

/** Données lues (entrées invalides ignorées une à une ; fichier absent : vides). */
export function readReading(file = readingFile()): ReadingData {
  return readDataFile(
    file,
    (l) => {
      const tabs = (l.items('tabs', z.string()) ?? []).filter((t) => t !== '');
      return {
        tabs,
        current: Math.min(Math.max(0, Math.trunc(l.field('current', z.number()) ?? 0)), Math.max(0, tabs.length - 1)),
        history: (l.items('history', PlaceSchema) ?? []).slice(0, HISTORY_MAX),
        bookmarks: l.items('bookmarks', PlaceSchema) ?? [],
      };
    },
    EMPTY,
  );
}

/** Historique avec `place` en tête (dédoublonné, borné). */
export function pushHistory(history: readonly Place[], place: Place): Place[] {
  return [place, ...history.filter((h) => h.ref !== place.ref)].slice(0, HISTORY_MAX);
}

/** Signet ajouté (à la fin) ou retiré. */
export function toggleBookmark(bookmarks: readonly Place[], place: Place): Place[] {
  return bookmarks.some((b) => b.ref === place.ref) ? bookmarks.filter((b) => b.ref !== place.ref) : [...bookmarks, place];
}

/** Données réactives, enregistrées à chaque modification. */
export class ReadingStore {
  readonly value: Accessor<ReadingData>;
  readonly #set: Setter<ReadingData>;
  readonly #writer: DataWriter;

  constructor(file = readingFile()) {
    this.#writer = new DataWriter(file, 'données de lecture');
    [this.value, this.#set] = createState(readReading(file));
  }

  #update(patch: Partial<ReadingData>): void {
    const next = { ...this.value.peek(), ...patch };
    this.#set(next);
    // regroupée (chaque navigation modifie historique et onglets), asynchrone
    this.#writer.schedule(next);
  }

  /** Écrit tout de suite les modifications en attente. */
  flush(): void {
    this.#writer.flush();
  }

  visited(place: Place): void {
    if (this.value.peek().history[0]?.ref === place.ref) return;
    this.#update({ history: pushHistory(this.value.peek().history, place) });
  }

  toggleBookmark(place: Place): void {
    this.#update({ bookmarks: toggleBookmark(this.value.peek().bookmarks, place) });
  }

  isBookmarked(ref: string): boolean {
    return this.value.peek().bookmarks.some((b) => b.ref === ref);
  }

  /** Onglets ouverts (reprise au lancement). */
  saveTabs(tabs: readonly string[], current: number): void {
    const v = this.value.peek();
    if (v.current === current && v.tabs.length === tabs.length && v.tabs.every((t, i) => t === tabs[i])) return;
    this.#update({ tabs, current });
  }

  clearHistory(): void {
    this.#update({ history: [] });
  }
}
