// Client HTTP de l'API Sefaria, basé sur libsoup 3 (GJS, sans Node).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import * as z from 'zod/mini';
import { DEFAULT_URL, firstSection, type LibraryNode, type Passage, type LinkCategory, parseIndex, parseLinks, parseToc, parseVersions, type Toc, TextResponse, toPassage, type VersionInfo, versionParams, type Wanted } from './api.ts';
import { HttpError } from './errors.ts';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

const decoder = new TextDecoder();
const DEFAULT_WANTED: Wanted = { translation: { language: 'english' } };

/** URL du serveur Sefaria (SEFARIA_GNOME_URL pour les tests : faux serveur). */
export const serverUrl = (): string => GLib.getenv('SEFARIA_GNOME_URL') ?? DEFAULT_URL;

export class SefariaClient {
  readonly url: string;
  readonly #session = new Soup.Session({ timeout: 30, maxConnsPerHost: 6, userAgent: 'sefaria-gnome/0.1' });

  constructor(url = serverUrl()) {
    this.url = url.replace(/\/+$/u, '');
  }

  /** GET `path` (déjà encodé), réponse JSON brute. */
  async get(path: string): Promise<unknown> {
    const msg = Soup.Message.new('GET', `${this.url}${path}`);
    if (msg === null) throw new Error(`URL invalide : ${this.url}${path}`);
    const bytes = await this.#session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
    const data = bytes.get_data();
    const text = data === null ? '' : decoder.decode(data);
    const status: number = msg.get_status();
    if (status < 200 || status >= 300) {
      const parsed = z.safeParse(z.object({ error: z.string() }), text === '' ? null : JSON.parse(text));
      throw new HttpError(status, parsed.success ? parsed.data.error : `GET ${path} : HTTP ${status}`);
    }
    const json: unknown = text === '' ? null : JSON.parse(text);
    // l'API répond parfois 200 avec { error }
    const error = z.safeParse(z.object({ error: z.string() }), json);
    if (error.success) throw new HttpError(404, error.data.error);
    return json;
  }

  async index(): Promise<LibraryNode[]> {
    return parseIndex(await this.get('/api/index'));
  }

  /** Passage `ref` dans les versions `wanted` (anglais par défaut) ; un livre ouvre sa première section. */
  async text(ref: string, wanted: Wanted = DEFAULT_WANTED): Promise<Passage> {
    const params = versionParams(wanted);
    const fetchRef = async (r: string): Promise<TextResponse> => z.parse(TextResponse, await this.get(`/api/v3/texts/${encodeURIComponent(r)}?${params}&return_format=strip_only_footnotes`));
    let res = await fetchRef(ref);
    const first = firstSection(res);
    if (first !== null) res = await fetchRef(first);
    return toPassage(res, wanted);
  }

  /** Table des matières d'un livre (forme et schéma, en parallèle). */
  async toc(book: string): Promise<Toc> {
    const title = encodeURIComponent(book);
    const [shape, index] = await Promise.all([this.get(`/api/shape/${title}`), this.get(`/api/v2/raw/index/${title}`)]);
    return parseToc(book, shape, index);
  }

  /** Liens (commentaires, sources…) d'un segment, sans texte. */
  async links(ref: string): Promise<LinkCategory[]> {
    return parseLinks(await this.get(`/api/links/${encodeURIComponent(ref)}?with_text=0`));
  }

  /** Versions disponibles d'un livre. */
  async versions(book: string): Promise<VersionInfo[]> {
    return parseVersions(await this.get(`/api/texts/versions/${encodeURIComponent(book)}`));
  }
}
