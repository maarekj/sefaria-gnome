// Réglages de l'utilisateur : $XDG_CONFIG_HOME/sefaria-gnome/settings.json, validé par zod.
import GLib from 'gi://GLib';
import { type Accessor, createState, type Setter } from 'gnim';
import * as z from 'zod/mini';

const RawSettings = z.object({
  /** hébreu et traduction côte à côte */
  twoColumns: z.optional(z.boolean()),
  /** échelle du texte lu (1 : taille par défaut), bornée à l'usage */
  textScale: z.optional(z.number().check(z.positive())),
});
export interface Settings {
  readonly twoColumns: boolean;
  readonly textScale: number;
}

const DEFAULTS: Settings = { twoColumns: false, textScale: 1 };

const decoder = new TextDecoder();

export const settingsFile = (): string => GLib.build_filenamev([GLib.get_user_config_dir(), 'sefaria-gnome', 'settings.json']);

/** Réglages lus (valeurs par défaut si fichier absent ou invalide). */
export function readSettings(file = settingsFile()): Settings {
  try {
    const [, bytes] = GLib.file_get_contents(file);
    const r = z.safeParse(RawSettings, JSON.parse(decoder.decode(bytes)));
    if (r.success) return { twoColumns: r.data.twoColumns ?? DEFAULTS.twoColumns, textScale: r.data.textScale ?? DEFAULTS.textScale };
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
}
