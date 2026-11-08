// Fenêtre principale : bibliothèque (barre latérale) et lecture.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { onCleanup } from 'gnim';
import type { Store } from '../shared/store.ts';
import { LibraryPane } from './LibraryPane.tsx';
import { ReaderPage } from './ReaderPage.tsx';

function asPage(o: JSX.Element): Adw.NavigationPage {
  if (!(o instanceof Adw.NavigationPage)) throw new TypeError('NavigationPage attendue');
  return o;
}

export function MainWindow({ app, store }: { app: Adw.Application; store: Store }): JSX.Element {
  let split: Adw.NavigationSplitView | null = null;
  return (
    <Adw.ApplicationWindow
      application={app}
      title="Sefaria"
      defaultWidth={1100}
      defaultHeight={760}
      widthRequest={360}
      heightRequest={400}
      $={(self: Adw.ApplicationWindow) => {
        // fenêtre étroite : une seule colonne, le texte ouvert au premier plan
        const bp = new Adw.Breakpoint({ condition: Adw.BreakpointCondition.parse('max-width: 640sp') });
        if (split !== null) bp.add_setter(split, 'collapsed', true);
        self.add_breakpoint(bp);
      }}
    >
      <Adw.NavigationSplitView
        minSidebarWidth={260}
        maxSidebarWidth={360}
        $={(self: Adw.NavigationSplitView) => {
          split = self;
          self.sidebar = LibraryPane({ store });
          self.content = asPage(ReaderPage({ store }));
          onCleanup(
            store.passage.subscribe(() => {
              if (store.passage.peek() !== null) self.showContent = true;
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
