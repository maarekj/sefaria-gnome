// Titres de chapitre et numéraux hébreux.
import { chapterTitle, hebrewNumeral, passageItems } from '../src/shared/chapters.ts';

const seg = (label: string): { label: string; he: string; en: string } => ({ label, he: 'א', en: 'a' });

describe('chapitres', () => {
  it('numéraux hébreux', () => {
    expect([1, 3, 10, 15, 16, 22, 50, 119, 150, 272].map((n) => hebrewNumeral(n))).toEqual(['א׳', 'ג׳', 'י׳', 'ט״ו', 'ט״ז', 'כ״ב', 'נ׳', 'קי״ט', 'ק״נ', 'ער״ב']);
    expect(chapterTitle('').he).toBe('');
  });
  it('titre à chaque chapitre, numéro court', () => {
    expect(passageItems([seg('2:24'), seg('2:25'), seg('3:1')], true).map((i) => (i.kind === 'chapter' ? `#${i.chapter}` : i.number))).toEqual(['#2', '24', '25', '#3', '1']);
    expect(chapterTitle('3')).toEqual({ fr: 'Chapitre 3', he: 'פרק ג׳' });
  });
  it('commentaire (verset:commentaire) : pas de titre', () => {
    expect(passageItems([seg('1:1'), seg('2:1')], false).some((i) => i.kind === 'chapter')).toBeFalse();
  });
  it('un seul chapitre : inchangé', () => {
    expect(passageItems([seg('1'), seg('2')], false).map((i) => (i.kind === 'segment' ? i.number : '#'))).toEqual(['1', '2']);
    expect(passageItems([seg('7:1'), seg('7:2')], true).map((i) => (i.kind === 'segment' ? i.number : '#'))).toEqual(['7:1', '7:2']);
  });
});
