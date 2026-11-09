// État réactif de l'application : bibliothèque et passage ouvert.
import { type Accessor, createState, type Setter } from 'gnim';
import type { LibraryNode, LinkCategory, Passage, Toc, VersionInfo, Wanted } from './api.ts';
import type { SefariaClient } from './client.ts';
import { errorMessage } from './errors.ts';

/** Chargement asynchrone. */
export type Load<T> = { readonly state: 'loading' } | { readonly state: 'ready'; readonly value: T } | { readonly state: 'error'; readonly message: string };

/** Versions à demander pour une référence (réglages). */
export type VersionsFor = (ref: string) => Wanted;

export class Store {
  readonly client: SefariaClient;
  readonly library: Accessor<Load<readonly LibraryNode[]>>;
  readonly #setLibrary: Setter<Load<readonly LibraryNode[]>>;
  /** passage affiché (null : aucun) */
  readonly passage: Accessor<Load<Passage> | null>;
  readonly #setPassage: Setter<Load<Passage> | null>;
  /** versions disponibles du livre ouvert (chargées à la demande) */
  readonly versions: Accessor<Load<readonly VersionInfo[]> | null>;
  readonly #setVersions: Setter<Load<readonly VersionInfo[]> | null>;
  readonly #versionsCache = new Map<string, readonly VersionInfo[]>();
  #versionsBook = '';
  readonly #versionsFor: VersionsFor;
  readonly #tocs = new Map<string, Promise<Toc>>();
  readonly #links = new Map<string, Promise<LinkCategory[]>>();
  readonly #texts = new Map<string, Promise<Passage>>();
  /** segment sélectionné (référence), dont les liens sont affichés ; null : panneau fermé */
  readonly selected: Accessor<string | null>;
  readonly #setSelected: Setter<string | null>;
  /** dernière référence demandée (les réponses plus anciennes sont ignorées) */
  #wanted = '';

  constructor(client: SefariaClient, versionsFor: VersionsFor = () => ({ translation: { language: 'english' } })) {
    this.client = client;
    this.#versionsFor = versionsFor;
    [this.selected, this.#setSelected] = createState<string | null>(null);
    [this.versions, this.#setVersions] = createState<Load<readonly VersionInfo[]> | null>(null);
    [this.library, this.#setLibrary] = createState<Load<readonly LibraryNode[]>>({ state: 'loading' });
    [this.passage, this.#setPassage] = createState<Load<Passage> | null>(null);
  }

  loadLibrary(): void {
    this.#setLibrary({ state: 'loading' });
    void (async () => {
      try {
        this.#setLibrary({ state: 'ready', value: await this.client.index() });
      } catch (error) {
        this.#setLibrary({ state: 'error', message: errorMessage(error) });
      }
    })();
  }

  /** Ouvre la référence `ref` (« Genesis 1 », « Berakhot 2a », un titre de livre…). */
  open(ref: string): void {
    const wanted = ref.trim();
    if (wanted === '') return;
    this.#wanted = wanted;
    this.#setSelected(null);
    this.#setPassage({ state: 'loading' });
    void (async () => {
      let next: Load<Passage>;
      try {
        next = { state: 'ready', value: await this.client.text(wanted, this.#versionsFor(wanted)) };
      } catch (error) {
        next = { state: 'error', message: errorMessage(error) };
      }
      if (this.#wanted === wanted) this.#setPassage(next);
    })();
  }

  /** Recharge le passage affiché (versions modifiées). */
  reload(): void {
    const p = this.passage.peek();
    if (p?.state === 'ready') this.open(p.value.ref);
  }

  /** Charge (une fois par livre) les versions disponibles de `book`. */
  loadVersions(book: string): void {
    this.#versionsBook = book;
    const cached = this.#versionsCache.get(book);
    if (cached !== undefined) {
      this.#setVersions({ state: 'ready', value: cached });
      return;
    }
    this.#setVersions({ state: 'loading' });
    void (async () => {
      let next: Load<readonly VersionInfo[]>;
      try {
        const value = await this.client.versions(book);
        this.#versionsCache.set(book, value);
        next = { state: 'ready', value };
      } catch (error) {
        next = { state: 'error', message: errorMessage(error) };
      }
      if (this.#versionsBook === book) this.#setVersions(next);
    })();
  }

  /** Table des matières d'un livre (une requête par livre, échec non mis en cache). */
  toc(book: string): Promise<Toc> {
    return Store.#cached(this.#tocs, book, () => this.client.toc(book));
  }

  select(ref: string | null): void {
    this.#setSelected(ref);
  }

  /** Mise en cache d'une promesse (échec non conservé). */
  static #cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    let p = cache.get(key);
    if (p === undefined) {
      p = load();
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    return p;
  }

  /** Liens d'un segment (une requête par segment). */
  links(ref: string): Promise<LinkCategory[]> {
    return Store.#cached(this.#links, ref, () => this.client.links(ref));
  }

  /** Texte d'une source liée, dans les versions des réglages. */
  linkedText(ref: string): Promise<Passage> {
    const wanted = this.#versionsFor(ref);
    // versions dans la clé : un changement de réglages recharge les sources
    return Store.#cached(this.#texts, `${ref}\u0000${JSON.stringify(wanted)}`, () => this.client.text(ref, wanted));
  }
}
