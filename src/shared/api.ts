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
  /** le passage couvre plusieurs chapitres d'un texte à deux niveaux (numéros « chapitre:verset ») */
  readonly multiChapter: boolean;
  /** section du passage (« Genesis 1 », « Berakhot 2a ») et profondeur du texte : références des segments */
  readonly sectionRef: string;
  readonly textDepth: number;
}

/** Livre entier demandé (pas de section) : section à ouvrir à la place, sinon null. */
export function firstSection(r: TextResponse): string | null {
  if ((r.sections ?? []).length > 0) return null;
  const first = r.firstAvailableSectionRef ?? null;
  return first !== null && first !== r.ref ? first : null;
}

/** Segments d'une version, à plat, avec leur numéro (« 3 », ou « 2:5 » pour plusieurs sections). */
/** Profondeur d'imbrication d'un contenu (0 : chaîne, 1 : liste de segments…). */
function nesting(content: Content): number {
  if (typeof content === 'string') return 0;
  const first = content.find((c) => typeof c !== 'string' || c !== '');
  return 1 + (first === undefined ? 0 : nesting(first));
}

/**
 * Segments d'une version, à plat, numérotés : « 3 » dans une section, « 3:22 » quand le passage
 * couvre plusieurs sections. `starts` : premier numéro de chaque niveau (seulement pour la première
 * branche : les sections suivantes recommencent à 1).
 */
function flatten(content: Content, starts: readonly number[], level: number, first: boolean, prefix: string, out: Map<string, string>): void {
  if (typeof content === 'string') {
    out.set(prefix, content);
    return;
  }
  content.forEach((c, i) => {
    const n = String((first ? (starts[level] ?? 1) : 1) + i);
    flatten(c, starts, level + 1, first && i === 0, prefix === '' ? n : `${prefix}:${n}`, out);
  });
}

/** Numéro en tête d'une section (« 5 », « 2a » → 2), sinon 1. */
const sectionNumber = (s: string | number | undefined): number => {
  const digits = /^\d+/u.exec(String(s ?? ''));
  return digits === null ? 1 : Number(digits[0]);
};

/** Segments d'une version de la réponse `r`. */
function segmentsOf(r: TextResponse, content: Content): Map<string, string> {
  const out = new Map<string, string>();
  const sections = r.sections ?? [];
  const depth = r.textDepth ?? 2;
  const n = nesting(content);
  if (n === 0) {
    out.set(String(sectionNumber(sections.at(-1))), typeof content === 'string' ? content : '');
    return out;
  }
  // niveaux couverts par le contenu : les `n` derniers du texte
  const top = Math.max(0, depth - n);
  const starts = Array.from({ length: n }, (_, k) => sectionNumber(sections[top + k]));
  flatten(content, starts, 0, true, '', out);
  return out;
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
  const n = Math.max(he === undefined ? 0 : nesting(he.text), en === undefined ? 0 : nesting(en.text));
  // seuls les textes à deux niveaux (chapitre, verset) ont des chapitres à titrer ; un commentaire
  // (verset:commentaire) non
  const multiChapter = (r.textDepth ?? 2) === 2 && n === 2;
  const heMap = he === undefined ? new Map<string, string>() : segmentsOf(r, he.text);
  const enMap = en === undefined ? new Map<string, string>() : segmentsOf(r, en.text);
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
    multiChapter,
    sectionRef: r.sectionRef ?? r.ref,
    textDepth: r.textDepth ?? 2,
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

// ------------------------------------------------------------------ table des matières (/api/shape, /api/v2/raw/index)

/** Section d'un livre : libellé affiché (« 3 », « 5b ») et référence à ouvrir. */
export interface TocSection {
  readonly label: string;
  readonly ref: string;
}

/** Partie d'un livre complexe : ouverte directement (`sections` null) ou découpée en sections. */
export interface TocNode {
  readonly title: string;
  readonly heTitle: string;
  readonly ref: string;
  readonly sections: readonly TocSection[] | null;
}

/** Paracha d'un livre de la Torah : passage entier et ses montées (alyiot). */
export interface Parasha {
  readonly name: string;
  readonly heName: string;
  readonly ref: string;
  readonly aliyot: readonly string[];
}

export type Toc =
  | { readonly kind: 'sections'; readonly sectionName: string; readonly sections: readonly TocSection[]; readonly parashot: readonly Parasha[] }
  | { readonly kind: 'nodes'; readonly nodes: readonly TocNode[] };

/** Noms hébreux des parachiot (Sefaria ne les donne que par une requête par nom). */
const PARASHOT_HE: Readonly<Record<string, string>> = {
  Bereshit: 'בראשית', Noach: 'נח', 'Lech Lecha': 'לך לך', Vayera: 'וירא', 'Chayei Sara': 'חיי שרה', Toldot: 'תולדות', Vayetzei: 'ויצא', Vayishlach: 'וישלח', Vayeshev: 'וישב', Miketz: 'מקץ', Vayigash: 'ויגש', Vayechi: 'ויחי',
  Shemot: 'שמות', Vaera: 'וארא', Bo: 'בא', Beshalach: 'בשלח', Yitro: 'יתרו', Mishpatim: 'משפטים', Terumah: 'תרומה', Tetzaveh: 'תצוה', 'Ki Tisa': 'כי תשא', Vayakhel: 'ויקהל', Pekudei: 'פקודי',
  Vayikra: 'ויקרא', Tzav: 'צו', Shmini: 'שמיני', Tazria: 'תזריע', Metzora: 'מצורע', 'Achrei Mot': 'אחרי מות', Kedoshim: 'קדושים', Emor: 'אמור', Behar: 'בהר', Bechukotai: 'בחקתי',
  Bamidbar: 'במדבר', Nasso: 'נשא', "Beha'alotcha": 'בהעלתך', "Sh'lach": 'שלח', Korach: 'קרח', Chukat: 'חקת', Balak: 'בלק', Pinchas: 'פינחס', Matot: 'מטות', Masei: 'מסעי',
  Devarim: 'דברים', Vaetchanan: 'ואתחנן', Eikev: 'עקב', "Re'eh": 'ראה', Shoftim: 'שופטים', 'Ki Teitzei': 'כי תצא', 'Ki Tavo': 'כי תבוא', Nitzavim: 'נצבים', Vayeilech: 'וילך', "Ha'Azinu": 'האזינו', "V'Zot HaBerachah": 'וזאת הברכה',
};

/** Nombres de segments par section (0 : section vide) ou nombre de segments d'un nœud sans section. */
const ShapeChapters = z.union([z.number(), z.array(z.union([z.number(), z.null()]))]);
const ShapeLeaf = z.looseObject({ title: z.string(), heTitle: z.optional(z.nullable(z.string())), heBook: z.optional(z.nullable(z.string())), chapters: ShapeChapters });
const Shape = z.array(z.looseObject({ title: z.optional(z.nullable(z.string())), isComplex: z.optional(z.nullable(z.boolean())), chapters: z.union([ShapeChapters, z.array(z.unknown())]) }));
const RawParasha = z.looseObject({ sharedTitle: z.string(), wholeRef: z.string(), refs: z.array(z.string()) });
const RawIndex = z.looseObject({
  alt_structs: z.optional(z.nullable(z.looseObject({ Parasha: z.optional(z.looseObject({ nodes: z.array(z.unknown()) })) }))),
  schema: z.looseObject({ addressTypes: z.optional(z.nullable(z.array(z.string()))), sectionNames: z.optional(z.nullable(z.array(z.string()))) }),
});

/** Libellé de la section d'index `i` : daf du Talmud (0 → 1a, 3 → 2b) ou numéro. */
export const sectionLabel = (i: number, talmud: boolean): string => (talmud ? `${Math.floor(i / 2) + 1}${i % 2 === 0 ? 'a' : 'b'}` : String(i + 1));

/** Sections non vides d'un nœud de `ref`. */
function sectionsOf(ref: string, chapters: readonly (number | null)[], talmud: boolean): TocSection[] {
  return chapters.flatMap((n, i) => {
    if (n === null || n === 0) return [];
    const label = sectionLabel(i, talmud);
    return [{ label, ref: `${ref} ${label}` }];
  });
}

/** Retire le titre du livre en tête (« Pesach Haggadah, Magid » → « Magid »). */
const shortTitle = (book: string, title: string, sep = ', '): string => (title.startsWith(`${book}${sep}`) ? title.slice(book.length + sep.length) : title);

/** Table des matières à partir de la forme (`/api/shape/{titre}`) et du schéma (`/api/v2/raw/index/{titre}`). */
export function parseToc(book: string, rawShape: unknown, rawIndex: unknown): Toc {
  const shape = z.parse(Shape, rawShape)[0];
  if (shape === undefined) return { kind: 'sections', sectionName: '', sections: [], parashot: [] };
  const schema = z.safeParse(RawIndex, rawIndex);
  const addressTypes = schema.success ? (schema.data.schema.addressTypes ?? []) : [];
  const talmud = addressTypes[0] === 'Talmud';
  const sectionName = schema.success ? (schema.data.schema.sectionNames?.[0] ?? '') : '';
  const { chapters } = shape;
  if (shape.isComplex !== true) {
    const counts = z.safeParse(z.array(z.union([z.number(), z.null()])), chapters);
    const parashot = (schema.success ? (schema.data.alt_structs?.Parasha?.nodes ?? []) : []).flatMap((n) => {
      const r = z.safeParse(RawParasha, n);
      return r.success ? [{ name: r.data.sharedTitle, heName: PARASHOT_HE[r.data.sharedTitle] ?? '', ref: r.data.wholeRef, aliyot: r.data.refs }] : [];
    });
    return { kind: 'sections', sectionName, sections: counts.success ? sectionsOf(book, counts.data, talmud) : [], parashot };
  }
  const leaves = z.parse(z.array(z.unknown()), chapters).flatMap((c) => {
    const r = z.safeParse(ShapeLeaf, c);
    return r.success ? [r.data] : [];
  });
  return {
    kind: 'nodes',
    nodes: leaves.map((l) => ({
      title: shortTitle(book, l.title),
      heTitle: shortTitle(l.heBook ?? '', l.heTitle ?? ''),
      ref: l.title,
      sections: typeof l.chapters === 'number' ? null : sectionsOf(l.title, l.chapters, false),
    })),
  };
}

// ------------------------------------------------------------------ liens (/api/links/{ref})

const RawLink = z.looseObject({
  category: z.string(),
  ref: z.string(),
  sourceHeRef: z.optional(z.string()),
  commentaryNum: z.optional(z.nullable(z.number())),
  collectiveTitle: z.optional(z.looseObject({ en: z.optional(z.string()), he: z.optional(z.string()) })),
  index_title: z.optional(z.string()),
});

/** Source liée à un segment : un auteur / livre et ses références. */
export interface LinkBook {
  readonly title: string;
  readonly heTitle: string;
  readonly refs: readonly string[];
}

/** Liens d'un segment groupés par catégorie (Commentaires, Talmud…). */
export interface LinkCategory {
  readonly name: string;
  readonly label: string;
  readonly books: readonly LinkBook[];
  readonly count: number;
}

/** Catégories : nom français et ordre d'affichage (les autres ensuite, par nom). */
const CATEGORIES: readonly (readonly [string, string])[] = [
  ['Commentary', 'Commentaires'],
  ['Targum', 'Targoum'],
  ['Tanakh', 'Tanakh'],
  ['Mishnah', 'Michna'],
  ['Talmud', 'Talmud'],
  ['Midrash', 'Midrach'],
  ['Halakhah', 'Halakha'],
  ['Kabbalah', 'Kabbale'],
  ['Chasidut', 'Hassidout'],
  ['Musar', 'Moussar'],
  ['Jewish Thought', 'Pensée juive'],
  ['Liturgy', 'Liturgie'],
  ['Responsa', 'Responsa'],
  ['Second Temple', 'Second Temple'],
  ['Reference', 'Références'],
  ['Quoting Commentary', 'Commentaires citant ce verset'],
];

/** Rang d'affichage d'une catégorie (inconnue : avant les commentaires citants). */
const categoryRank = (name: string): number => {
  const i = CATEGORIES.findIndex(([n]) => n === name);
  return i < 0 ? CATEGORIES.length - 1 : i;
};

/** Liens validés et groupés ; liens invalides et doublons ignorés. */
export function parseLinks(raw: unknown): LinkCategory[] {
  const links = z.parse(z.array(z.unknown()), raw).flatMap((l) => {
    const r = z.safeParse(RawLink, l);
    return r.success ? [r.data] : [];
  });
  const categories = new Map<string, Map<string, { title: string; heTitle: string; refs: Map<string, number> }>>();
  for (const l of links) {
    const title = l.collectiveTitle?.en ?? l.index_title ?? l.ref;
    let books = categories.get(l.category);
    if (books === undefined) {
      books = new Map();
      categories.set(l.category, books);
    }
    let book = books.get(title);
    if (book === undefined) {
      book = { title, heTitle: l.collectiveTitle?.he ?? '', refs: new Map() };
      books.set(title, book);
    }
    if (!book.refs.has(l.ref)) book.refs.set(l.ref, l.commentaryNum ?? Number.MAX_SAFE_INTEGER);
  }
  return [...categories.entries()]
    .map(([name, books]) => {
      const list = [...books.values()].map((b) => ({ title: b.title, heTitle: b.heTitle, refs: [...b.refs.entries()].toSorted((a, c) => a[1] - c[1]).map(([ref]) => ref) }));
      return {
        name,
        label: CATEGORIES.find(([n]) => n === name)?.[1] ?? name,
        books: list.toSorted((a, b) => b.refs.length - a.refs.length || a.title.localeCompare(b.title)),
        count: list.reduce((n, b) => n + b.refs.length, 0),
      };
    })
    .toSorted((a, b) => categoryRank(a.name) - categoryRank(b.name) || a.name.localeCompare(b.name));
}

/** Référence d'un segment du passage (« Genesis 1:3 », « Berakhot 2a:5 », « Genesis 7:17 »). */
export function segmentRef(p: Passage, label: string): string {
  if (p.multiChapter) return `${p.book} ${label}`;
  return p.textDepth <= 1 ? `${p.sectionRef} ${label}` : `${p.sectionRef}:${label}`;
}

// ------------------------------------------------------------------ complétion (/api/name/{texte})

const NameResponse = z.looseObject({
  is_ref: z.optional(z.boolean()),
  ref: z.optional(z.nullable(z.string())),
  completion_objects: z.optional(z.array(z.unknown())),
});
const CompletionObject = z.looseObject({ title: z.string(), key: z.unknown(), type: z.string() });

/** Suggestion de référence : libellé affiché et référence à ouvrir. */
export interface Suggestion {
  readonly label: string;
  readonly ref: string;
}

/** Résultat de la complétion d'une saisie. */
export interface Completion {
  /** référence reconnue (« Gen 3 » → « Genesis 3 »), sinon null */
  readonly ref: string | null;
  readonly suggestions: readonly Suggestion[];
}

/** Suggestions de textes (pas de sujets ni de catégories), dédoublonnées par référence. */
export function parseCompletion(raw: unknown, limit = 8): Completion {
  const r = z.parse(NameResponse, raw);
  const ref = r.is_ref === true && typeof r.ref === 'string' && r.ref !== '' ? r.ref : null;
  const seen = new Set<string>(ref === null ? [] : [ref]);
  const suggestions: Suggestion[] = ref === null ? [] : [{ label: ref, ref }];
  for (const o of r.completion_objects ?? []) {
    const c = z.safeParse(CompletionObject, o);
    if (!c.success || c.data.type !== 'ref' || typeof c.data.key !== 'string' || seen.has(c.data.key)) continue;
    seen.add(c.data.key);
    suggestions.push({ label: c.data.title === c.data.key ? c.data.title : `${c.data.title} (${c.data.key})`, ref: c.data.key });
  }
  return { ref, suggestions: suggestions.slice(0, limit) };
}

// ------------------------------------------------------------------ calendriers (/api/calendars)

const Bilingual = z.looseObject({ en: z.optional(z.string()), he: z.optional(z.string()) });
const CalendarItem = z.looseObject({
  title: Bilingual,
  displayValue: Bilingual,
  ref: z.optional(z.nullable(z.string())),
  extraDetails: z.optional(z.nullable(z.looseObject({ aliyot: z.optional(z.array(z.string())) }))),
});

/** Lecture du jour : nom (français si connu), passage affiché, référence et montées éventuelles. */
export interface DailyReading {
  readonly name: string;
  readonly heName: string;
  readonly value: string;
  readonly heValue: string;
  readonly ref: string;
  readonly aliyot: readonly string[];
}

/** Noms français des lectures du calendrier de Sefaria. */
const DAILY_NAMES: Readonly<Record<string, string>> = {
  'Parashat Hashavua': 'Paracha de la semaine',
  Haftarah: 'Haftara',
  'Daf Yomi': 'Daf yomi',
  'Daily Mishnah': 'Michna du jour',
  'Daily Rambam': 'Rambam du jour',
  'Daily Rambam (3 Chapters)': 'Rambam du jour (3 chapitres)',
  'Daf a Week': 'Daf de la semaine',
  'Halakhah Yomit': 'Halakha du jour',
  'Arukh HaShulchan Yomi': 'Aroukh haChoulhan du jour',
  'Tanakh Yomi': 'Tanakh du jour',
  'Tanya Yomi': 'Tanya du jour',
  'Yerushalmi Yomi': 'Yerouchalmi du jour',
};

/** Lectures du jour ; celles sans référence (ex. Chok LeYisrael) sont ignorées. */
export function parseCalendar(raw: unknown): DailyReading[] {
  const items = z.parse(z.looseObject({ calendar_items: z.array(z.unknown()) }), raw).calendar_items;
  return items.flatMap((i) => {
    const r = z.safeParse(CalendarItem, i);
    const ref = r.success ? r.data.ref : null;
    if (!r.success || typeof ref !== 'string' || ref === '') return [];
    const d = r.data;
    const en = d.title.en ?? '';
    return [{ name: DAILY_NAMES[en] ?? en, heName: d.title.he ?? '', value: d.displayValue.en ?? ref, heValue: d.displayValue.he ?? '', ref, aliyot: d.extraDetails?.aliyot ?? [] }];
  });
}
