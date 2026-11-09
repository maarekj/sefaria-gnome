// Barre latérale : la bibliothèque Sefaria, une page par catégorie (Adw.NavigationView), puis la
// table des matières d'un livre (grille des sections, ou parties d'un livre complexe).
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { onCleanup } from 'gnim';
import type { Book, Category, LibraryNode, Parasha, Toc, TocNode, TocSection } from '../shared/api.ts';
import { errorMessage } from '../shared/errors.ts';
import type { Place, ReadingStore } from '../shared/userdata.ts';
import type { Tabs } from './Tabs.ts';

/** Noms français des types de section courants (sinon celui de Sefaria). */
const SECTION_NAMES: Readonly<Record<string, string>> = { Chapter: 'Chapitres', Daf: 'Dapim', Siman: 'Simanim', Perek: 'Chapitres', Parasha: 'Parachiot', Psalm: 'Psaumes' };

const scrolled = (child: Gtk.Widget): Gtk.ScrolledWindow => new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.NEVER, vexpand: true, child });

/** Ligne activable (catégorie, livre ou partie) ; `more` : flèche vers une page suivante. */
function row(title: string, subtitle: string, more: boolean, activate: () => void): Adw.ActionRow {
  const r = new Adw.ActionRow({ title, subtitle, activatable: true, useMarkup: false });
  if (more) r.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic' }));
  r.connect('activated', activate);
  return r;
}

/** Liste des nœuds d'une catégorie : sous-catégorie ou livre → nouvelle page. */
function nodeList(nodes: readonly LibraryNode[], activate: (n: LibraryNode) => void, head: readonly Adw.ActionRow[] = []): Gtk.Widget {
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['navigation-sidebar'] });
  for (const r of head) list.append(r);
  for (const n of nodes) list.append(n.kind === 'category' ? row(n.name, n.heName, true, () => activate(n)) : row(n.title, n.heTitle, true, () => activate(n)));
  return scrolled(list);
}

function page(title: string, content: Gtk.Widget, tag?: string, end?: Gtk.Widget): Adw.NavigationPage {
  const view = new Adw.ToolbarView({ content });
  const header = new Adw.HeaderBar();
  if (end !== undefined) header.pack_end(end);
  view.add_top_bar(header);
  return new Adw.NavigationPage({ title, child: view, ...(tag === undefined ? {} : { tag }) });
}

/** Grille des sections ; celle du passage ouvert est mise en évidence. */
function sectionGrid(sections: readonly TocSection[], tabs: Tabs): Gtk.Widget {
  const flow = new Gtk.FlowBox({ selectionMode: Gtk.SelectionMode.NONE, homogeneous: true, minChildrenPerLine: 4, maxChildrenPerLine: 8, columnSpacing: 4, rowSpacing: 4, valign: Gtk.Align.START, marginTop: 8, marginBottom: 12, marginStart: 8, marginEnd: 8 });
  const buttons = new Map<string, Gtk.Button>();
  for (const s of sections) {
    const b = new Gtk.Button({ label: s.label, cssClasses: ['flat', 'section-button'] });
    b.connect('clicked', () => tabs.open(s.ref));
    buttons.set(s.ref, b);
    flow.append(b);
  }
  let current: Gtk.Button | undefined;
  const highlight = (): void => {
    const p = tabs.passage.peek();
    current?.remove_css_class('current-section');
    current = p?.state === 'ready' ? buttons.get(p.value.ref) : undefined;
    current?.add_css_class('current-section');
  };
  highlight();
  const unsubscribe = tabs.passage.subscribe(highlight);
  flow.connect('destroy', unsubscribe);
  return flow;
}

const ORDINALS = ['1re', '2e', '3e', '4e', '5e', '6e', '7e'];

/** Page d'une paracha : passage entier, puis ses montées. */
function parashaPage(p: Parasha, tabs: Tabs): Adw.NavigationPage {
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['navigation-sidebar'] });
  list.append(row('Paracha entière', p.ref, false, () => tabs.open(p.ref)));
  p.aliyot.forEach((ref, i) => list.append(row(`${ORDINALS[i] ?? `${i + 1}e`} montée`, ref, false, () => tabs.open(ref))));
  return page(p.name, scrolled(list));
}

/** Livre de la Torah : bascule chapitres / parachiot. */
function withParashot(chapters: Gtk.Widget, parashot: readonly Parasha[], tabs: Tabs, push: (p: Adw.NavigationPage) => void): Gtk.Widget {
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['navigation-sidebar'] });
  for (const p of parashot) list.append(row(p.name, p.heName, true, () => push(parashaPage(p, tabs))));
  const stack = new Gtk.Stack({ vexpand: true });
  stack.add_named(chapters, 'chapters');
  stack.add_named(scrolled(list), 'parashot');
  const switcher = new Gtk.Box({ cssClasses: ['linked'], homogeneous: true, halign: Gtk.Align.CENTER, marginTop: 8, marginBottom: 4 });
  let group: Gtk.ToggleButton | null = null;
  for (const [name, label] of [['chapters', 'Chapitres'], ['parashot', 'Parachiot']] as const) {
    const b = new Gtk.ToggleButton({ label, active: name === 'chapters', ...(group === null ? {} : { group }) });
    group ??= b;
    b.connect('toggled', () => {
      if (b.active) stack.visibleChildName = name;
    });
    switcher.append(b);
  }
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  box.append(switcher);
  box.append(stack);
  return box;
}

function tocContent(toc: Toc, tabs: Tabs, push: (p: Adw.NavigationPage) => void): Gtk.Widget {
  if (toc.kind === 'sections') {
    if (toc.sections.length === 0) return new Adw.StatusPage({ iconName: 'dialog-information-symbolic', title: 'Aucune section' });
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    const name = SECTION_NAMES[toc.sectionName] ?? toc.sectionName;
    if (name !== '' && toc.parashot.length === 0) box.append(new Gtk.Label({ label: name, xalign: 0, marginTop: 8, marginStart: 14, cssClasses: ['heading', 'dim-label'] }));
    box.append(sectionGrid(toc.sections, tabs));
    return toc.parashot.length === 0 ? scrolled(box) : withParashot(scrolled(box), toc.parashot, tabs, push);
  }
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['navigation-sidebar'] });
  for (const n of toc.nodes) list.append(row(n.title, n.heTitle, n.sections !== null, () => nodeActivated(n, tabs, push)));
  return scrolled(list);
}

function nodeActivated(n: TocNode, tabs: Tabs, push: (p: Adw.NavigationPage) => void): void {
  if (n.sections === null || n.sections.length === 0) tabs.open(n.ref);
  else push(page(n.title, scrolled(sectionGrid(n.sections, tabs))));
}

/** Page d'un livre : chargement asynchrone de sa table des matières. */
function bookPage(book: Book, tabs: Tabs, push: (p: Adw.NavigationPage) => void): Adw.NavigationPage {
  const stack = new Gtk.Stack();
  stack.add_named(new Adw.Spinner({ widthRequest: 32, heightRequest: 32, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER }), 'loading');
  const p = page(book.title, stack);
  const load = (): void => {
    stack.visibleChildName = 'loading';
    void (async () => {
      try {
        const toc = await tabs.store.toc(book.title);
        stack.add_named(tocContent(toc, tabs, push), 'toc');
        stack.visibleChildName = 'toc';
      } catch (error) {
        const old = stack.get_child_by_name('error');
        if (old !== null) stack.remove(old);
        const status = new Adw.StatusPage({ iconName: 'network-offline-symbolic', title: 'Table des matières indisponible', description: errorMessage(error) });
        const retry = new Gtk.Button({ label: 'Réessayer', halign: Gtk.Align.CENTER, cssClasses: ['pill'] });
        retry.connect('clicked', load);
        status.child = retry;
        stack.add_named(status, 'error');
        stack.visibleChildName = 'error';
      }
    })();
  };
  load();
  return p;
}

/** Page « Signets » ou « Historique » : passages mémorisés, tenue à jour. */
function placesPage(title: string, empty: string, places: () => readonly Place[], reading: ReadingStore, tabs: Tabs, clear?: () => void): Adw.NavigationPage {
  const stack = new Gtk.Stack();
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['navigation-sidebar'] });
  stack.add_named(scrolled(list), 'list');
  stack.add_named(new Adw.StatusPage({ iconName: 'starred-symbolic', title: empty }), 'empty');
  const fillList = (): void => {
    for (let c = list.get_first_child(); c !== null; c = list.get_first_child()) list.remove(c);
    for (const p of places()) list.append(row(p.ref, p.heRef, false, () => tabs.open(p.ref)));
    stack.visibleChildName = places().length === 0 ? 'empty' : 'list';
  };
  fillList();
  const unsubscribe = reading.value.subscribe(fillList);
  let button: Gtk.Button | undefined;
  if (clear !== undefined) {
    button = new Gtk.Button({ iconName: 'edit-clear-all-symbolic', tooltipText: "Effacer l'historique" });
    button.connect('clicked', clear);
  }
  const pg = page(title, stack, undefined, button);
  pg.connect('destroy', unsubscribe);
  return pg;
}

export function LibraryPane({ tabs, reading }: { tabs: Tabs; reading: ReadingStore }): Adw.NavigationPage {
  const nav = new Adw.NavigationView();
  const push = (p: Adw.NavigationPage): void => nav.push(p);
  const activate = (n: LibraryNode): void => {
    nav.push(n.kind === 'book' ? bookPage(n, tabs, push) : categoryPage(n));
  };
  const categoryPage = (c: Category): Adw.NavigationPage => page(c.name, nodeList(c.contents, activate));

  const root = (
    <Gtk.Stack
      visibleChildName={tabs.store.library((l) => l.state)}
      $={(self: Gtk.Stack) => {
        onCleanup(
          tabs.store.library.subscribe(() => {
            const l = tabs.store.library.peek();
            if (l.state !== 'ready') return;
            const old = self.get_child_by_name('ready');
            if (old !== null) self.remove(old);
            self.add_named(
              nodeList(l.value, activate, [
                row('Signets', '', true, () => nav.push(placesPage('Signets', 'Aucun signet', () => reading.value.peek().bookmarks, reading, tabs))),
                row('Historique', '', true, () => nav.push(placesPage('Historique', 'Historique vide', () => reading.value.peek().history, reading, tabs, () => reading.clearHistory()))),
              ]),
              'ready',
            );
            self.visibleChildName = 'ready';
          }),
        );
      }}
    >
      {/* remplacé par la liste au chargement */}
      <Gtk.Box $type="named" name="ready" />
      <Adw.Spinner $type="named" name="loading" widthRequest={32} heightRequest={32} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
      <Adw.StatusPage $type="named" name="error" iconName="network-offline-symbolic" title="Bibliothèque indisponible" description={tabs.store.library((l) => (l.state === 'error' ? l.message : ''))}>
        <Gtk.Button label="Réessayer" halign={Gtk.Align.CENTER} cssClasses={['pill']} onClicked={() => tabs.store.loadLibrary()} />
      </Adw.StatusPage>
    </Gtk.Stack>
  );
  if (!(root instanceof Gtk.Widget)) throw new TypeError('widget attendu');
  nav.add(page('Bibliothèque', root, 'library'));
  return new Adw.NavigationPage({ title: 'Bibliothèque', child: nav });
}
