// Cache des traductions par IA : une entrée par passage, segment, langue et outil.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as z from 'zod/mini';
import { TextResponse, toPassage } from '../src/shared/api.ts';
import { cachedTranslation, translate } from '../src/shared/translate.ts';

const dir = GLib.dir_make_tmp('sefaria-cache-XXXXXX');
GLib.setenv('XDG_CACHE_HOME', dir, true);
// faux outil : script shell qui répond un JSON fixe
const tool = GLib.build_filenamev([dir, 'fake-ai']);
GLib.file_set_contents(tool, '#!/bin/sh\ncat > /dev/null\necho \'{"1": "un", "2": "deux"}\'\n');
GLib.chmod(tool, 0o755);
GLib.setenv('SEFARIA_GNOME_AI_COMMAND', tool, true);
const p = toPassage(z.parse(TextResponse, { ref: 'X 1', sections: ['1'], textDepth: 2, versions: [{ language: 'he', versionTitle: 'H', text: ['א', 'ב'] }] }));
const fr = { tool: 'claude', model: '', language: 'french' } as const;
const loop = new GLib.MainLoop(null, false);
let ok = false;
void (async () => {
  try {
    await translate(p, fr, new Gio.Cancellable());
    const section = cachedTranslation(p, fr);
    const verse = cachedTranslation(p, fr, '2');
    const english = cachedTranslation(p, { ...fr, language: 'english' });
    ok = section?.['1'] === 'un' && verse === null && english === null;
    if (!ok) print(`cache inattendu : ${JSON.stringify({ section, verse, english })}`);
  } catch (error) {
    print(`erreur : ${String(error)}`);
  }
  loop.quit();
})();
loop.run();
if (ok) print('TEST OK');
