// Traduction par IA : appel asynchrone de la CLI de Claude Code ou d'opencode, et cache sur disque
// ($XDG_CACHE_HOME/sefaria-gnome/translations/).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as z from 'zod/mini';
import { buildPrompt, type Commented, parseAiResponse } from './aiprompt.ts';
import type { Passage } from './api.ts';
import type { AiTool } from './settings.ts';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

/** Réglages d'une traduction. */
export interface AiOptions {
  readonly tool: Exclude<AiTool, 'none'>;
  readonly model: string;
  readonly language: string;
}

export const TOOL_NAMES: Readonly<Record<AiTool, string>> = { none: 'Désactivée', claude: 'Claude Code', opencode: 'opencode' };

/** Ligne de commande ; l'invite passe toujours par l'entrée standard (pas de limite de taille d'argument). */
function command(o: AiOptions, prompt: string): { argv: string[]; stdin: string } {
  // outil de test (e2e) : reçoit l'invite sur l'entrée standard, répond sur la sortie
  const fake = GLib.getenv('SEFARIA_GNOME_AI_COMMAND');
  if (fake !== null) return { argv: [fake, o.tool], stdin: prompt };
  const model = o.model.trim() === '' ? [] : ['--model', o.model.trim()];
  if (o.tool === 'claude') return { argv: ['claude', '-p', '--output-format', 'text', '--tools', '', '--no-session-persistence', '--strict-mcp-config', ...model], stdin: prompt };
  return { argv: ['opencode', 'run', ...model], stdin: prompt };
}

/** Dossier vide où l'outil est lancé (aucun fichier de projet dans son contexte). */
function workDir(): string {
  const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'sefaria-gnome', 'ai-work']);
  GLib.mkdir_with_parents(dir, 0o700);
  return dir;
}

/** Appel de l'outil ; `cancellable` annule (processus tué). */
async function run(o: AiOptions, prompt: string, cancellable: Gio.Cancellable): Promise<string> {
  const { argv, stdin } = command(o, prompt);
  const launcher = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE });
  launcher.set_cwd(workDir());
  // aucun outil (fichiers, commandes) : l'invite contient du texte venu de Sefaria
  launcher.setenv('OPENCODE_PERMISSION', '{"*":"deny"}', true);
  let proc: Gio.Subprocess;
  try {
    proc = launcher.spawnv(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${TOOL_NAMES[o.tool]} n'a pas pu être lancé (« ${argv[0] ?? ''} ») : ${message}`, { cause: error });
  }
  const id = cancellable.connect(() => proc.force_exit());
  try {
    const [out, err] = await proc.communicate_utf8_async(stdin, cancellable);
    if (cancellable.is_cancelled()) throw new Error('traduction annulée');
    if (!proc.get_successful()) throw new Error(`${TOOL_NAMES[o.tool]} a échoué : ${(err ?? '').trim().split('\n').slice(-3).join(' ') || `code ${proc.get_exit_status()}`}`);
    return out ?? '';
  } finally {
    cancellable.disconnect(id);
  }
}

// ------------------------------------------------------------------ cache

const decoder = new TextDecoder();
const CacheEntry = z.record(z.string(), z.string());

function cacheFile(p: Passage, o: AiOptions, only: string | undefined, commented?: string): string {
  // pas de NUL comme séparateur : compute_checksum_for_string s'arrêterait au premier
  const key = JSON.stringify([p.ref, only ?? '', p.heVersion, p.enVersion, o.language, o.tool, o.model.trim(), ...(commented === undefined ? [] : [commented])]);
  const name = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, key, -1) ?? encodeURIComponent(key);
  return GLib.build_filenamev([GLib.get_user_cache_dir(), 'sefaria-gnome', 'translations', `${name}.json`]);
}

function readCache(file: string): Record<string, string> | null {
  try {
    const [, bytes] = GLib.file_get_contents(file);
    const r = z.safeParse(CacheEntry, JSON.parse(decoder.decode(bytes)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Traduction en cache (sans appel), ou null. */
export function cachedTranslation(p: Passage, o: AiOptions, only?: string): Record<string, string> | null {
  return readCache(cacheFile(p, o, only));
}

/**
 * Traduction de `p` (tous ses segments, ou `only`) : cache, sinon appel de l'outil (`force` :
 * retraduire). Segments → texte traduit.
 */
export async function translate(
  p: Passage,
  o: AiOptions,
  cancellable: Gio.Cancellable,
  options: { only?: string; force?: boolean; commented?: Commented } = {},
): Promise<Record<string, string>> {
  const file = cacheFile(p, o, options.only, options.commented?.ref);
  if (options.force !== true) {
    const hit = readCache(file);
    if (hit !== null) return hit;
  }
  const labels = options.only === undefined ? p.segments.map((s) => s.label) : [options.only];
  const result = parseAiResponse(await run(o, buildPrompt(p, o.language, options.only, options.commented), cancellable), labels);
  try {
    GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
    GLib.file_set_contents(file, JSON.stringify(result));
  } catch (error) {
    console.error(`traduction non mise en cache : ${String(error)}`);
  }
  return result;
}
