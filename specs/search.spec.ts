// Recherche plein texte : requête et résultats.
import { parseSearch, searchBody, sectionOf } from '../src/shared/api.ts';

const hit = (ref: string, lang: string, text: string): unknown => ({ _source: { ref, heRef: `ה${ref}`, lang, categories: ['Tanakh', 'Torah'] }, highlight: { exact: [text] } });

describe('recherche', () => {
  it('requête : mode, filtre de catégorie, page', () => {
    expect(searchBody({ text: 'x', mode: 'exact', category: 'Tanakh', from: 20, size: 20 })).toEqual(
      jasmine.objectContaining({ query: 'x', field: 'exact', from: 20, size: 20, filters: ['Tanakh'], filter_fields: ['path'] }),
    );
    expect(searchBody({ text: 'x', mode: 'forms', category: '', from: 0, size: 20 })).toEqual(jasmine.objectContaining({ field: 'naive_lemmatizer', filters: [], filter_fields: [] }));
  });
  it('résultats dédoublonnés (versions), déjà vus ignorés, catégories cumulées', () => {
    const r = parseSearch(
      {
        hits: { total: 3, hits: [hit('Exodus 3:2', 'en', 'the <b>bush</b>'), hit('Exodus 3:2', 'he', 'ב'), hit('Joshua 5:15', 'en', 'j'), hit('Exodus 3:12', 'en', 'k'), { bad: 1 }] },
        aggregations: { path: { buckets: [{ key: 'Tanakh/Torah/Exodus', doc_count: 2 }, { key: 'Tanakh/Prophets/Joshua', doc_count: 1 }, { key: 'Talmud/Bavli', doc_count: 4 }] } },
      },
      new Set(['Exodus 3:12']),
    );
    expect(r.hits.map((h) => h.ref)).toEqual(['Exodus 3:2', 'Joshua 5:15']);
    expect(r.hits[0]).toEqual({ ref: 'Exodus 3:2', heRef: 'הExodus 3:2', category: 'Tanakh › Torah', snippets: ['the <b>bush</b>'], hebrew: false });
    expect(r.categories).toEqual([
      { name: 'Talmud', count: 4 },
      { name: 'Tanakh', count: 3 },
    ]);
    expect(r.total).toBe(3);
  });
  it('section d’un résultat', () => {
    expect(sectionOf('Exodus 3:2')).toBe('Exodus 3');
    expect(sectionOf('Berakhot 7a:31')).toBe('Berakhot 7a');
    expect(sectionOf('Pesach Haggadah, Kadesh')).toBe('Pesach Haggadah, Kadesh');
  });
});
