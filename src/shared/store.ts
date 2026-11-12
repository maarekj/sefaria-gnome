// État partagé de l'application : bibliothèque et caches des requêtes (onglets : reader.ts).
import { type Accessor, createState, type Setter } from 'gnim';
import GLib from 'gi://GLib';
import type { DailyReading, LibraryNode, LinkCategory, Passage, Toc, VersionInfo, Wanted } from './api.ts';
import type { SefariaClient } from './client.ts';
import type { AiOptions } from './translate.ts';
import { errorMessage } from './errors.ts';
import { isStale, readLibraryCache, writeLibraryCache } from './librarycache.ts';

/** Chargement asynchrone. */
export type Load<T> = { readonly state: 'loading' } | { readonly state: 'ready'; readonly value: T } | { readonly state: 'error'; readonly message: string };

/** Versions à demander pour une référence (réglages). */
export type VersionsFor = (ref: string) => Wanted;

/** Mise en cache d'une promesse (échec non conservé). */
function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (p === undefined) {
    p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** État partagé par tous les onglets. */
export class Store {
  readonly client: SefariaClient;
  readonly versionsFor: VersionsFor;
  /** réglages de la traduction par IA (null : désactivée) */
  aiOptions: () => AiOptions | null = () => null;
  /** abonnement aux changements de réglages de l'IA (retourne la désinscription) */
  aiChanged: (f: () => void) => () => void = () => (): void => {
    // aucun réglage à suivre
  };
  readonly library: Accessor<Load<readonly LibraryNode[]>>;
  readonly #setLibrary: Setter<Load<readonly LibraryNode[]>>;
  readonly #tocs = new Map<string, Promise<Toc>>();
  readonly #links = new Map<string, Promise<LinkCategory[]>>();
  readonly #texts = new Map<string, Promise<Passage>>();
  readonly #versions = new Map<string, Promise<VersionInfo[]>>();
  readonly #calendars = new Map<string, Promise<DailyReading[]>>();

  /** cache disque de la bibliothèque (null : aucun) */
  readonly libraryCache: string | null;

  constructor(client: SefariaClient, versionsFor: VersionsFor = () => ({ translation: { language: 'english' } }), options: { libraryCache?: string | null } = {}) {
    this.client = client;
    this.libraryCache = options.libraryCache ?? null;
    this.versionsFor = versionsFor;
    [this.library, this.#setLibrary] = createState<Load<readonly LibraryNode[]>>({ state: 'loading' });
  }

  /**
   * Bibliothèque : copie en cache affichée tout de suite (rafraîchie en arrière-plan si ancienne),
   * sinon téléchargée. `cacheFile` null : pas de cache (tests).
   */
  loadLibrary(cacheFile: string | null = this.libraryCache): void {
    this.#setLibrary({ state: 'loading' });
    void (async () => {
      const saved = cacheFile === null ? null : await readLibraryCache(this.client.url, cacheFile);
      if (saved !== null) {
        this.#setLibrary({ state: 'ready', value: saved.nodes });
        if (!isStale(saved.fetched)) return;
      }
      try {
        const nodes = await this.client.index();
        // rafraîchissement identique : la barre latérale n'est pas reconstruite
        if (saved === null || JSON.stringify(nodes) !== JSON.stringify(saved.nodes)) this.#setLibrary({ state: 'ready', value: nodes });
        if (cacheFile !== null) await writeLibraryCache(this.client.url, nodes, cacheFile);
      } catch (error) {
        // copie en cache affichée : l'échec du rafraîchissement est sans effet
        if (saved === null) this.#setLibrary({ state: 'error', message: errorMessage(error) });
      }
    })();
  }

  /** Table des matières d'un livre (une requête par livre). */
  toc(book: string): Promise<Toc> {
    return cached(this.#tocs, book, () => this.client.toc(book));
  }

  /** Lectures du jour (une requête par jour et par calendrier). */
  calendar(diaspora: boolean): Promise<DailyReading[]> {
    const day = GLib.DateTime.new_now_local().format('%F') ?? '';
    return cached(this.#calendars, `${day}:${diaspora ? 'diaspora' : 'israel'}`, () => this.client.calendar(diaspora));
  }

  /** Versions disponibles d'un livre (une requête par livre). */
  versions(book: string): Promise<VersionInfo[]> {
    return cached(this.#versions, book, () => this.client.versions(book));
  }

  /** Liens d'un segment (une requête par segment). */
  links(ref: string): Promise<LinkCategory[]> {
    return cached(this.#links, ref, () => this.client.links(ref));
  }

  /** Texte d'une source liée, dans les versions des réglages. */
  linkedText(ref: string): Promise<Passage> {
    const wanted = this.versionsFor(ref);
    // versions dans la clé : un changement de réglages recharge les sources
    return cached(this.#texts, `${ref}\u0000${JSON.stringify(wanted)}`, () => this.client.text(ref, wanted));
  }
}
