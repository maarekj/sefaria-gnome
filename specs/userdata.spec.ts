// Données de lecture : historique, signets, lecture tolérante.
import GLib from 'gi://GLib';
import { HISTORY_MAX, pushHistory, readReading, toggleBookmark } from '../src/shared/userdata.ts';

const place = (ref: string): { ref: string; heRef: string } => ({ ref, heRef: `ה${ref}` });

describe('userdata', () => {
  it('historique : en tête, dédoublonné, borné', () => {
    expect(pushHistory([place('A'), place('B')], place('B')).map((p) => p.ref)).toEqual(['B', 'A']);
    const long = Array.from({ length: HISTORY_MAX }, (_, i) => place(String(i)));
    expect(pushHistory(long, place('X')).length).toBe(HISTORY_MAX);
  });
  it('signet ajouté puis retiré', () => {
    const one = toggleBookmark([], place('A'));
    expect(one.map((p) => p.ref)).toEqual(['A']);
    expect(toggleBookmark(one, place('A'))).toEqual([]);
  });
  it('fichier absent ou invalide, index d’onglet borné', () => {
    const file = GLib.build_filenamev([GLib.get_tmp_dir(), `sefaria-reading-${GLib.random_int()}`, 'reading.json']);
    expect(readReading(file)).toEqual({ tabs: [], current: 0, history: [], bookmarks: [] });
    GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
    GLib.file_set_contents(file, JSON.stringify({ tabs: ['Genesis 1', ''], current: 9 }));
    expect(readReading(file)).toEqual({ tabs: ['Genesis 1'], current: 0, history: [], bookmarks: [] });
  });
});
