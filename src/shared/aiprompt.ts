// Traduction par IA : invite envoyée à l'outil (contexte compris) et lecture de sa réponse.
// Sans dépendance à GJS ni à Node.
import * as z from 'zod/mini';
import type { Passage } from './api.ts';
import { plainText } from './markup.ts';

/** Langues cibles proposées (famille → nom dans l'invite et dans les préférences). */
export const AI_LANGUAGES: readonly (readonly [string, string])[] = [
  ['french', 'français'],
  ['english', 'anglais'],
  ['spanish', 'espagnol'],
  ['german', 'allemand'],
  ['italian', 'italien'],
  ['portuguese', 'portugais'],
  ['russian', 'russe'],
  ['modern-hebrew', 'hébreu moderne'],
];

export const languageLabel = (code: string): string => AI_LANGUAGES.find(([c]) => c === code)?.[1] ?? code;

/**
 * Invite pour traduire `passage` (tous ses segments, ou seulement `only`) : référence, section
 * entière en hébreu comme contexte, traduction de Sefaria comme appui ; réponse JSON attendue.
 */
export function buildPrompt(passage: Passage, language: string, only?: string): string {
  const lines = passage.segments.map((s) => {
    const he = plainText(s.he);
    const en = plainText(s.en);
    return `[${s.label}] ${he}${en === '' ? '' : `\n    (traduction existante : ${en})`}`;
  });
  const target = only === undefined ? 'chaque segment' : `uniquement le segment [${only}]`;
  return [
    `Tu traduis des textes juifs classiques (Tanakh, Michna, Talmud, commentaires…) de l'hébreu ou de l'araméen vers le ${languageLabel(language)}.`,
    `Passage : ${passage.ref} (${passage.heRef}), livre « ${passage.book} ».`,
    'Voici la section entière, segment par segment, avec la traduction existante de Sefaria quand elle existe (version' +
      ` « ${passage.enVersion || 'aucune'} », à utiliser comme appui seulement, pas à recopier).`,
    '',
    ...lines,
    '',
    `Traduis ${target} en ${languageLabel(language)}, fidèlement au texte original, en tenant compte du contexte de la section et de la tradition d'interprétation juive ;`,
    'garde les noms propres sous leur forme usuelle dans cette langue, sans notes ni commentaires.',
    'Réponds UNIQUEMENT par un objet JSON dont les clés sont les numéros de segment (ex. "1", "2:5") et les valeurs les traductions, sans texte autour.',
  ].join('\n');
}

const Translations = z.record(z.string(), z.string());

/** Traductions lues dans la réponse (JSON éventuellement entouré de texte ou de ```json) ; segments inconnus ignorés. */
export function parseAiResponse(text: string, labels: readonly string[]): Record<string, string> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('réponse de l’IA sans JSON');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('réponse de l’IA illisible (JSON invalide)');
  }
  const parsed = z.safeParse(Translations, raw);
  if (!parsed.success) throw new Error('réponse de l’IA inattendue');
  const wanted = new Set(labels);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) if (wanted.has(k) && v.trim() !== '') out[k] = v.trim();
  if (Object.keys(out).length === 0) throw new Error('aucune traduction dans la réponse de l’IA');
  return out;
}
