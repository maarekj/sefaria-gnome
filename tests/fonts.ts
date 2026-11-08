// Les polices livrées (data/fonts/) se chargent et la police hébraïque est bien celle utilisée.
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo?version=1.0';
import { HEBREW_FONT, loadFonts } from '../src/app/fonts.ts';

Gtk.init();
const missing = loadFonts();
if (missing.length > 0) print(`non chargées : ${missing.join(', ')}`);
const families = PangoCairo.FontMap.get_default()
  .list_families()
  .map((f) => f.get_name());
const listed = families.includes(HEBREW_FONT);
if (!listed) print(`${HEBREW_FONT} absente des familles`);
// la police choisie pour un libellé hébreu est bien la nôtre (pas un repli)
const context = new Gtk.Label().get_pango_context();
const used = context.load_font(Pango.FontDescription.from_string(`${HEBREW_FONT} 20`))?.describe().get_family() ?? '';
if (used !== HEBREW_FONT) print(`police utilisée : ${used}`);
if (missing.length === 0 && listed && used === HEBREW_FONT) print('TEST OK');
