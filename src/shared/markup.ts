// HTML des textes Sefaria → balisage Pango (Gtk.Label `useMarkup`).
// Balises de mise en forme conservées, notes de bas de page retirées, le reste réduit au texte.

const KEPT = new Set(['b', 'i', 'u', 's', 'big', 'small', 'sup', 'sub']);
const ALIASES: Readonly<Record<string, string>> = { strong: 'b', em: 'i' };
/** classes dont l'élément entier (contenu compris) est retiré */
const SKIPPED_CLASSES = /\b(?:footnote|footnote-marker)\b/u;
const VOID = new Set(['br', 'img', 'hr', 'wbr']);

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', thinsp: '\u2009', ensp: '\u2002', emsp: '\u2003', mdash: '—', ndash: '–' };

/** Décode les entités HTML. */
export function decodeEntities(s: string): string {
  return s.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (all, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

export const escapeMarkup = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Balisage Pango équivalent au HTML `html` (toujours bien formé). */
export function sefariaMarkup(html: string): string {
  const tag = /<(\/?)([a-z][a-z0-9]*)([^>]*)>/giu;
  let out = '';
  /** balises ouvertes : nom Pango (null si ignorée) */
  const stack: (string | null)[] = [];
  /** profondeur (dans `stack`) de l'élément retiré en cours, ou -1 */
  let skipAt = -1;
  let last = 0;
  const text = (s: string): void => {
    if (skipAt < 0) out += escapeMarkup(decodeEntities(s));
  };
  for (const m of html.matchAll(tag)) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const raw = (m[2] ?? '').toLowerCase();
    const name = ALIASES[raw] ?? raw;
    const attrs = m[3] ?? '';
    if (VOID.has(name)) {
      if (name === 'br' && skipAt < 0) out += '\n';
      continue;
    }
    if (!closing) {
      if (attrs.trimEnd().endsWith('/')) continue;
      const kept = KEPT.has(name) ? name : null;
      if (skipAt < 0 && SKIPPED_CLASSES.test(attrs)) skipAt = stack.length;
      else if (skipAt < 0 && kept !== null) out += `<${kept}>`;
      stack.push(kept);
      continue;
    }
    // fermeture : la dernière balise ouverte (HTML de Sefaria supposé bien imbriqué)
    if (stack.length === 0) continue;
    const open = stack.pop() ?? null;
    if (skipAt === stack.length) skipAt = -1;
    else if (skipAt < 0 && open !== null) out += `</${open}>`;
  }
  text(html.slice(last));
  // balises restées ouvertes : refermées
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const open = stack[i] ?? null;
    if (open !== null && (skipAt < 0 || i < skipAt)) out += `</${open}>`;
  }
  return out.trim();
}

/**
 * Marque de direction en tête : Pango déduit la direction d'un paragraphe de sa première lettre
 * forte, or une traduction commence parfois par un mot hébreu (« בראשית IN THE BEGINNING »).
 */
export const withDirection = (markup: string, hebrew: boolean): string => `${hebrew ? '\u200F' : '\u200E'}${markup}`;

/** Texte brut d'un HTML de Sefaria (notes retirées), pour l'envoyer à un traducteur. */
export function plainText(html: string): string {
  return sefariaMarkup(html)
    .replaceAll(/<[^>]+>/gu, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/**
 * HTML de Sefaria réduit au gras et à l'italique (notes retirées), pour l'envoyer à un traducteur
 * qui doit garder la distinction traduction littérale (gras) / explication.
 */
export function richText(html: string): string {
  return sefariaMarkup(html)
    .replaceAll(/<(?!\/?[bi]>)[^>]+>/gu, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/** Traduction mêlant littéral en gras et explication (Steinsaltz, William Davidson…). */
export const hasBold = (html: string): boolean => /<(?:b|strong)\b/iu.test(html);
