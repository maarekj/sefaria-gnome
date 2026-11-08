// Réglages : lecture tolérante et aller-retour sur disque.
import GLib from 'gi://GLib';
import { readSettings, writeSettings } from '../src/shared/settings.ts';

describe('settings', () => {
  const file = GLib.build_filenamev([GLib.get_tmp_dir(), `sefaria-settings-${GLib.random_int()}`, 'settings.json']);
  it('valeurs par défaut si absent ou invalide', () => {
    expect(readSettings(file)).toEqual({ twoColumns: false, textScale: 1 });
    GLib.mkdir_with_parents(GLib.path_get_dirname(file), 0o755);
    GLib.file_set_contents(file, '{"twoColumns": "oui"}');
    expect(readSettings(file)).toEqual({ twoColumns: false, textScale: 1 });
  });
  it('aller-retour', () => {
    writeSettings({ twoColumns: true, textScale: 1.25 }, file);
    expect(readSettings(file)).toEqual({ twoColumns: true, textScale: 1.25 });
  });
});
