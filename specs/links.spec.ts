// Liens d'un segment : regroupement et références des segments.
import * as z from 'zod/mini';
import { parseLinks, segmentRef, TextResponse, toPassage } from '../src/shared/api.ts';

const link = (category: string, en: string, ref: string, commentaryNum: number): unknown => ({ category, ref, commentaryNum, collectiveTitle: { en, he: `ה${en}` } });

describe('liens', () => {
  it('par catégorie (ordre fixe), sources triées, doublons retirés', () => {
    const cats = parseLinks([
      link('Midrash', 'Bereshit Rabbah', 'BR 1:2', 1.0002),
      link('Commentary', 'Rashi', 'Rashi 1:1:2', 1.0002),
      link('Commentary', 'Rashi', 'Rashi 1:1:1', 1.0001),
      link('Commentary', 'Rashi', 'Rashi 1:1:1', 1.0001),
      link('Commentary', 'Ramban', 'Ramban 1:1:1', 1.0001),
      { bad: true },
    ]);
    expect(cats.map((c) => [c.label, c.count])).toEqual([
      ['Commentaires', 3],
      ['Midrach', 1],
    ]);
    expect(cats[0]?.books.map((b) => [b.title, b.refs])).toEqual([
      ['Rashi', ['Rashi 1:1:1', 'Rashi 1:1:2']],
      ['Ramban', ['Ramban 1:1:1']],
    ]);
  });
  it('référence d’un segment', () => {
    const v = [{ language: 'he', versionTitle: 'H', text: ['א'] }];
    const p = (data: object): ReturnType<typeof toPassage> => toPassage(z.parse(TextResponse, { versions: v, ...data }));
    expect(segmentRef(p({ ref: 'Genesis 1', sectionRef: 'Genesis 1', textDepth: 2, sections: ['1'] }), '3')).toBe('Genesis 1:3');
    expect(segmentRef(p({ ref: 'Berakhot 2a', sectionRef: 'Berakhot 2a', textDepth: 2, sections: ['2a'] }), '5')).toBe('Berakhot 2a:5');
    expect(segmentRef(p({ ref: 'Pesach Haggadah, Kadesh', sectionRef: 'Pesach Haggadah, Kadesh', textDepth: 1, sections: [] }), '2')).toBe('Pesach Haggadah, Kadesh 2');
  });
});
