// Réglages de l'utilisateur : $XDG_CONFIG_HOME/sefaria-gnome/settings.json, validé par zod.
import GLib from 'gi://GLib';
import { type Accessor, createState, type Setter } from 'gnim';
import * as z from 'zod/mini';

/** Textes affichés : hébreu et traduction, hébreu seul, traduction seule. */
export type Display = 'both' | 'hebrew' | 'translation';

/** Versions choisies pour un livre (titres Sefaria) ; absentes : versions par défaut. */
export interface BookVersions {
  readonly hebrew?: string;
  /** traduction choisie, valable pour sa langue seulement */
  readonly translation?: { readonly language: string; readonly title: string };
}

const RawSettings = z.looseObject({
  /** hébreu et traduction côte à côte */
  twoColumns: z.optional(z.boolean()),
  /** échelle du texte lu (1 : taille par défaut), bornée à l'usage */
  textScale: z.optional(z.number().check(z.positive())),
  display: z.optional(z.enum(['both', 'hebrew', 'translation'])),
  /** famille de langue de la traduction (« english », « french »…) */
  language: z.optional(z.string()),
  /** calendrier de diaspora (sinon d'Israël) pour les lectures du jour */
  diaspora: z.optional(z.boolean()),
  books: z.optional(z.record(z.string(), z.object({ hebrew: z.optional(z.string()), translation: z.optional(z.object({ language: z.string(), title: z.string() })) }))),
});

export interface Settings {
  readonly twoColumns: boolean;
  readonly textScale: number;
  readonly display: Display;
  readonly language: string;
  readonly diaspora: boolean;
  readonly books: Readonly<Record<string, BookVersions>>;
}

const DEFAULTS: Settings = { twoColumns: false, textScale: 1, display: 'both', language: 'english', diaspora: true, books: {} };

const decoder = new TextDecoder();

export const settingsFile = (): string => GLib.build_filenamev([GLib.get_user_config_dir(), 'sefaria-gnome', 'settings.json']);

/** Réglages lus (valeurs par défaut si fichier absent ou invalide). */
export function readSettings(file = settingsFile()): Settings {
  try {
    const [, bytes] = GLib.file_get_contents(file);
    const r = z.safeParse(RawSettings, JSON.parse(decoder.decode(bytes)));
    if (r.success) {
      const d = r.data;
      const books: Record<string, BookVersions> = {};
      for (const [k, v] of Object.entries(d.books ?? {})) books[k] = { ...(v.hebrew === undefined ? {} : { hebrew: v.hebrew }), ...(v.translation === undefined ? {} : { translation: v.translation }) };
      return {
        twoColumns: d.twoColumns ?? DEFAULTS.twoColumns,
        textScale: d.textScale ?? DEFAULTS.textScale,
        display: d.display ?? DEFAULTS.display,
        language: d.language ?? DEFAULTS.language,
        diaspora: d.diaspora ?? DEFAULTS.diaspora,
        books,
      };
    }
  } catch {
    // absent ou illisible
  }
  return DEFAULTS;
}

export function writeSettings(s: Settings, file = settingsFile()): void {
  GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
  GLib.file_set_contents(file, JSON.stringify(s, null, 2));
}

/** Réglages réactifs, enregistrés à chaque modification. */
export class SettingsStore {
  readonly value: Accessor<Settings>;
  readonly #set: Setter<Settings>;
  readonly #file: string;

  constructor(file = settingsFile()) {
    this.#file = file;
    [this.value, this.#set] = createState(readSettings(file));
  }

  update(patch: Partial<Settings>): void {
    const next = { ...this.value.peek(), ...patch };
    this.#set(next);
    try {
      writeSettings(next, this.#file);
    } catch (error) {
      console.error(`réglages non enregistrés : ${String(error)}`);
    }
  }

  /** Modifie les versions choisies pour `book`. */
  updateBook(book: string, patch: Partial<BookVersions>): void {
    const books = this.value.peek().books;
    this.update({ books: { ...books, [book]: { ...books[book], ...patch } } });
  }
}
