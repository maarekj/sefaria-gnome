// Un onglet de lecture : passage, segment sélectionné, versions du livre ouvert.
import { type Accessor, createState, type Setter } from 'gnim';
import type { Passage, VersionInfo } from './api.ts';
import { errorMessage } from './errors.ts';
import type { Load, Store } from './store.ts';

export class Reader {
  readonly store: Store;
  /** passage affiché (null : aucun) */
  readonly passage: Accessor<Load<Passage> | null>;
  readonly #setPassage: Setter<Load<Passage> | null>;
  /** versions disponibles du livre ouvert (chargées à la demande) */
  readonly versions: Accessor<Load<readonly VersionInfo[]> | null>;
  readonly #setVersions: Setter<Load<readonly VersionInfo[]> | null>;
  #versionsBook = '';
  /** segment sélectionné (référence), dont les liens sont affichés ; null : panneau fermé */
  readonly selected: Accessor<string | null>;
  readonly #setSelected: Setter<string | null>;
  /** dernière référence demandée (les réponses plus anciennes sont ignorées) */
  #wanted = '';

  /** Référence demandée (champ de saisie d'un onglet en chargement ou en erreur). */
  get wanted(): string {
    return this.#wanted;
  }

  constructor(store: Store) {
    this.store = store;
    [this.passage, this.#setPassage] = createState<Load<Passage> | null>(null);
    [this.versions, this.#setVersions] = createState<Load<readonly VersionInfo[]> | null>(null);
    [this.selected, this.#setSelected] = createState<string | null>(null);
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
        next = { state: 'ready', value: await this.store.client.text(wanted, this.store.versionsFor(wanted)) };
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

  select(ref: string | null): void {
    this.#setSelected(ref);
  }

  /** Charge les versions disponibles de `book` (cache partagé). */
  loadVersions(book: string): void {
    this.#versionsBook = book;
    this.#setVersions({ state: 'loading' });
    void (async () => {
      let next: Load<readonly VersionInfo[]>;
      try {
        next = { state: 'ready', value: await this.store.versions(book) };
      } catch (error) {
        next = { state: 'error', message: errorMessage(error) };
      }
      if (this.#versionsBook === book) this.#setVersions(next);
    })();
  }
}
