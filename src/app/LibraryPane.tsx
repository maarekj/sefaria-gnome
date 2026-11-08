// Barre latérale : la bibliothèque Sefaria, une page par catégorie (Adw.NavigationView).
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { onCleanup } from 'gnim';
import type { Category, LibraryNode } from '../shared/api.ts';
import type { Store } from '../shared/store.ts';

/** Liste des nœuds d'une catégorie : sous-catégorie → nouvelle page, livre → ouverture. */
function nodeList(nodes: readonly LibraryNode[], activate: (n: LibraryNode) => void): Gtk.Widget {
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['navigation-sidebar'] });
  for (const n of nodes) {
    const row = new Adw.ActionRow({
      title: n.kind === 'category' ? n.name : n.title,
      subtitle: n.kind === 'category' ? n.heName : n.heTitle,
      activatable: true,
      useMarkup: false,
    });
    if (n.kind === 'category') row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic' }));
    row.connect('activated', () => activate(n));
    list.append(row);
  }
  return new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.NEVER, vexpand: true, child: list });
}

function page(title: string, content: Gtk.Widget, tag?: string): Adw.NavigationPage {
  const view = new Adw.ToolbarView({ content });
  view.add_top_bar(new Adw.HeaderBar());
  return new Adw.NavigationPage({ title, child: view, ...(tag === undefined ? {} : { tag }) });
}

export function LibraryPane({ store }: { store: Store }): Adw.NavigationPage {
  const nav = new Adw.NavigationView();
  const activate = (n: LibraryNode): void => {
    if (n.kind === 'book') store.open(n.title);
    else nav.push(categoryPage(n));
  };
  const categoryPage = (c: Category): Adw.NavigationPage => page(c.name, nodeList(c.contents, activate));

  const root = (
    <Gtk.Stack
      visibleChildName={store.library((l) => l.state)}
      $={(self: Gtk.Stack) => {
        onCleanup(
          store.library.subscribe(() => {
            const l = store.library.peek();
            if (l.state !== 'ready') return;
            const old = self.get_child_by_name('ready');
            if (old !== null) self.remove(old);
            self.add_named(nodeList(l.value, activate), 'ready');
            self.visibleChildName = 'ready';
          }),
        );
      }}
    >
      {/* remplacé par la liste au chargement */}
      <Gtk.Box $type="named" name="ready" />
      <Adw.Spinner $type="named" name="loading" widthRequest={32} heightRequest={32} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
      <Adw.StatusPage $type="named" name="error" iconName="network-offline-symbolic" title="Bibliothèque indisponible" description={store.library((l) => (l.state === 'error' ? l.message : ''))}>
        <Gtk.Button label="Réessayer" halign={Gtk.Align.CENTER} cssClasses={['pill']} onClicked={() => store.loadLibrary()} />
      </Adw.StatusPage>
    </Gtk.Stack>
  );
  if (!(root instanceof Gtk.Widget)) throw new TypeError('widget attendu');
  nav.add(page('Bibliothèque', root, 'library'));
  return new Adw.NavigationPage({ title: 'Bibliothèque', child: nav });
}
