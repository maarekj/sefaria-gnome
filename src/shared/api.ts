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
  versionTitle: z.string(),
  direction: z.optional(z.string()),
  text: Content,
});

export const TextResponse = z.looseObject({
  ref: z.string(),
  heRef: z.optional(z.string()),
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

export function toPassage(r: TextResponse): Passage {
  const he = r.versions.find((v) => v.language === 'he');
  const en = r.versions.find((v) => v.language !== 'he');
  const start = startOf(r);
  const heMap = new Map<string, string>();
  const enMap = new Map<string, string>();
  if (he !== undefined) flatten(he.text, start, '', heMap);
  if (en !== undefined) flatten(en.text, start, '', enMap);
  // ordre de la version hébraïque, puis segments présents seulement dans la traduction
  const labels = [...new Set([...heMap.keys(), ...enMap.keys()])];
  return {
    ref: r.ref,
    heRef: r.heRef ?? r.ref,
    next: r.next ?? null,
    prev: r.prev ?? null,
    heVersion: he?.versionTitle ?? '',
    enVersion: en?.versionTitle ?? '',
    segments: labels.map((label) => ({ label, he: heMap.get(label) ?? '', en: enMap.get(label) ?? '' })).filter((s) => s.he !== '' || s.en !== ''),
  };
}
