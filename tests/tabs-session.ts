// Onglets : session (ordre, onglet affiché), restauration différée, dernier onglet fermé remplacé.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { createRoot } from 'gnim';
import { Tabs } from '../src/app/Tabs.ts';
import { SefariaClient } from '../src/shared/client.ts';
import { Store } from '../src/shared/store.ts';

Adw.init();
const fail = (m: string): never => {
  throw new Error(m);
};
const tabs = createRoot(() => new Tabs(new Store(new SefariaClient('http://127.0.0.1:1')), () => new Gtk.Label()));
tabs.restore(['Genesis 1', 'Exodus 2', 'Berakhot 2a'], 1);
const s = tabs.session();
if (JSON.stringify(s) !== JSON.stringify({ tabs: ['Genesis 1', 'Exodus 2', 'Berakhot 2a'], current: 1 })) fail(`session ${JSON.stringify(s)}`);
// seul l'onglet affiché est chargé
const titles = Array.from({ length: tabs.view.nPages }, (_, i) => tabs.view.get_nth_page(i).title);
if (titles[0] !== 'Genesis 1' || titles[2] !== 'Berakhot 2a') fail(`titres ${titles.join(', ')}`);
if (tabs.current.peek().deferred) fail('onglet affiché non chargé');
if (!titles.includes('Chargement…')) fail('onglet affiché : pas en chargement');
// tous fermés : un onglet vide les remplace
for (let i = 0; i < 3; i += 1) tabs.closeCurrent();
if (tabs.view.nPages !== 1 || tabs.session().tabs.length > 0) fail(`après fermeture : ${tabs.view.nPages} onglets`);
print('TEST OK');
