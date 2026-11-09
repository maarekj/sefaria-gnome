// Table des matières : sections simples, dapim du Talmud, livres complexes.
import { parseToc, sectionLabel } from '../src/shared/api.ts';

const schema = (addressTypes: string[] | null, sectionNames: string[] | null): unknown => ({ schema: { addressTypes, sectionNames } });

describe('parseToc', () => {
  it('libellés : numéros et dapim', () => {
    expect([0, 1, 2, 3].map((i) => sectionLabel(i, true))).toEqual(['1a', '1b', '2a', '2b']);
    expect(sectionLabel(2, false)).toBe('3');
  });
  it('livre simple : sections non vides', () => {
    expect(parseToc('Genesis', [{ title: 'Genesis', chapters: [31, 0, 24] }], schema(['Perek', 'Pasuk'], ['Chapter', 'Verse']))).toEqual({
      kind: 'sections',
      sectionName: 'Chapter',
      sections: [
        { label: '1', ref: 'Genesis 1' },
        { label: '3', ref: 'Genesis 3' },
      ],
    });
  });
  it('Talmud : sections vides 1a / 1b ignorées', () => {
    const toc = parseToc('Berakhot', [{ title: 'Berakhot', chapters: [0, 0, 14, 19] }], schema(['Talmud', 'Integer'], ['Daf', 'Line']));
    expect(toc.kind === 'sections' ? toc.sections.map((s) => s.ref) : []).toEqual(['Berakhot 2a', 'Berakhot 2b']);
  });
  it('livre complexe : parties ouvertes directement ou découpées', () => {
    const toc = parseToc(
      'Zohar',
      [{ isComplex: true, chapters: [{ title: 'Zohar, Introduction', heTitle: 'ספר הזהר, הקדמה', heBook: 'ספר הזהר', chapters: [3, 0, 4] }, { title: 'Zohar, Idra', chapters: 5 }, { bad: 1 }] }],
      schema(null, null),
    );
    expect(toc).toEqual({
      kind: 'nodes',
      nodes: [
        { title: 'Introduction', heTitle: 'הקדמה', ref: 'Zohar, Introduction', sections: [{ label: '1', ref: 'Zohar, Introduction 1' }, { label: '3', ref: 'Zohar, Introduction 3' }] },
        { title: 'Idra', heTitle: '', ref: 'Zohar, Idra', sections: null },
      ],
    });
  });
});
