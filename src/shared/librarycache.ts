// Cache disque de la bibliothèque ($XDG_CACHE_HOME/sefaria-gnome/library.json) : la table des
// matières de Sefaria (≈ 4 Mo de JSON, ≈ 1 Mo une fois réduite) n'est pas retéléchargée ni revalidée
// à chaque lancement ; elle est affichée tout de suite puis rafraîchie en arrière-plan si ancienne.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as z from 'zod/mini';
import type { LibraryNode } from './api.ts';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

/** Âge au-delà duquel la bibliothèque est rafraîchie (en arrière-plan). */
export const LIBRARY_MAX_AGE_S = 24 * 3600;

const Node: z.ZodMiniType<LibraryNode> = z.union([
  z.object({ kind: z.literal('book'), title: z.string(), heTitle: z.string(), description: z.string() }),
  z.object({ kind: z.literal('category'), name: z.string(), heName: z.string(), description: z.string(), contents: z.array(z.lazy(() => Node)) }),
]);
const Cached = z.object({ server: z.string(), fetched: z.number(), nodes: z.array(Node) });

export interface CachedLibrary {
  readonly nodes: LibraryNode[];
  /** date de téléchargement (secondes Unix) */
  readonly fetched: number;
}

export const libraryCacheFile = (): string => GLib.build_filenamev([GLib.get_user_cache_dir(), 'sefaria-gnome', 'library.json']);

const decoder = new TextDecoder();

/** Bibliothèque en cache pour `server` (null : absente, illisible ou d'un autre serveur). */
export async function readLibraryCache(server: string, file = libraryCacheFile()): Promise<CachedLibrary | null> {
  try {
    const [bytes] = await Gio.File.new_for_path(file).load_contents_async(null);
    const r = z.safeParse(Cached, JSON.parse(decoder.decode(bytes)));
    return r.success && r.data.server === server ? { nodes: r.data.nodes, fetched: r.data.fetched } : null;
  } catch {
    return null;
  }
}

/** Enregistre la bibliothèque (asynchrone, atomique : fichier temporaire puis renommage). */
export async function writeLibraryCache(server: string, nodes: readonly LibraryNode[], file = libraryCacheFile()): Promise<void> {
  try {
    GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
    const data = new TextEncoder().encode(JSON.stringify({ server, fetched: Math.floor(Date.now() / 1000), nodes }));
    await Gio.File.new_for_path(file).replace_contents_bytes_async(new GLib.Bytes(data), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
  } catch (error) {
    console.error(`bibliothèque non mise en cache : ${String(error)}`);
  }
}

/** Cache trop ancien : à rafraîchir. */
export const isStale = (fetched: number, now = Date.now() / 1000): boolean => now - fetched > LIBRARY_MAX_AGE_S || fetched > now + 60;
