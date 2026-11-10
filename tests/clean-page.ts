// Page nettoyée : la matrice rend le papier transparent et l'encre opaque (noire ou blanche).
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gsk from 'gi://Gsk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import { asPaintable, CleanPage, INK, PAPER } from '../src/app/CleanPage.ts';

Gtk.init();
// texture 2×1 : un pixel de papier (0.8), un d'encre (0.1), en niveaux de gris RGB
const level = (v: number): number => Math.round(v * 255);
const bytes = new GLib.Bytes(new Uint8Array([level(0.8), level(0.8), level(0.8), level(0.1), level(0.1), level(0.1)]));
const texture = Gdk.MemoryTexture.new(2, 1, Gdk.MemoryFormat.R8G8B8, bytes, 6);
const page = new CleanPage();
let ok = PAPER > INK;
for (const dark of [false, true]) {
  page.update(texture, dark);
  const snapshot = new Gtk.Snapshot();
  asPaintable(page).snapshot(snapshot, 2, 1);
  const node = snapshot.to_node();
  const renderer = new Gsk.CairoRenderer();
  renderer.realize_for_display(Gdk.Display.get_default());
  const out = node === null ? null : renderer.render_texture(node, null);
  renderer.unrealize();
  if (out === null) {
    ok = false;
    break;
  }
  const downloader = Gdk.TextureDownloader.new(out);
  downloader.set_format(Gdk.MemoryFormat.R8G8B8A8);
  const [data] = downloader.download_bytes();
  const px = data.get_data() ?? new Uint8Array();
  // papier : transparent ; encre : opaque, de la couleur du thème
  const paper = px[3] ?? 255;
  const ink = [px[4] ?? -1, px[7] ?? -1];
  const expected = dark ? 255 : 0;
  if (paper > 10 || (ink[1] ?? 0) < 245 || Math.abs((ink[0] ?? -1) - expected) > 10) {
    print(`dark=${dark} : papier alpha ${paper}, encre ${ink.join(',')}`);
    ok = false;
  }
}
if (ok) print('TEST OK');
