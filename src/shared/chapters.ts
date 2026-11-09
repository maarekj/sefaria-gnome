// Titres de chapitre des passages sur plusieurs chapitres et numéraux hébreux (sans GJS ni Node).
import type { Segment } from './api.ts';

/** Nombre en lettres hébraïques (guématria, 1 à 999) : 3 → ג׳, 15 → ט״ו, 16 → ט״ז. */
export function hebrewNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const rest = n % 100;
  // 15 et 16 : ט״ו, ט״ז (pas י״ה, י״ו)
  const low = rest === 15 ? 'טו' : rest === 16 ? 'טז' : `${tens[Math.floor(rest / 10)] ?? ''}${units[rest % 10] ?? ''}`;
  // usage : ע״ר plutôt que ר״ע (270, 272, 274…)
  const letters = `${hundreds[Math.floor(n / 100)] ?? ''}${low}`.replace(/^רע/u, 'ער');
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

/** Élément affiché d'un passage : titre de chapitre ou segment (numéro court). */
export type PassageItem = { readonly kind: 'chapter'; readonly chapter: string } | { readonly kind: 'segment'; readonly segment: Segment; readonly number: string };

/** Chapitre d'un numéro « 3:1 » (null : pas de chapitre). */
const chapterOf = (label: string): string | null => {
  const i = label.lastIndexOf(':');
  return i < 0 ? null : label.slice(0, i);
};

/**
 * Segments d'un passage, précédés d'un titre à chaque chapitre quand le passage en couvre plusieurs
 * (numéros « 3:1 ») ; les segments n'affichent alors que leur dernier numéro.
 */
export function passageItems(segments: readonly Segment[], multiChapter: boolean): PassageItem[] {
  const chapters = new Set(segments.map((s) => chapterOf(s.label)));
  if (!multiChapter || chapters.size < 2 || chapters.has(null)) return segments.map((segment) => ({ kind: 'segment', segment, number: segment.label }));
  const out: PassageItem[] = [];
  let current: string | null = null;
  for (const segment of segments) {
    const chapter = chapterOf(segment.label) ?? '';
    if (chapter !== current) {
      out.push({ kind: 'chapter', chapter });
      current = chapter;
    }
    out.push({ kind: 'segment', segment, number: segment.label.slice(chapter.length + 1) });
  }
  return out;
}

/** Titre d'un chapitre : « Chapitre 3 · פרק ג׳ » (chapitres imbriqués « 2:5 » : numéros tels quels). */
export function chapterTitle(chapter: string): { readonly fr: string; readonly he: string } {
  const n = Number(chapter);
  return { fr: `Chapitre ${chapter}`, he: chapter !== '' && Number.isInteger(n) && n >= 1 ? `פרק ${hebrewNumeral(n)}` : '' };
}
