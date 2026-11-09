// Fenêtre principale : bibliothèque (barre latérale) et lecture.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { createState, onCleanup } from 'gnim';
import type { SettingsStore } from '../shared/settings.ts';
import type { Store } from '../shared/store.ts';
import { Tabs } from './Tabs.ts';
import { LibraryPane } from './LibraryPane.tsx';
import { ReaderPage, ReaderView } from './ReaderPage.tsx';

function asPage(o: JSX.Element): Adw.NavigationPage {
  if (!(o instanceof Adw.NavigationPage)) throw new TypeError('NavigationPage attendue');
  return o;
}

/** Fenêtre et ses onglets (`ready` : onglets créés, pour les actions de l'application). */
export function MainWindow({ app, store, settings, ready }: { app: Adw.Application; store: Store; settings: SettingsStore; ready: (tabs: Tabs) => void }): JSX.Element {
  let split: Adw.NavigationSplitView | null = null;
  // panneau des liens de chaque onglet en superposition (fenêtre moyenne ou étroite)
  const [linksCollapsed, setLinksCollapsed] = createState(false);
  const tabs = new Tabs(store, (reader, t) => ReaderView({ reader, tabs: t, settings, linksCollapsed }));
  tabs.view.vexpand = true;
  tabs.view.hexpand = true;
  ready(tabs);
  return (
    <Adw.ApplicationWindow
      application={app}
      title="Sefaria"
      defaultWidth={1100}
      defaultHeight={760}
      widthRequest={360}
      heightRequest={400}
      $={(self: Adw.ApplicationWindow) => {
        // fenêtre moyenne : panneau des liens en superposition (le texte garde sa largeur) ;
        // ajouté avant le point étroit : libadwaita n'applique que le dernier point satisfait
        // (signaux : les onglets créés plus tard suivent aussi)
        let midOn = false;
        let narrowOn = false;
        const sync = (): void => setLinksCollapsed(midOn || narrowOn);
        const mid = new Adw.Breakpoint({ condition: Adw.BreakpointCondition.parse('max-width: 1000sp') });
        mid.connect('apply', () => {
          midOn = true;
          sync();
        });
        mid.connect('unapply', () => {
          midOn = false;
          sync();
        });
        self.add_breakpoint(mid);
        // fenêtre étroite : une seule colonne, le texte ouvert au premier plan
        const bp = new Adw.Breakpoint({ condition: Adw.BreakpointCondition.parse('max-width: 640sp') });
        if (split !== null) bp.add_setter(split, 'collapsed', true);
        bp.connect('apply', () => {
          narrowOn = true;
          sync();
        });
        bp.connect('unapply', () => {
          narrowOn = false;
          sync();
        });
        self.add_breakpoint(bp);
      }}
    >
      <Adw.NavigationSplitView
        minSidebarWidth={260}
        maxSidebarWidth={360}
        $={(self: Adw.NavigationSplitView) => {
          split = self;
          self.sidebar = LibraryPane({ tabs });
          self.content = asPage(ReaderPage({ tabs, settings }));
          onCleanup(
            tabs.passage.subscribe(() => {
              if (tabs.passage.peek() !== null) self.showContent = true;
            }),
          );
        }}
      />
    </Adw.ApplicationWindow>
  );
}

/** Champ de saisie de la référence (raccourci Ctrl+L). */
export function focusRefEntry(win: Gtk.Window): void {
  const find = (w: Gtk.Widget | null): Gtk.Widget | null => {
    for (let c = w?.get_first_child() ?? null; c !== null; c = c.get_next_sibling()) {
      if (c instanceof Gtk.SearchEntry && c.name === 'ref-entry') return c;
      const found = find(c);
      if (found !== null) return found;
    }
    return null;
  };
  find(win)?.grab_focus();
}
