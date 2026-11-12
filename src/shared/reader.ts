// Un onglet de lecture : passage, segment sélectionné, versions du livre ouvert.
import Gio from 'gi://Gio';
import { type Accessor, createState, type Setter } from 'gnim';
import type { Passage, VersionInfo } from './api.ts';
import { errorMessage } from './errors.ts';
import type { Load, Store } from './store.ts';
import { TOOL_NAMES, translate } from './translate.ts';

/** Traduction par IA de la section affichée. */
export type AiState =
  | { readonly state: 'off' }
  | { readonly state: 'loading'; readonly tool: string }
  | { readonly state: 'ready'; readonly ref: string; readonly values: Readonly<Record<string, string>>; readonly label: string }
  | { readonly state: 'error'; readonly message: string };

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
  /** chargement en cours (un plus récent, même de la même référence, rend les précédents caducs) */
  #generation = 0;
  #disposed = false;
  #deferred = false;
  /** historique de l'onglet : passages précédents et suivants (Alt+Gauche / Alt+Droite) */
  #back: string[] = [];
  #forward: string[] = [];
  readonly canGoBack: Accessor<boolean>;
  readonly #setCanGoBack: Setter<boolean>;
  readonly canGoForward: Accessor<boolean>;
  readonly #setCanGoForward: Setter<boolean>;
  /** traduction par IA : demandée pour l'onglet (suit la navigation), et son état */
  readonly aiOn: Accessor<boolean>;
  readonly #setAiOn: Setter<boolean>;
  readonly ai: Accessor<AiState>;
  readonly #setAi: Setter<AiState>;
  #aiCancel: Gio.Cancellable | null = null;
  /** volet « Page imprimée » ouvert, et agrandi à tout l'onglet */
  readonly pageOn: Accessor<boolean>;
  readonly #setPageOn: Setter<boolean>;
  readonly pageMax: Accessor<boolean>;
  readonly #setPageMax: Setter<boolean>;
  /** segment à sélectionner et à faire défiler jusqu'à lui au prochain affichage (résultat de recherche) */
  #pendingSelect: string | null = null;
  #reveal = false;

  /** Référence demandée (champ de saisie d'un onglet en chargement ou en erreur). */
  get wanted(): string {
    return this.#wanted;
  }

  constructor(store: Store) {
    this.store = store;
    [this.passage, this.#setPassage] = createState<Load<Passage> | null>(null);
    [this.versions, this.#setVersions] = createState<Load<readonly VersionInfo[]> | null>(null);
    [this.selected, this.#setSelected] = createState<string | null>(null);
    [this.canGoBack, this.#setCanGoBack] = createState(false);
    [this.canGoForward, this.#setCanGoForward] = createState(false);
    [this.aiOn, this.#setAiOn] = createState(false);
    [this.pageOn, this.#setPageOn] = createState(false);
    [this.pageMax, this.#setPageMax] = createState(false);
    [this.ai, this.#setAi] = createState<AiState>({ state: 'off' });
    // nouveau passage affiché : traduit si la traduction par IA est active dans l'onglet
    this.passage.subscribe(() => {
      if (this.passage.peek()?.state !== 'ready') return;
      if (this.#pendingSelect !== null) {
        const ref = this.#pendingSelect;
        this.#pendingSelect = null;
        this.#reveal = true;
        this.#setSelected(ref);
      }
      if (this.aiOn.peek()) this.translateSection();
    });
  }

  /** Ouvre / ferme le volet de la page imprimée (fermé : plus agrandi). */
  setPage(on: boolean): void {
    this.#setPageOn(on);
    if (!on) this.#setPageMax(false);
  }

  setPageMax(on: boolean): void {
    this.#setPageMax(on);
  }

  /** Active / désactive la traduction par IA de l'onglet. */
  setAi(on: boolean): void {
    this.#setAiOn(on);
    if (on) this.translateSection();
    else {
      this.#aiCancel?.cancel();
      this.#setAi({ state: 'off' });
    }
  }

  /** Traduit la section affichée (cache, sinon appel de l'outil ; `force` : retraduire). */
  translateSection(force = false): void {
    const p = this.passage.peek();
    const o = this.store.aiOptions();
    if (p?.state !== 'ready') return;
    if (o === null) {
      this.#setAi({ state: 'error', message: 'Traduction par IA désactivée : choisissez un outil dans les préférences.' });
      return;
    }
    this.#aiCancel?.cancel();
    const cancellable = new Gio.Cancellable();
    this.#aiCancel = cancellable;
    const tool = TOOL_NAMES[o.tool];
    this.#setAi({ state: 'loading', tool });
    const ref = p.value.ref;
    void (async () => {
      let next: AiState;
      try {
        next = { state: 'ready', ref, values: await translate(p.value, o, cancellable, { force }), label: `${tool}${o.model.trim() === '' ? '' : ` (${o.model.trim()})`}` };
      } catch (error) {
        next = { state: 'error', message: errorMessage(error) };
      }
      // annulée ou dépassée (autre passage, autre demande)
      if (this.#aiCancel !== cancellable || cancellable.is_cancelled()) return;
      this.#aiCancel = null;
      this.#setAi(next);
    })();
  }

  /** Onglet fermé : traduction en cours annulée (sous-processus arrêté), réponses ignorées. */
  dispose(): void {
    this.#disposed = true;
    this.#generation += 1;
    this.#aiCancel?.cancel();
    this.#aiCancel = null;
  }

  /** Annule la traduction en cours et quitte le mode IA de l'onglet (bouton du bandeau). */
  cancelAi(): void {
    this.#aiCancel?.cancel();
    this.#aiCancel = null;
    this.#setAiOn(false);
    this.#setAi({ state: 'off' });
  }

  /** Ouvre la section `section` avec le segment `segment` sélectionné et visible. */
  openAt(section: string, segment: string): void {
    this.#pendingSelect = segment;
    this.open(section);
  }

  /** Défilement jusqu'au segment sélectionné demandé (une fois). */
  takeReveal(): boolean {
    const r = this.#reveal;
    this.#reveal = false;
    return r;
  }

  /** Référence affichée (ou demandée), vide si aucune. */
  get ref(): string {
    const p = this.passage.peek();
    return p?.state === 'ready' ? p.value.ref : this.#wanted;
  }

  #syncHistory(): void {
    this.#setCanGoBack(this.#back.length > 0);
    this.#setCanGoForward(this.#forward.length > 0);
  }

  /** Passage précédent de l'onglet. */
  goBack(): void {
    const ref = this.#back.pop();
    if (ref === undefined) return;
    if (this.ref !== '') this.#forward.push(this.ref);
    this.#load(ref);
  }

  goForward(): void {
    const ref = this.#forward.pop();
    if (ref === undefined) return;
    if (this.ref !== '') this.#back.push(this.ref);
    this.#load(ref);
  }

  /**
   * Onglet restauré non affiché : `ref` retenue (titre, session) mais chargée seulement au premier
   * affichage (`wake`), pour ne pas tout demander au lancement.
   */
  defer(ref: string): void {
    const wanted = ref.trim();
    if (wanted === '' || this.passage.peek() !== null) return;
    this.#wanted = wanted;
    this.#deferred = true;
  }

  /** Onglet affiché : charge la référence différée. */
  wake(): void {
    if (!this.#deferred) return;
    this.#deferred = false;
    this.#load(this.#wanted);
  }

  /** Référence retenue mais pas encore chargée (onglet restauré jamais affiché). */
  get deferred(): boolean {
    return this.#deferred;
  }

  /** Ouvre la référence `ref` (« Genesis 1 », « Berakhot 2a », un titre de livre…). */
  open(ref: string): void {
    const wanted = ref.trim();
    if (this.#deferred && wanted === this.#wanted) {
      this.wake();
      return;
    }
    if (wanted === '' || wanted === this.ref) return;
    // passage quitté : dans l'historique de l'onglet
    if (this.ref !== '') this.#back.push(this.ref);
    this.#forward = [];
    this.#load(wanted);
  }

  #load(wanted: string): void {
    if (this.#disposed) return;
    this.#deferred = false;
    this.#syncHistory();
    this.#generation += 1;
    const gen = this.#generation;
    this.#wanted = wanted;
    this.#setSelected(null);
    // traduction de l'ancien passage : abandonnée (la nouvelle suit le chargement)
    // passage d'abord en chargement : la fin de la traduction ne fait pas remettre en page l'ancien
    this.#setPassage({ state: 'loading' });
    this.#aiCancel?.cancel();
    this.#aiCancel = null;
    if (this.ai.peek().state !== 'off') this.#setAi({ state: 'off' });
    void (async () => {
      let next: Load<Passage>;
      try {
        next = { state: 'ready', value: await this.store.text(wanted) };
      } catch (error) {
        next = { state: 'error', message: errorMessage(error) };
      }
      if (gen === this.#generation && !this.#disposed) this.#setPassage(next);
    })();
  }

  /** Recharge le passage affiché (versions modifiées). */
  reload(): void {
    // en cours de chargement aussi (versions changées deux fois de suite : la dernière l'emporte)
    const p = this.passage.peek();
    if (p !== null && !this.#deferred && this.ref !== '') this.#load(this.ref);
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
