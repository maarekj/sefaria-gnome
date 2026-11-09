// Onglets de lecture (Adw.TabView) : un `Reader` par onglet, rendu dans sa propre racine gnim.
import Adw from 'gi://Adw?version=1';
import type Gtk from 'gi://Gtk?version=4.0';
import { type Accessor, createComputed, createRoot, createState, type Setter } from 'gnim';
import type { Passage } from '../shared/api.ts';
import { Reader } from '../shared/reader.ts';
import type { Load, Store } from '../shared/store.ts';

/** Contenu d'un onglet. */
export type RenderTab = (reader: Reader, tabs: Tabs) => Gtk.Widget;

interface Tab {
  readonly reader: Reader;
  readonly dispose: () => void;
}

/** Titre d'onglet : référence du passage. */
const tabTitle = (p: Load<Passage> | null): string => {
  if (p === null) return 'Nouvel onglet';
  if (p.state === 'ready') return p.value.ref;
  return p.state === 'loading' ? 'Chargement…' : 'Texte introuvable';
};

export class Tabs {
  readonly view = new Adw.TabView();
  readonly store: Store;
  /** onglet affiché */
  readonly current: Accessor<Reader>;
  readonly #setCurrent: Setter<Reader>;
  /** passage de l'onglet affiché */
  readonly passage: Accessor<Load<Passage> | null>;
  readonly #tabs = new Map<Adw.TabPage, Tab>();
  readonly #render: RenderTab;

  constructor(store: Store, render: RenderTab) {
    this.store = store;
    this.#render = render;
    // premier onglet créé avant `current` : le rendu d'un onglet ne doit pas lire `tabs.current`
    const first = this.#add(null);
    [this.current, this.#setCurrent] = createState(first);
    this.passage = createComputed(() => this.current().passage());
    this.view.connect('notify::selected-page', () => {
      const page = this.view.selectedPage;
      const tab = page === null ? undefined : this.#tabs.get(page);
      if (tab !== undefined) this.#setCurrent(tab.reader);
    });
    this.view.connect('close-page', (_v: Adw.TabView, page: Adw.TabPage) => {
      this.#tabs.get(page)?.dispose();
      this.#tabs.delete(page);
      this.view.close_page_finish(page, true);
      // dernier onglet fermé : un onglet vide le remplace
      if (this.#tabs.size === 0) this.newTab();
      return true;
    });
  }

  /** Crée un onglet après l'onglet affiché (`ref` : passage à ouvrir). */
  #add(ref: string | null): Reader {
    const reader = new Reader(this.store);
    const tab = createRoot((dispose) => {
      const child = this.#render(reader, this);
      const selected = this.view.selectedPage;
      const page = selected === null ? this.view.append(child) : this.view.add_page(child, selected);
      page.title = tabTitle(reader.passage.peek());
      const unsubscribe = reader.passage.subscribe(() => {
        page.title = tabTitle(reader.passage.peek());
        page.loading = reader.passage.peek()?.state === 'loading';
      });
      this.#tabs.set(page, {
        reader,
        dispose: () => {
          unsubscribe();
          dispose();
        },
      });
      return page;
    });
    if (ref !== null) reader.open(ref);
    this.view.selectedPage = tab;
    return reader;
  }

  /** Nouvel onglet, affiché (vide, ou sur `ref`). */
  newTab(ref: string | null = null): Reader {
    return this.#add(ref);
  }

  /** Ouvre `ref` dans l'onglet affiché. */
  open(ref: string): void {
    this.current.peek().open(ref);
  }

  /** Libère tous les onglets (fermeture de la fenêtre : leurs racines gnim ne dépendent pas d'elle). */
  dispose(): void {
    for (const t of this.#tabs.values()) t.dispose();
    this.#tabs.clear();
  }

  /** Recharge les onglets du livre `book` (versions modifiées ; '' : tous les onglets). */
  reloadBook(book: string): void {
    for (const t of this.#tabs.values()) {
      const p = t.reader.passage.peek();
      if (p?.state === 'ready' && (book === '' || p.value.book === book)) t.reader.reload();
    }
  }

  closeCurrent(): void {
    const page = this.view.selectedPage;
    if (page !== null) this.view.close_page(page);
  }
}
