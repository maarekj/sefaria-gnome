// Complétion des références.
import { parseCompletion } from '../src/shared/api.ts';

describe('parseCompletion', () => {
  it('référence reconnue en tête, textes seulement, dédoublonnés', () => {
    const c = parseCompletion({
      is_ref: true,
      ref: 'Genesis 3',
      completion_objects: [
        { title: 'Genesis', key: 'Genesis', type: 'ref' },
        { title: 'Genesis', key: 'genesis', type: 'Topic' },
        { title: 'Gen. R.', key: 'Bereshit Rabbah', type: 'ref' },
        { title: 'Halakhah', key: ['Midrash'], type: 'TocCategory' },
        { title: 'Genesis bis', key: 'Genesis', type: 'ref' },
      ],
    });
    expect(c.ref).toBe('Genesis 3');
    expect(c.suggestions).toEqual([
      { label: 'Genesis 3', ref: 'Genesis 3' },
      { label: 'Genesis', ref: 'Genesis' },
      { label: 'Gen. R. (Bereshit Rabbah)', ref: 'Bereshit Rabbah' },
    ]);
  });
  it('rien de reconnu', () => {
    expect(parseCompletion({ is_ref: false, ref: null, completion_objects: [] })).toEqual({ ref: null, suggestions: [] });
  });
});
