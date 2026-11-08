// Réponses de l'API Sefaria → bibliothèque et passages.
import * as z from 'zod/mini';
import { firstSection, parseIndex, TextResponse, toPassage } from '../src/shared/api.ts';

const text = (data: unknown): TextResponse => z.parse(TextResponse, data);
const version = (language: string, t: unknown): unknown => ({ language, versionTitle: language, text: t });

describe('parseIndex', () => {
  it('catégories imbriquées et livres, nœuds inconnus ignorés', () => {
    const lib = parseIndex([{ category: 'Tanakh', heCategory: 'תנ"ך', contents: [{ category: 'Torah', contents: [{ title: 'Genesis', heTitle: 'בראשית' }, { foo: 1 }] }] }, 42]);
    expect(lib).toEqual([
      { kind: 'category', name: 'Tanakh', heName: 'תנ"ך', description: '', contents: [{ kind: 'category', name: 'Torah', heName: 'Torah', description: '', contents: [{ kind: 'book', title: 'Genesis', heTitle: 'בראשית', description: '' }] }] },
    ]);
  });
});

describe('toPassage', () => {
  it('section : segments numérotés à partir de 1', () => {
    const p = toPassage(text({ ref: 'Genesis 1', sections: ['1'], textDepth: 2, next: 'Genesis 2', versions: [version('he', ['א', 'ב']), version('en', ['a', 'b'])] }));
    expect(p.segments).toEqual([
      { label: '1', he: 'א', en: 'a' },
      { label: '2', he: 'ב', en: 'b' },
    ]);
    expect(p.next).toBe('Genesis 2');
    expect(p.prev).toBeNull();
  });
  it('plage de versets : numéros à partir du premier verset', () => {
    const p = toPassage(text({ ref: 'Genesis 1:3-4', sections: ['1', '3'], textDepth: 2, versions: [version('he', ['ג', 'ד'])] }));
    expect(p.segments.map((s) => s.label)).toEqual(['3', '4']);
  });
  it('un seul segment (chaîne) et plusieurs chapitres (tableaux imbriqués)', () => {
    expect(toPassage(text({ ref: 'Genesis 1:5', sections: ['1', '5'], textDepth: 2, versions: [version('en', 'e')] })).segments).toEqual([{ label: '5', he: '', en: 'e' }]);
    const p = toPassage(text({ ref: 'Genesis 1-2', sections: [], textDepth: 2, versions: [version('he', [['a', 'b'], ['c']])] }));
    expect(p.segments.map((s) => s.label)).toEqual(['1:1', '1:2', '2:1']);
  });
  it('segments vides retirés', () => {
    expect(toPassage(text({ ref: 'X 1', sections: ['1'], textDepth: 2, versions: [version('he', ['a', '']), version('en', ['', ''])] })).segments.length).toBe(1);
  });
});

describe('firstSection', () => {
  it('livre entier : première section disponible', () => {
    expect(firstSection(text({ ref: 'Berakhot', sections: [], firstAvailableSectionRef: 'Berakhot 2a', versions: [] }))).toBe('Berakhot 2a');
    expect(firstSection(text({ ref: 'Berakhot 2a', sections: ['2a'], firstAvailableSectionRef: 'Berakhot 2a', versions: [] }))).toBeNull();
  });
});
