// Réglages : lecture tolérante et aller-retour sur disque.
import GLib from 'gi://GLib';
import { readSettings, writeSettings } from '../src/shared/settings.ts';

describe('settings', () => {
  const file = GLib.build_filenamev([GLib.get_tmp_dir(), `sefaria-settings-${GLib.random_int()}`, 'settings.json']);
  it('valeurs par défaut si absent ou invalide', () => {
    expect(readSettings(file)).toEqual({ twoColumns: false, textScale: 1, display: 'both', language: 'english', diaspora: true, sidebar: true, aiTool: 'none', aiModel: '', aiLanguage: 'french', books: {} });
    GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
    GLib.file_set_contents(file, '{"twoColumns": "oui"}');
    expect(readSettings(file)).toEqual({ twoColumns: false, textScale: 1, display: 'both', language: 'english', diaspora: true, sidebar: true, aiTool: 'none', aiModel: '', aiLanguage: 'french', books: {} });
  });
  it('réglage invalide : seul lui revient à sa valeur par défaut', () => {
    GLib.file_set_contents(file, JSON.stringify({ twoColumns: true, textScale: 0, display: 'x', diaspora: false, books: { Genesis: { hebrew: 'H' }, Exodus: { hebrew: 3 } } }));
    expect(readSettings(file)).toEqual({ twoColumns: true, textScale: 1, display: 'both', language: 'english', diaspora: false, sidebar: true, aiTool: 'none', aiModel: '', aiLanguage: 'french', books: { Genesis: { hebrew: 'H' } } });
    expect(GLib.file_test(`${file}.bak`, GLib.FileTest.EXISTS)).toBe(true);
  });
  it('aller-retour', () => {
    writeSettings({ twoColumns: true, textScale: 1.25, display: 'hebrew', language: 'french', diaspora: false, sidebar: false, aiTool: 'opencode', aiModel: 'm', aiLanguage: 'english', books: { Genesis: { hebrew: 'H' } } }, file);
    expect(readSettings(file)).toEqual({ twoColumns: true, textScale: 1.25, display: 'hebrew', language: 'french', diaspora: false, sidebar: false, aiTool: 'opencode', aiModel: 'm', aiLanguage: 'english', books: { Genesis: { hebrew: 'H' } } });
  });
});
