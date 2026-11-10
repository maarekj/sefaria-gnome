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
  /** onglets ou passages modifiés (enregistrement de la session) ; passage affiché dans un onglet */
  readonly #changed: () => void;
  readonly #visited: (p: Passage) => void;

  constructor(store: Store, render: RenderTab, hooks: { changed?: () => void; visited?: (p: Passage) => void } = {}) {
    this.store = store;
    this.#render = render;
    this.#changed = hooks.changed ?? ((): void => undefined);
    this.#visited = hooks.visited ?? ((): void => undefined);
    // premier onglet créé avant `current` : le rendu d'un onglet ne doit pas lire `tabs.current`
    const first = this.#add(null);
    [this.current, this.#setCurrent] = createState(first);
    this.passage = createComputed(() => this.current().passage());
    this.view.connect('notify::selected-page', () => {
      const page = this.view.selectedPage;
      const tab = page === null ? undefined : this.#tabs.get(page);
      if (tab !== undefined) this.#setCurrent(tab.reader);
      this.#changed();
    });
    this.view.connect('page-reordered', () => this.#changed());
    this.view.connect('close-page', (_v: Adw.TabView, page: Adw.TabPage) => {
      this.#tabs.get(page)?.dispose();
      this.#tabs.delete(page);
      this.view.close_page_finish(page, true);
      // dernier onglet fermé : un onglet vide le remplace
      if (this.#tabs.size === 0) this.newTab();
      this.#changed();
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
        const p = reader.passage.peek();
        page.title = tabTitle(p);
        page.loading = p?.state === 'loading';
        if (p?.state === 'ready') {
          this.#visited(p.value);
          this.#changed();
        }
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

  /** Nouvel onglet sur la section `section`, segment `segment` sélectionné et visible. */
  newTabAt(section: string, segment: string): void {
    this.#add(null).openAt(section, segment);
  }

  /** Ouvre `ref` dans l'onglet affiché. */
  open(ref: string): void {
    this.current.peek().open(ref);
  }

  /** Références des onglets (ordre de la barre) et index de l'onglet affiché. */
  session(): { tabs: string[]; current: number } {
    const tabs: string[] = [];
    let current = 0;
    for (let i = 0; i < this.view.nPages; i += 1) {
      const page = this.view.get_nth_page(i);
      const ref = this.#tabs.get(page)?.reader.ref ?? '';
      if (page === this.view.selectedPage) current = tabs.length;
      if (ref !== '') tabs.push(ref);
    }
    return { tabs, current: Math.min(current, Math.max(0, tabs.length - 1)) };
  }

  /** Rouvre une session : premier onglet réutilisé, les autres ajoutés, puis l'onglet affiché. */
  restore(refs: readonly string[], current: number): void {
    refs.forEach((ref, i) => {
      if (i === 0) this.open(ref);
      else this.newTab(ref);
    });
    const page = refs.length > 0 ? this.view.get_nth_page(Math.min(current, this.view.nPages - 1)) : null;
    if (page !== null) this.view.selectedPage = page;
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
