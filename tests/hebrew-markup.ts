// Le balisage produit pour de vrais passages (e2e/fixtures/texts.json) est accepté par Pango :
// aucun libellé vide ni avertissement GTK.
import Gtk from 'gi://Gtk?version=4.0';
import * as z from 'zod/mini';
import { TextResponse, toPassage } from '../src/shared/api.ts';
import { sefariaMarkup } from '../src/shared/markup.ts';
import texts from '../e2e/fixtures/texts.json' with { type: 'json' };

Gtk.init();
let ok = true;
for (const raw of Object.values(texts)) {
  const p = toPassage(z.parse(TextResponse, raw));
  if (p.segments.length === 0) ok = false;
  for (const s of p.segments) {
    for (const html of [s.he, s.en]) {
      if (html === '') continue;
      const label = new Gtk.Label({ useMarkup: true, label: sefariaMarkup(html) });
      if (label.get_text() === '') {
        print(`balisage rejeté : ${p.ref} ${s.label}`);
        ok = false;
      }
    }
  }
}
if (ok) print('TEST OK');
