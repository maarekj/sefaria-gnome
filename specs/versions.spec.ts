// Versions : paramètres de requête, choix de la traduction, livre d'une référence.
import * as z from 'zod/mini';
import { bookOf, parseVersions, TextResponse, toPassage, versionParams } from '../src/shared/api.ts';

const v = (languageFamilyName: string, versionTitle: string, text: unknown): unknown => ({ language: languageFamilyName === 'hebrew' ? 'he' : 'en', languageFamilyName, versionTitle, text });

describe('versions', () => {
  it('paramètres : hébreu, traduction voulue, anglais en repli', () => {
    expect(versionParams({ translation: { language: 'english' } })).toBe('version=hebrew&version=english');
    expect(versionParams({ hebrew: 'Tanach', translation: { language: 'french', title: 'Bible | X' } })).toBe(
      'version=hebrew%7CTanach&version=hebrew&version=french%7CBible%20%7C%20X&version=french&version=english',
    );
    expect(versionParams({ translation: { language: 'french' }, fallback: { language: 'english', title: 'E' } })).toBe('version=hebrew&version=french&version=english%7CE&version=english');
  });
  it('traduction dans la langue voulue, sinon repli', () => {
    const r = z.parse(TextResponse, { ref: 'Genesis 1', indexTitle: 'Genesis', sections: ['1'], textDepth: 2, versions: [v('hebrew', 'H', ['א']), v('english', 'E', ['a']), v('french', 'F', ['b'])] });
    expect(toPassage(r, { translation: { language: 'french' } })).toEqual(jasmine.objectContaining({ book: 'Genesis', language: 'french', enVersion: 'F', heVersion: 'H' }));
    expect(toPassage(r, { translation: { language: 'german' } })).toEqual(jasmine.objectContaining({ language: 'english', enVersion: 'E' }));
  });
  it('titre voulu de préférence, version par défaut si le titre a disparu', () => {
    const r = z.parse(TextResponse, { ref: 'Genesis 1', sections: ['1'], textDepth: 2, versions: [v('hebrew', 'H1', ['א']), v('hebrew', 'H2', ['א']), v('french', 'F1', ['b']), v('french', 'F2', ['b'])] });
    expect(toPassage(r, { hebrew: 'H2', translation: { language: 'french', title: 'F2' } })).toEqual(jasmine.objectContaining({ heVersion: 'H2', enVersion: 'F2' }));
    expect(toPassage(r, { hebrew: 'Retirée', translation: { language: 'french', title: 'Retirée' } })).toEqual(jasmine.objectContaining({ heVersion: 'H1', enVersion: 'F1' }));
  });
  it('liste des versions : famille de langue, yiddish distinct de l’hébreu', () => {
    expect(parseVersions([{ versionTitle: 'Y', language: 'he', languageFamilyName: 'yiddish' }, { versionTitle: 'H', language: 'he' }])).toEqual([
      { title: 'Y', language: 'yiddish' },
      { title: 'H', language: 'hebrew' },
    ]);
  });
  it('livre d’une référence', () => {
    const books = { Genesis: {}, 'Mishneh Torah, Repentance': {}, Gen: {} };
    expect(bookOf('Genesis 3:4', books)).toBe('Genesis');
    expect(bookOf('Mishneh Torah, Repentance 2', books)).toBe('Mishneh Torah, Repentance');
    expect(bookOf('Exodus 1', books)).toBeUndefined();
  });
});
