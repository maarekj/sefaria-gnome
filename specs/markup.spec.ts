// HTML de Sefaria → balisage Pango.
import { decodeEntities, sefariaMarkup } from '../src/shared/markup.ts';

describe('sefariaMarkup', () => {
  it('conserve la mise en forme et échappe le texte', () => {
    expect(sefariaMarkup('<big>בְּ</big>רֵאשִׁ֖ית <b>a</b> & <strong>c</strong>')).toBe('<big>בְּ</big>רֵאשִׁ֖ית <b>a</b> &amp; <b>c</b>');
  });
  it('retire les notes de bas de page, même imbriquées', () => {
    expect(sefariaMarkup('create<sup class="footnote-marker">a</sup><i class="footnote"><b>When </b>In <i>contrast</i>.</i> heaven')).toBe('create heaven');
  });
  it('réduit les balises inconnues à leur texte, <br> en saut de ligne', () => {
    expect(sefariaMarkup('<span class="x">un</span><br>deux<br/>trois <a href="/x">lien</a>')).toBe('un\ndeux\ntrois lien');
  });
  it('referme les balises restées ouvertes, ignore les fermetures orphelines', () => {
    expect(sefariaMarkup('<b>gras')).toBe('<b>gras</b>');
    expect(sefariaMarkup('texte</i>')).toBe('texte');
  });
  it('entités', () => {
    expect(decodeEntities('&lt;&#1488;&#x5D1;&nbsp;&inconnu;')).toBe('<אב\u00A0&inconnu;');
    expect(sefariaMarkup('a&nbsp;&lt;b&gt;')).toBe('a\u00A0&lt;b&gt;');
  });
});
