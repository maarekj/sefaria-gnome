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
      parashot: [],
      sections: [
        { label: '1', ref: 'Genesis 1' },
        { label: '3', ref: 'Genesis 3' },
      ],
    });
  });
  it('Torah : parachiot et montées', () => {
    const index = { schema: { addressTypes: ['Perek', 'Pasuk'], sectionNames: ['Chapter', 'Verse'] }, alt_structs: { Parasha: { nodes: [{ sharedTitle: 'Noach', wholeRef: 'Genesis 6:9-11:32', refs: ['Genesis 6:9-6:22'] }, { bad: 1 }] } } };
    const toc = parseToc('Genesis', [{ title: 'Genesis', chapters: [1] }], index);
    expect(toc.kind === 'sections' ? toc.parashot : []).toEqual([{ name: 'Noach', heName: 'נח', ref: 'Genesis 6:9-11:32', aliyot: ['Genesis 6:9-6:22'] }]);
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
