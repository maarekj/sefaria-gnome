// État réactif de l'application : bibliothèque et passage ouvert.
import { type Accessor, createState, type Setter } from 'gnim';
import type { LibraryNode, Passage } from './api.ts';
import type { SefariaClient } from './client.ts';
import { errorMessage } from './errors.ts';

/** Chargement asynchrone. */
export type Load<T> = { readonly state: 'loading' } | { readonly state: 'ready'; readonly value: T } | { readonly state: 'error'; readonly message: string };

export class Store {
  readonly client: SefariaClient;
  readonly library: Accessor<Load<readonly LibraryNode[]>>;
  readonly #setLibrary: Setter<Load<readonly LibraryNode[]>>;
  /** passage affiché (null : aucun) */
  readonly passage: Accessor<Load<Passage> | null>;
  readonly #setPassage: Setter<Load<Passage> | null>;
  /** dernière référence demandée (les réponses plus anciennes sont ignorées) */
  #wanted = '';

  constructor(client: SefariaClient) {
    this.client = client;
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
    this.#setPassage({ state: 'loading' });
    void (async () => {
      let next: Load<Passage>;
      try {
        next = { state: 'ready', value: await this.client.text(wanted) };
      } catch (error) {
        next = { state: 'error', message: errorMessage(error) };
      }
      if (this.#wanted === wanted) this.#setPassage(next);
    })();
  }
}
