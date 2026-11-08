// Client HTTP de l'API Sefaria, basé sur libsoup 3 (GJS, sans Node).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import * as z from 'zod/mini';
import { DEFAULT_URL, firstSection, type LibraryNode, type Passage, parseIndex, TextResponse, toPassage } from './api.ts';
import { HttpError } from './errors.ts';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

const decoder = new TextDecoder();

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

  /** Passage `ref` en hébreu et dans la traduction anglaise par défaut ; un livre ouvre sa première section. */
  async text(ref: string): Promise<Passage> {
    const fetchRef = async (r: string): Promise<TextResponse> =>
      z.parse(TextResponse, await this.get(`/api/v3/texts/${encodeURIComponent(r)}?version=hebrew&version=english&return_format=strip_only_footnotes`));
    let res = await fetchRef(ref);
    const first = firstSection(res);
    if (first !== null) res = await fetchRef(first);
    return toPassage(res);
  }
}
