// Contrat avec l'API publique de Sefaria (https://developers.sefaria.org) : schémas zod/mini des
// réponses utilisées et leur mise en forme pour l'application. Sans dépendance à GJS ni à Node
// (importé aussi par le faux serveur, scripts/fake-sefaria.ts).
import * as z from 'zod/mini';

/** Serveur par défaut (SEFARIA_GNOME_URL pour les tests). */
export const DEFAULT_URL = 'https://www.sefaria.org';

// ------------------------------------------------------------------ bibliothèque (/api/index)

/** Nœud brut de la table des matières : catégorie (`category` + `contents`) ou livre (`title`). */
const RawNode = z.looseObject({
  category: z.optional(z.string()),
  heCategory: z.optional(z.string()),
  title: z.optional(z.nullable(z.string())),
  heTitle: z.optional(z.nullable(z.string())),
  enShortDesc: z.optional(z.string()),
  heShortDesc: z.optional(z.string()),
  contents: z.optional(z.array(z.unknown())),
});

export interface Category {
  readonly kind: 'category';
  readonly name: string;
  readonly heName: string;
  readonly description: string;
  readonly contents: readonly LibraryNode[];
}

export interface Book {
  readonly kind: 'book';
  readonly title: string;
  readonly heTitle: string;
  readonly description: string;
}

export type LibraryNode = Category | Book;

/** Table des matières validée (`GET /api/index`) ; nœuds inconnus ignorés. */
export function parseIndex(raw: unknown): LibraryNode[] {
  return z.parse(z.array(z.unknown()), raw).flatMap((item): LibraryNode[] => {
    const r = z.safeParse(RawNode, item);
    if (!r.success) return [];
    const n = r.data;
    if (n.contents !== undefined && n.category !== undefined) {
      return [{ kind: 'category', name: n.category, heName: n.heCategory ?? n.category, description: n.enShortDesc ?? '', contents: parseIndex(n.contents) }];
    }
    if (typeof n.title === 'string') return [{ kind: 'book', title: n.title, heTitle: n.heTitle ?? n.title, description: n.enShortDesc ?? '' }];
    return [];
  });
}

/** Clé stable d'un nœud (listes ordonnées). */
export const nodeKey = (n: LibraryNode): string => (n.kind === 'category' ? `c:${n.name}` : `b:${n.title}`);

// ------------------------------------------------------------------ textes (/api/v3/texts/{ref})

/** Contenu d'une version : chaîne, ou tableaux imbriqués selon la profondeur du texte. */
type Content = string | readonly Content[];
const Content: z.ZodMiniType<Content> = z.union([z.string(), z.array(z.lazy(() => Content))]);

const Version = z.looseObject({
  language: z.string(),
  /** famille de langue (« hebrew », « english », « french »…) ; absente des anciennes réponses */
  languageFamilyName: z.optional(z.string()),
  versionTitle: z.string(),
  direction: z.optional(z.string()),
  text: Content,
});

export const TextResponse = z.looseObject({
  ref: z.string(),
  heRef: z.optional(z.string()),
  indexTitle: z.optional(z.string()),
  sectionRef: z.optional(z.string()),
  firstAvailableSectionRef: z.optional(z.nullable(z.string())),
  next: z.optional(z.nullable(z.string())),
  prev: z.optional(z.nullable(z.string())),
  sections: z.optional(z.array(z.union([z.string(), z.number()]))),
  textDepth: z.optional(z.number()),
  versions: z.array(Version),
});
export type TextResponse = z.infer<typeof TextResponse>;

/** Segment affiché : numéro, texte hébreu et traduction (HTML de Sefaria). */
export interface Segment {
  readonly label: string;
  readonly he: string;
  readonly en: string;
}

/** Passage prêt à afficher. */
export interface Passage {
  readonly ref: string;
  /** titre du livre (choix des versions par livre) */
  readonly book: string;
  /** famille de langue de la traduction affichée (« english », « french »…), vide si aucune */
  readonly language: string;
  readonly heRef: string;
  readonly next: string | null;
  readonly prev: string | null;
  readonly heVersion: string;
  readonly enVersion: string;
  readonly segments: readonly Segment[];
}

/** Livre entier demandé (pas de section) : section à ouvrir à la place, sinon null. */
export function firstSection(r: TextResponse): string | null {
  if ((r.sections ?? []).length > 0) return null;
  const first = r.firstAvailableSectionRef ?? null;
  return first !== null && first !== r.ref ? first : null;
}

/** Segments d'une version, à plat, avec leur numéro (« 3 », ou « 2:5 » pour plusieurs sections). */
function flatten(content: Content, start: number, prefix: string, out: Map<string, string>): void {
  if (typeof content === 'string') {
    out.set(prefix === '' ? String(start) : prefix, content);
    return;
  }
  content.forEach((c, i) => {
    const n = String(start + i);
    if (typeof c === 'string') out.set(prefix === '' ? n : `${prefix}:${n}`, c);
    else flatten(c, 1, prefix === '' ? n : `${prefix}:${n}`, out);
  });
}

/** Numéro du premier segment de la réponse (dernière section précisée dans la référence). */
function startOf(r: TextResponse): number {
  const sections = r.sections ?? [];
  if (sections.length < (r.textDepth ?? 2)) return 1;
  // « 5 », ou « 2a » (daf du Talmud) : numéro en tête
  const digits = /^\d+/u.exec(String(sections.at(-1) ?? ''));
  return digits === null ? 1 : Number(digits[0]);
}

/** Famille de langue d'une version (anciennes réponses : déduite de `language`). */
export const familyOf = (v: { readonly language: string; readonly languageFamilyName?: string | undefined }): string => v.languageFamilyName ?? (v.language === 'he' ? 'hebrew' : 'english');

/** Versions voulues pour un passage : traduction préférée, repli, version hébraïque. */
export interface Wanted {
  readonly translation: VersionChoice;
  /** traduction de repli si la langue préférée manque (défaut : anglais) */
  readonly fallback?: VersionChoice | undefined;
  readonly hebrew?: string | undefined;
}

const ENGLISH: Wanted = { translation: { language: 'english' } };

/**
 * Passage : version hébraïque (titre voulu, sinon celle par défaut), traduction dans la langue
 * préférée (titre voulu de préférence), sinon le repli, sinon la première autre.
 */
export function toPassage(r: TextResponse, wanted: Wanted = ENGLISH): Passage {
  const hebrews = r.versions.filter((v) => familyOf(v) === 'hebrew');
  const he = hebrews.find((v) => v.versionTitle === wanted.hebrew) ?? hebrews[0];
  const others = r.versions.filter((v) => familyOf(v) !== 'hebrew');
  const inLanguage = (c: VersionChoice): (typeof others)[number] | undefined => {
    const all = others.filter((v) => familyOf(v) === c.language);
    return all.find((v) => v.versionTitle === c.title) ?? all[0];
  };
  const en = inLanguage(wanted.translation) ?? inLanguage(wanted.fallback ?? { language: 'english' }) ?? others[0];
  const start = startOf(r);
  const heMap = new Map<string, string>();
  const enMap = new Map<string, string>();
  if (he !== undefined) flatten(he.text, start, '', heMap);
  if (en !== undefined) flatten(en.text, start, '', enMap);
  // ordre de la version hébraïque, puis segments présents seulement dans la traduction
  const labels = [...new Set([...heMap.keys(), ...enMap.keys()])];
  return {
    ref: r.ref,
    book: r.indexTitle ?? r.ref,
    language: en === undefined ? '' : familyOf(en),
    heRef: r.heRef ?? r.ref,
    next: r.next ?? null,
    prev: r.prev ?? null,
    heVersion: he?.versionTitle ?? '',
    enVersion: en?.versionTitle ?? '',
    segments: labels.map((label) => ({ label, he: heMap.get(label) ?? '', en: enMap.get(label) ?? '' })).filter((s) => s.he !== '' || s.en !== ''),
  };
}

// ------------------------------------------------------------------ versions (/api/texts/versions/{titre})

const RawVersion = z.looseObject({
  versionTitle: z.string(),
  language: z.string(),
  languageFamilyName: z.optional(z.string()),
  versionTitleInHebrew: z.optional(z.nullable(z.string())),
});

/** Version disponible d'un livre. */
export interface VersionInfo {
  readonly title: string;
  /** famille de langue : « hebrew », « english », « french »… */
  readonly language: string;
}

export function parseVersions(raw: unknown): VersionInfo[] {
  return z.parse(z.array(RawVersion), raw).map((v) => ({ title: v.versionTitle, language: familyOf(v) }));
}

/** Version demandée : langue, et titre précis (sinon version par défaut de Sefaria dans cette langue). */
export interface VersionChoice {
  readonly language: string;
  readonly title?: string | undefined;
}

/**
 * Paramètres `version=` de /api/v3/texts : hébreu, traduction voulue, repli (anglais par défaut).
 * Un titre précis est toujours accompagné de la version par défaut de sa langue (titre retiré
 * ou renommé chez Sefaria : la langue reste affichée).
 */
const versionParam = (language: string, title?: string): string => `version=${encodeURIComponent(title === undefined ? language : `${language}|${title}`)}`;

export function versionParams(wanted: Wanted): string {
  const choices: VersionChoice[] = [{ language: 'hebrew', title: wanted.hebrew }, wanted.translation, wanted.fallback ?? { language: 'english' }];
  const params = choices.flatMap((c) => (c.title === undefined ? [versionParam(c.language)] : [versionParam(c.language, c.title), versionParam(c.language)]));
  return [...new Set(params)].join('&');
}

/** Noms français des langues de traduction courantes (sinon le nom anglais de Sefaria). */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  hebrew: 'Hébreu',
  english: 'Anglais',
  french: 'Français',
  german: 'Allemand',
  spanish: 'Espagnol',
  italian: 'Italien',
  portuguese: 'Portugais',
  russian: 'Russe',
  yiddish: 'Yiddish',
  polish: 'Polonais',
  finnish: 'Finnois',
  esperanto: 'Espéranto',
  persian: 'Persan',
  ladino: 'Judéo-espagnol',
  arabic: 'Arabe',
};
export const languageName = (family: string): string => LANGUAGE_NAMES[family] ?? family.charAt(0).toUpperCase() + family.slice(1);

/** Livre d'une référence parmi `books` (« Genesis 3:4 » → « Genesis », le plus long titre l'emporte). */
export function bookOf(ref: string, books: Readonly<Record<string, unknown>>): string | undefined {
  return Object.keys(books)
    .filter((b) => ref === b || ref.startsWith(`${b} `))
    .toSorted((a, b) => b.length - a.length)[0];
}
