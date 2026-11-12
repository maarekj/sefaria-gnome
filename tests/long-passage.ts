// Long passage (176 versets, comme Psaumes 119) : construit par lots, la boucle principale n'est
// jamais bloquée longtemps ; un nouveau remplissage annule le précédent (#25).
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import { FILL_FIRST, fill } from '../src/app/ReaderPage.tsx';
import type { Passage, Segment } from '../src/shared/api.ts';

Adw.init();
const noop = (): void => {
  // aucune sélection
};
const he = 'אַשְׁרֵי תְמִימֵי דָרֶךְ <b>הַהֹלְכִים</b> בְּתוֹרַת יְהֹוָה׃ '.repeat(3);
const en = 'Happy are those whose way is <i>blameless</i>, who follow the teaching of the LORD. '.repeat(2);
const segments: Segment[] = Array.from({ length: 176 }, (_, i) => ({ label: String(i + 1), he, en }));
const passage = (ref: string): Passage => ({ ref, book: 'Psalms', language: 'english', heRef: '', next: null, prev: null, heVersion: 'h', enVersion: 'e', segments, multiChapter: false, sectionRef: ref, textDepth: 2 });
const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
const win = new Gtk.Window({ child: new Gtk.ScrolledWindow({ child: box }), defaultWidth: 900, defaultHeight: 700 });
win.present();
const count = (): number => {
  let n = 0;
  for (let w = box.get_first_child(); w !== null; w = w.get_next_sibling()) n += 1;
  return n;
};

const loop = GLib.MainLoop.new(null, false);
let error: string | null = null;
let last = GLib.get_monotonic_time();
let gap = 0;
GLib.timeout_add(GLib.PRIORITY_HIGH, 2, () => {
  const n = GLib.get_monotonic_time();
  gap = Math.max(gap, n - last);
  last = n;
  return GLib.SOURCE_CONTINUE;
});
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
  // premier remplissage interrompu par un second : un seul passage complet à la fin
  fill(box, passage('Psalms 118'), { display: 'both', columns: false }, noop, null);
  const widgets = fill(box, passage('Psalms 119'), { display: 'both', columns: false }, noop, null, () => {
    if (!(box.get_last_child() instanceof Gtk.Label)) return;
    if (count() !== 177) error = `${count()} enfants au lieu de 177`;
    else if (!widgets.has('Psalms 119:176')) error = 'dernier verset absent';
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      loop.quit();
      return GLib.SOURCE_REMOVE;
    });
  });
  if (count() !== FILL_FIRST) error = `premier lot : ${count()} enfants`;
  last = GLib.get_monotonic_time();
  gap = 0;
  return GLib.SOURCE_REMOVE;
});
loop.run();
win.destroy();
if (error !== null) throw new Error(error);
print(`plus long blocage : ${Math.round(gap / 1000)} ms`);
print('TEST OK');
