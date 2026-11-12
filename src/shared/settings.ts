// Réglages de l'utilisateur : $XDG_CONFIG_HOME/sefaria-gnome/settings.json, validé par zod.
import GLib from 'gi://GLib';
import { type Accessor, createState, type Setter } from 'gnim';
import * as z from 'zod/mini';
import { DataWriter, readDataFile, writeDataFile } from './datafile.ts';

/** Outil de traduction par IA. */
export type AiTool = 'none' | 'claude' | 'opencode';

/** Textes affichés : hébreu et traduction, hébreu seul, traduction seule. */
export type Display = 'both' | 'hebrew' | 'translation';

/** Versions choisies pour un livre (titres Sefaria) ; absentes : versions par défaut. */
export interface BookVersions {
  readonly hebrew?: string;
  /** traduction choisie, valable pour sa langue seulement */
  readonly translation?: { readonly language: string; readonly title: string };
}

const BookSchema = z.object({ hebrew: z.optional(z.string()), translation: z.optional(z.object({ language: z.string(), title: z.string() })) });

export interface Settings {
  readonly twoColumns: boolean;
  readonly textScale: number;
  readonly display: Display;
  readonly language: string;
  readonly diaspora: boolean;
  readonly sidebar: boolean;
  readonly aiTool: AiTool;
  readonly aiModel: string;
  readonly aiLanguage: string;
  readonly books: Readonly<Record<string, BookVersions>>;
}

const DEFAULTS: Settings = { twoColumns: false, textScale: 1, display: 'both', language: 'english', diaspora: true, sidebar: true, aiTool: 'none', aiModel: '', aiLanguage: 'french', books: {} };

export const settingsFile = (): string => GLib.build_filenamev([GLib.get_user_config_dir(), 'sefaria-gnome', 'settings.json']);

/** Réglages lus : chaque réglage invalide prend sa valeur par défaut (fichier absent : défauts). */
export function readSettings(file = settingsFile()): Settings {
  return readDataFile(
    file,
    (l) => {
      const books: Record<string, BookVersions> = {};
      for (const [k, v] of Object.entries(l.entries('books', BookSchema) ?? {})) books[k] = { ...(v.hebrew === undefined ? {} : { hebrew: v.hebrew }), ...(v.translation === undefined ? {} : { translation: v.translation }) };
      return {
        /** hébreu et traduction côte à côte */
        twoColumns: l.field('twoColumns', z.boolean()) ?? DEFAULTS.twoColumns,
        /** échelle du texte lu (1 : taille par défaut), bornée à l'usage */
        textScale: l.field('textScale', z.number().check(z.positive())) ?? DEFAULTS.textScale,
        display: l.field('display', z.enum(['both', 'hebrew', 'translation'])) ?? DEFAULTS.display,
        /** famille de langue de la traduction (« english », « french »…) */
        language: l.field('language', z.string()) ?? DEFAULTS.language,
        /** calendrier de diaspora (sinon d'Israël) pour les lectures du jour */
        diaspora: l.field('diaspora', z.boolean()) ?? DEFAULTS.diaspora,
        /** barre latérale (bibliothèque) affichée */
        sidebar: l.field('sidebar', z.boolean()) ?? DEFAULTS.sidebar,
        /** traduction par IA : outil, modèle (vide : défaut), langue cible */
        aiTool: l.field('aiTool', z.enum(['none', 'claude', 'opencode'])) ?? DEFAULTS.aiTool,
        aiModel: l.field('aiModel', z.string()) ?? DEFAULTS.aiModel,
        aiLanguage: l.field('aiLanguage', z.string()) ?? DEFAULTS.aiLanguage,
        books,
      };
    },
    DEFAULTS,
  );
}

export function writeSettings(s: Settings, file = settingsFile()): void {
  writeDataFile(file, s);
}

/** Réglages réactifs, enregistrés à chaque modification. */
export class SettingsStore {
  readonly value: Accessor<Settings>;
  readonly #set: Setter<Settings>;
  readonly #writer: DataWriter;

  constructor(file = settingsFile()) {
    this.#writer = new DataWriter(file, 'réglages');
    [this.value, this.#set] = createState(readSettings(file));
  }

  update(patch: Partial<Settings>): void {
    const next = { ...this.value.peek(), ...patch };
    this.#set(next);
    // regroupée (ex. Ctrl+plus répété), asynchrone
    this.#writer.schedule(next);
  }

  /** Écrit tout de suite les modifications en attente. */
  flush(): void {
    this.#writer.flush();
  }

  /** Modifie les versions choisies pour `book`. */
  updateBook(book: string, patch: Partial<BookVersions>): void {
    const books = this.value.peek().books;
    this.update({ books: { ...books, [book]: { ...books[book], ...patch } } });
  }
}
