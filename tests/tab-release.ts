// Onglet fermé : son contenu n'est plus abonné aux états partagés de la fenêtre (`narrow`), qui
// le retiendraient (et le mettraient à jour) indéfiniment (#22).
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import { createRoot, createState } from 'gnim';
import { ReaderView } from '../src/app/ReaderPage.tsx';
import { Tabs } from '../src/app/Tabs.ts';
import { SefariaClient } from '../src/shared/client.ts';
import { SettingsStore } from '../src/shared/settings.ts';
import { Store } from '../src/shared/store.ts';

Adw.init();
const dir = GLib.dir_make_tmp('sefaria-tab-XXXXXX');
const settings = new SettingsStore(GLib.build_filenamev([dir, 'settings.json']));
const [narrow, setNarrow] = createState(false);
const [linksCollapsed] = createState(false);
const store = new Store(new SefariaClient('http://127.0.0.1:1'));
/** texte de chaque onglet (fin du volet) : masqué par le volet ouvert en fenêtre étroite */
const texts: Gtk.Widget[] = [];
const tabs = createRoot(
  () =>
    new Tabs(store, (reader, t) => {
      const w = ReaderView({ reader, tabs: t, settings, linksCollapsed, narrow });
      reader.setPage(true);
      if (w instanceof Gtk.Paned && w.endChild !== null) texts.push(w.endChild);
      return w;
    }),
);
tabs.newTab();
const closed = texts[0];
const open = texts[1];
if (closed === undefined || open === undefined) throw new Error('onglets non créés');
tabs.view.close_page(tabs.view.get_nth_page(0));
setNarrow(true);
if (open.visible) throw new Error('onglet ouvert : le volet ne suit pas la fenêtre étroite');
if (!closed.visible) throw new Error('onglet fermé : encore abonné à la fenêtre');
print('TEST OK');
