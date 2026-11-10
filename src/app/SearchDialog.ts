// Recherche plein texte (Ctrl+F) : mot ou expression, en hébreu ou en traduction ; formes du mot ou
// expression exacte, filtre par catégorie, résultats par pages ; un résultat s'ouvre dans un nouvel onglet.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import type { SearchHit, SearchMode, SearchQuery } from '../shared/api.ts';
import { sectionOf } from '../shared/api.ts';
import { errorMessage } from '../shared/errors.ts';
import { sefariaMarkup, withDirection } from '../shared/markup.ts';
import type { Tabs } from './Tabs.ts';

/** Résultats par page. */
const PAGE = 20;

function hitRow(hit: SearchHit): Gtk.ListBoxRow {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, marginTop: 8, marginBottom: 8, marginStart: 10, marginEnd: 10 });
  const head = new Gtk.Box({ spacing: 8 });
  head.append(new Gtk.Label({ label: hit.ref, xalign: 0, hexpand: true, wrap: true, cssClasses: ['heading'] }));
  if (hit.heRef !== '') head.append(new Gtk.Label({ label: hit.heRef, xalign: 1, cssClasses: ['dim-label'] }));
  box.append(head);
  if (hit.category !== '') box.append(new Gtk.Label({ label: hit.category, xalign: 0, wrap: true, cssClasses: ['caption', 'dim-label'] }));
  for (const s of hit.snippets) {
    box.append(
      new Gtk.Label({
        useMarkup: true,
        label: withDirection(sefariaMarkup(s), hit.hebrew),
        wrap: true,
        wrapMode: Pango.WrapMode.WORD_CHAR,
        xalign: hit.hebrew ? 1 : 0,
        justify: Gtk.Justification.LEFT,
        cssClasses: [hit.hebrew ? 'search-hebrew' : 'search-text'],
      }),
    );
  }
  return new Gtk.ListBoxRow({ child: box, activatable: true });
}

export function openSearch(parent: Gtk.Widget, tabs: Tabs): void {
  const dialog = new Adw.Dialog({ title: 'Rechercher', contentWidth: 640, contentHeight: 720 });
  const entry = new Gtk.SearchEntry({ placeholderText: 'Mot ou expression, en hébreu ou en traduction', hexpand: true });
  const header = new Adw.HeaderBar({ titleWidget: entry });
  // options : formes du mot / expression exacte, catégorie
  const modes = new Gtk.Box({ cssClasses: ['linked'] });
  const forms = new Gtk.ToggleButton({ label: 'Formes du mot', active: true, tooltipText: 'Inclut les formes fléchies (hébreu)' });
  const exact = new Gtk.ToggleButton({ label: 'Expression exacte', group: forms });
  modes.append(forms);
  modes.append(exact);
  const categories = Gtk.StringList.new(['Toutes les catégories']);
  let categoryNames: string[] = [''];
  const category = new Gtk.DropDown({ model: categories, tooltipText: 'Catégorie' });
  const options = new Gtk.Box({ spacing: 8, marginTop: 8, marginBottom: 4, marginStart: 12, marginEnd: 12 });
  options.append(modes);
  options.append(new Gtk.Box({ hexpand: true }));
  options.append(category);
  const status = new Gtk.Label({ xalign: 0, marginStart: 14, marginBottom: 4, cssClasses: ['caption', 'dim-label'] });
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'], marginStart: 12, marginEnd: 12, marginBottom: 8, valign: Gtk.Align.START });
  const more = new Gtk.Button({ label: 'Plus de résultats', halign: Gtk.Align.CENTER, cssClasses: ['pill'], marginBottom: 12, visible: false });
  const column = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  column.append(list);
  column.append(more);
  const empty = new Adw.StatusPage({ iconName: 'system-search-symbolic', title: 'Rechercher dans la bibliothèque', description: 'Entrée lance la recherche.' });
  const stack = new Gtk.Stack({ vexpand: true });
  stack.add_named(empty, 'empty');
  stack.add_named(new Adw.Spinner({ widthRequest: 32, heightRequest: 32, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER }), 'loading');
  stack.add_named(new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.NEVER, child: column }), 'results');
  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  content.append(options);
  content.append(status);
  content.append(stack);
  const view = new Adw.ToolbarView({ content });
  view.add_top_bar(header);
  dialog.child = view;

  let hits: SearchHit[] = [];
  let seen = new Set<string>();
  let from = 0;
  let total = 0;
  /** recherche en cours (une plus récente rend les précédentes caduques) */
  let generation = 0;
  let filterChanging = false;

  const query = (): SearchQuery => ({ text: entry.text.trim(), mode: (exact.active ? 'exact' : 'forms') satisfies SearchMode, category: categoryNames[category.selected] ?? '', from, size: PAGE });

  const load = (fresh: boolean): void => {
    if (entry.text.trim() === '') return;
    generation += 1;
    const gen = generation;
    if (fresh) {
      from = 0;
      hits = [];
      seen = new Set();
      for (let c = list.get_first_child(); c !== null; c = list.get_first_child()) list.remove(c);
      stack.visibleChildName = 'loading';
      status.label = '';
    }
    more.sensitive = false;
    const q = query();
    void (async () => {
      try {
        const r = await tabs.store.client.search(q, seen);
        if (gen !== generation) return;
        from += PAGE;
        total = r.total;
        for (const h of r.hits) {
          seen.add(h.ref);
          hits.push(h);
          list.append(hitRow(h));
        }
        // catégories de la première page sans filtre : choix proposés
        if (fresh && q.category === '') {
          filterChanging = true;
          categoryNames = ['', ...r.categories.map((c) => c.name)];
          categories.splice(0, categories.get_n_items(), [`Toutes les catégories (${r.total})`, ...r.categories.map((c) => `${c.name} (${c.count})`)]);
          category.selected = 0;
          filterChanging = false;
        }
        status.label = total === 0 ? 'Aucun résultat' : `${total} résultat${total > 1 ? 's' : ''}`;
        stack.visibleChildName = hits.length === 0 ? 'empty' : 'results';
        empty.title = hits.length === 0 ? 'Aucun résultat' : empty.title;
        more.visible = from < total;
        more.sensitive = true;
      } catch (error) {
        if (gen !== generation) return;
        status.label = `Recherche impossible : ${errorMessage(error)}`;
        stack.visibleChildName = hits.length === 0 ? 'empty' : 'results';
        more.sensitive = true;
      }
    })();
  };

  // recherche à la validation seulement (pas à chaque frappe : respect du serveur)
  entry.connect('activate', () => load(true));
  exact.connect('toggled', () => load(true));
  category.connect('notify::selected', () => {
    if (!filterChanging) load(true);
  });
  more.connect('clicked', () => load(false));
  list.connect('row-activated', (_l: Gtk.ListBox, row: Gtk.ListBoxRow) => {
    const hit = hits[row.get_index()];
    if (hit === undefined) return;
    dialog.close();
    // nouvel onglet sur la section, segment trouvé sélectionné et visible
    const section = sectionOf(hit.ref);
    if (section === hit.ref) tabs.newTab(hit.ref);
    else tabs.newTabAt(section, hit.ref);
  });
  dialog.present(parent);
  entry.grab_focus();
}
