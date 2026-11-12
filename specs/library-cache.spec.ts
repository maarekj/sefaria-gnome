// Cache disque de la bibliothèque : aller-retour, autre serveur ignoré, ancienneté.
import GLib from 'gi://GLib';
import type { LibraryNode } from '../src/shared/api.ts';
import { isStale, LIBRARY_MAX_AGE_S, readLibraryCache, writeLibraryCache } from '../src/shared/librarycache.ts';

const nodes: LibraryNode[] = [{ kind: 'category', name: 'Tanakh', heName: 'תנ״ך', description: '', contents: [{ kind: 'book', title: 'Genesis', heTitle: 'בראשית', description: 'd' }] }];

describe('library-cache', () => {
  const file = GLib.build_filenamev([GLib.get_tmp_dir(), `sefaria-lib-${GLib.random_int()}`, 'library.json']);
  it('aller-retour, autre serveur : absent', async () => {
    expect(await readLibraryCache('http://a', file)).toBeNull();
    await writeLibraryCache('http://a', nodes, file);
    expect((await readLibraryCache('http://a', file))?.nodes).toEqual(nodes);
    expect(await readLibraryCache('http://b', file)).toBeNull();
  });
  it('fichier invalide : absent', async () => {
    GLib.file_set_contents(file, '{"server":"http://a","fetched":1,"nodes":[{"kind":"x"}]}');
    expect(await readLibraryCache('http://a', file)).toBeNull();
  });
  it('ancienneté', () => {
    expect(isStale(1000, 1000 + LIBRARY_MAX_AGE_S - 1)).toBe(false);
    expect(isStale(1000, 1000 + LIBRARY_MAX_AGE_S + 1)).toBe(true);
    expect(isStale(5000, 1000)).toBe(true);
  });
});
