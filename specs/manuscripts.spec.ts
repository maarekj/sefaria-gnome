// Pages imprimées du Talmud.
import { isAmud, parseManuscripts, siblingAmud } from '../src/shared/api.ts';

const page = (slug: string, title: string, id: string, url: string): unknown => ({ page_id: id, image_url: url, manuscript: { slug, title, he_title: 'ה' } });

describe('pages imprimées', () => {
  it('éditions groupées, Vilna en tête, noms français, pages dédoublonnées', () => {
    const e = parseManuscripts([
      page('bomberg-(venice)-pressing-(1523-ce)', 'Bomberg', 'Berakhot 2a', 'b1'),
      page('bomberg-(venice)-pressing-(1523-ce)', 'Bomberg', 'Berakhot 2b', 'b2'),
      page('bomberg-(venice)-pressing-(1523-ce)', 'Bomberg', 'Berakhot 2b', 'b2'),
      page('romm-vilna-pressing-(1880-86-ce)', 'Romm', 'Berakhot 2a', 'v'),
      page('autre', 'Autre manuscrit', 'p1', 'a'),
      { bad: 1 },
    ]);
    expect(e.map((x) => [x.title, x.pages.map((p) => p.url)])).toEqual([
      ['Vilna (nettoyée)', ['v']],
      ['Vilna (Romm, 1880-86)', ['v']],
      ['Venise (Bomberg, 1523)', ['b1', 'b2']],
      ['Autre manuscrit', ['a']],
    ]);
  });
  it('Vilna nettoyée : même image, traitée à l’affichage', () => {
    const [clean, photo] = parseManuscripts([page('romm-vilna-pressing-(1880-86-ce)', 'Romm', 'Berakhot 2a', 'v')]);
    expect(clean?.clean).toBeTrue();
    expect(photo?.clean).toBeUndefined();
    expect(parseManuscripts([page('bomberg-x', 'Bomberg', 'Berakhot 2a', 'b')]).map((x) => x.slug)).toEqual(['bomberg-x']);
  });
  it('amud : reconnaissance et voisins', () => {
    expect(isAmud('Berakhot 2a')).toBeTrue();
    expect(isAmud('Genesis 2')).toBeFalse();
    expect(siblingAmud('Berakhot 2a', 1)).toBe('Berakhot 2b');
    expect(siblingAmud('Berakhot 2b', 1)).toBe('Berakhot 3a');
    expect(siblingAmud('Berakhot 3a', -1)).toBe('Berakhot 2b');
    expect(siblingAmud('Berakhot 2a', -1)).toBeNull();
    expect(siblingAmud('Bava Kamma 10b', 1)).toBe('Bava Kamma 11a');
  });
});
