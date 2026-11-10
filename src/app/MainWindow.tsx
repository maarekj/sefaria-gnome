// Fenêtre principale : bibliothèque (barre latérale) et lecture.
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { createState, onCleanup } from 'gnim';
import type { SettingsStore } from '../shared/settings.ts';
import type { Store } from '../shared/store.ts';
import type { ReadingStore } from '../shared/userdata.ts';
import { Tabs } from './Tabs.ts';
import { LibraryPane } from './LibraryPane.tsx';
import { ReaderPage, ReaderView } from './ReaderPage.tsx';

function asPage(o: JSX.Element): Adw.NavigationPage {
  if (!(o instanceof Adw.NavigationPage)) throw new TypeError('NavigationPage attendue');
  return o;
}

/** Fenêtre et ses onglets (`ready` : onglets créés, pour les actions de l'application). */
export function MainWindow({ app, store, settings, reading, ready }: { app: Adw.Application; store: Store; settings: SettingsStore; reading: ReadingStore; ready: (tabs: Tabs) => void }): JSX.Element {
  let split: Adw.OverlaySplitView | null = null;
  let win: Adw.ApplicationWindow | null = null;
  let toggleAction: Gio.SimpleAction | null = null;
  // panneau des liens de chaque onglet en superposition (fenêtre moyenne ou étroite)
  const [linksCollapsed, setLinksCollapsed] = createState(false);
  // fenêtre étroite : barre d'en-tête réduite (titre masqué, seul le bouton de fermeture)
  const [narrow, setNarrow] = createState(false);
  let created: Tabs | null = null;
  const tabs = new Tabs(store, (reader, t) => ReaderView({ reader, tabs: t, settings, linksCollapsed }), {
    // session enregistrée à chaque passage ouvert et changement d'onglet (reprise au lancement)
    changed: () => {
      if (created === null) return;
      const s = created.session();
      reading.saveTabs(s.tabs, s.current);
    },
    visited: (p) => reading.visited({ ref: p.ref, heRef: p.heRef }),
  });
  created = tabs;
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
        win = self;
        if (toggleAction !== null) self.add_action(toggleAction);
        // fenêtre moyenne : panneau des liens en superposition (le texte garde sa largeur) ;
        // ajouté avant le point étroit : libadwaita n'applique que le dernier point satisfait
        // (signaux : les onglets créés plus tard suivent aussi)
        let midOn = false;
        let narrowOn = false;
        const sync = (): void => {
          setLinksCollapsed(midOn || narrowOn);
          setNarrow(narrowOn);
        };
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
      <Adw.OverlaySplitView
        minSidebarWidth={260}
        maxSidebarWidth={360}
        showSidebar={settings.value.peek().sidebar}
        $={(self: Adw.OverlaySplitView) => {
          split = self;
          self.sidebar = LibraryPane({ tabs, reading, settings });
          self.content = asPage(ReaderPage({ tabs, settings, narrow, reading }));
          // win.toggle-sidebar (F9, bouton du lecteur) : état suivi dans les deux sens
          const toggle = Gio.SimpleAction.new_stateful('toggle-sidebar', null, GLib.Variant.new_boolean(self.showSidebar));
          toggle.connect('change-state', (_a: Gio.SimpleAction, value: GLib.Variant | null) => {
            self.showSidebar = value?.get_boolean() ?? !self.showSidebar;
          });
          self.connect('notify::show-sidebar', () => {
            toggle.set_state(GLib.Variant.new_boolean(self.showSidebar));
            // choix mémorisé seulement en mode côte à côte (en fenêtre étroite, superposition passagère)
            if (!self.collapsed && self.showSidebar !== settings.value.peek().sidebar) settings.update({ sidebar: self.showSidebar });
          });
          // fenêtre étroite : bibliothèque superposée, fermée par défaut ; élargie : choix mémorisé
          self.connect('notify::collapsed', () => {
            self.showSidebar = !self.collapsed && settings.value.peek().sidebar;
          });
          toggleAction = toggle;
          win?.add_action(toggle);
          onCleanup(
            tabs.passage.subscribe(() => {
              // passage ouvert depuis la bibliothèque superposée : retour au texte
              if (tabs.passage.peek() !== null && self.collapsed) self.showSidebar = false;
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
