// Traduction par IA : appel asynchrone de la CLI de Claude Code ou d'opencode, et cache sur disque
// ($XDG_CACHE_HOME/sefaria-gnome/translations/).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as z from 'zod/mini';
import { buildCommentaryPrompt, buildPrompt, PROMPT_VERSION, type Commentary, type Commented, commentaryKey, parseAiResponse } from './aiprompt.ts';
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
  return cachePath([PROMPT_VERSION, p.ref, only ?? '', p.heVersion, p.enVersion, o.language, o.tool, o.model.trim(), ...(commented === undefined ? [] : [commented])]);
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
/** Cache, sinon appel de l'outil, puis mise en cache (`force` : retraduire). */
async function cachedRun(file: string, prompt: () => string, labels: readonly string[], o: AiOptions, cancellable: Gio.Cancellable, force: boolean): Promise<Record<string, string>> {
  if (!force) {
    const hit = readCache(file);
    if (hit !== null) return hit;
  }
  const result = parseAiResponse(await run(o, prompt(), cancellable), labels);
  try {
    GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
    GLib.file_set_contents(file, JSON.stringify(result));
  } catch (error) {
    console.error(`traduction non mise en cache : ${String(error)}`);
  }
  return result;
}

function cachePath(key: unknown): string {
  // pas de NUL dans la clé : compute_checksum_for_string s'arrêterait au premier
  const text = JSON.stringify(key);
  const name = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1) ?? encodeURIComponent(text);
  return GLib.build_filenamev([GLib.get_user_cache_dir(), 'sefaria-gnome', 'translations', `${name}.json`]);
}

/**
 * Traduction de `p` (tous ses segments, ou `only`) : cache, sinon appel de l'outil (`force` :
 * retraduire). Segments → texte traduit.
 */
export function translate(
  p: Passage,
  o: AiOptions,
  cancellable: Gio.Cancellable,
  options: { only?: string; force?: boolean; commented?: Commented } = {},
): Promise<Record<string, string>> {
  const labels = options.only === undefined ? p.segments.map((s) => s.label) : [options.only];
  return cachedRun(cacheFile(p, o, options.only, options.commented?.ref), () => buildPrompt(p, o.language, options.only, options.commented), labels, o, cancellable, options.force === true);
}

/**
 * Traduction ensemble des commentaires d'un auteur sur le verset `commented` de `section` ;
 * réponse : pour chaque commentaire (par référence), segments → texte traduit.
 */
export async function translateCommentaries(
  passages: readonly Passage[],
  section: Passage,
  commented: string,
  segmentRef: (label: string) => string,
  author: string,
  o: AiOptions,
  cancellable: Gio.Cancellable,
): Promise<Map<string, Record<string, string>>> {
  const comments: Commentary[] = passages.map((passage, i) => ({ id: `c${i + 1}`, passage }));
  const labels = comments.flatMap((c) => c.passage.segments.map((s) => commentaryKey(c, s.label)));
  const key = [PROMPT_VERSION, 'commentaires', passages.map((p) => [p.ref, p.heVersion, p.enVersion]), commented, section.ref, section.heVersion, section.enVersion, o.language, o.tool, o.model.trim()];
  const values = await cachedRun(cachePath(key), () => buildCommentaryPrompt(comments, section, commented, segmentRef, o.language, author), labels, o, cancellable, false);
  return new Map(
    comments.map((c) => {
      const out: Record<string, string> = {};
      for (const s of c.passage.segments) {
        const v = values[commentaryKey(c, s.label)];
        if (v !== undefined) out[s.label] = v;
      }
      return [c.passage.ref, out];
    }),
  );
}
