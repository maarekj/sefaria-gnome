// Traduction par IA : invite envoyée à l'outil (contexte compris) et lecture de sa réponse.
// Sans dépendance à GJS ni à Node.
import * as z from 'zod/mini';
import type { Passage } from './api.ts';
import { hasBold, plainText, richText } from './markup.ts';

/** Version de l'invite (dans la clé du cache : une invite modifiée retraduit). */
export const PROMPT_VERSION = 2;

/** Traduction existante pour l'invite : avec son gras (mode « littéral + explication ») ou en texte brut. */
const existing = (html: string, rich: boolean): string => (rich ? richText(html) : plainText(html));

/** Consignes du mode « littéral + explication » (traduction existante avec du gras). */
const RICH_RULES = [
  "La traduction existante suit la présentation traditionnelle : en <b>gras</b> la traduction littérale du texte original, sans gras l'explication qui l'enrobe.",
  "Traduis cette traduction existante EN ENTIER (traduction littérale ET explications), en vérifiant la partie littérale sur le texte original ;",
  'garde <b>…</b> autour de ce qui traduit littéralement le texte original, laisse les explications sans gras, et <i>…</i> pour les mots translittérés.',
  "Pour un segment sans traduction existante, traduis simplement l'original.",
  'Dans le JSON, les valeurs peuvent contenir uniquement les balises <b> et <i>.',
];

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
/** Verset commenté (contexte de la traduction d'un commentaire). */
export interface Commented {
  readonly ref: string;
  /** HTML de Sefaria */
  readonly he: string;
  readonly en: string;
}

export function buildPrompt(passage: Passage, language: string, only?: string, commented?: Commented): string {
  const rich = passage.segments.some((s) => hasBold(s.en));
  const lines = passage.segments.map((s) => {
    const he = plainText(s.he);
    const en = existing(s.en, rich);
    return `[${s.label}] ${he}${en === '' ? '' : `\n    (traduction existante : ${en})`}`;
  });
  const target = only === undefined ? 'chaque segment' : `uniquement le segment [${only}]`;
  return [
    `Tu traduis des textes juifs classiques (Tanakh, Michna, Talmud, commentaires…) de l'hébreu ou de l'araméen vers le ${languageLabel(language)}.`,
    `Passage : ${passage.ref} (${passage.heRef}), livre « ${passage.book} ».`,
    ...(commented === undefined
      ? []
      : [
          `Ce texte commente ${commented.ref} ; le voici, pour comprendre le commentaire (ne pas le traduire) :`,
          `    ${plainText(commented.he)}`,
          ...(commented.en === '' ? [] : [`    (traduction existante : ${plainText(commented.en)})`]),
          'Les mots du verset cités par le commentaire (en tête, souvent en gras) se traduisent comme dans ce verset.',
        ]),
    'Voici la section entière, segment par segment, avec la traduction existante de Sefaria quand elle existe (version' +
      ` « ${passage.enVersion || 'aucune'} », à utiliser comme appui seulement, pas à recopier).`,
    '',
    ...lines,
    '',
    `Traduis ${target} en ${languageLabel(language)}, fidèlement au texte original, en tenant compte du contexte de la section et de la tradition d'interprétation juive ;`,
    ...(rich ? RICH_RULES : []),
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

/** Commentaire à traduire (une source liée) et son identifiant dans la réponse. */
export interface Commentary {
  /** clé de la réponse : « c1 », « c2 »… (segments : « c1.1 », « c1.2 » si plusieurs) */
  readonly id: string;
  readonly passage: Passage;
}

/** Clé d'un segment de commentaire dans la réponse. */
export const commentaryKey = (c: Commentary, label: string): string => (c.passage.segments.length === 1 ? c.id : `${c.id}.${label}`);

/**
 * Invite pour traduire ensemble les commentaires d'un auteur sur un verset : section entière de
 * l'onglet en contexte (verset commenté signalé), puis chaque commentaire avec la traduction de
 * Sefaria en appui.
 */
export function buildCommentaryPrompt(comments: readonly Commentary[], section: Passage, commented: string, segmentRef: (label: string) => string, language: string, author: string): string {
  const sectionLines = section.segments.map((s) => {
    const mark = segmentRef(s.label) === commented ? '  ← VERSET COMMENTÉ' : '';
    const en = plainText(s.en);
    return `(${s.label}) ${plainText(s.he)}${mark}${en === '' ? '' : `\n    (traduction : ${en})`}`;
  });
  const rich = comments.some((c) => c.passage.segments.some((s) => hasBold(s.en)));
  const commentLines = comments.flatMap((c) => [
    `— ${c.passage.ref} :`,
    ...c.passage.segments.map((s) => {
      const en = existing(s.en, rich);
      return `[${commentaryKey(c, s.label)}] ${plainText(s.he)}${en === '' ? '' : `\n    (traduction existante : ${en})`}`;
    }),
  ]);
  return [
    `Tu traduis des commentaires juifs classiques de l'hébreu ou de l'araméen vers le ${languageLabel(language)}.`,
    `Voici les commentaires de ${author} sur ${commented}, dans leur ordre ; ils se suivent et peuvent se répondre.`,
    `Pour les comprendre, voici d'abord la section ${section.ref} (${section.heRef}) qui les entoure (ne pas la traduire), le verset commenté signalé :`,
    '',
    ...sectionLines,
    '',
    `Commentaires à traduire (avec la traduction de Sefaria quand elle existe, à utiliser comme appui seulement, pas à recopier) :`,
    '',
    ...commentLines,
    '',
    `Traduis chaque commentaire en ${languageLabel(language)}, fidèlement, en tenant compte du verset, de la section et des autres commentaires ;`,
    "les mots du verset cités en tête d'un commentaire (dibour hamathil) se traduisent comme dans le verset ; sans notes ni ajouts.",
    ...(rich ? RICH_RULES : []),
    'Réponds UNIQUEMENT par un objet JSON dont les clés sont les identifiants entre crochets (ex. "c1", "c2.1") et les valeurs les traductions, sans texte autour.',
  ].join('\n');
}
