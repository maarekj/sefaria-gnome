// Images des pages imprimées : téléchargées une fois (requêtes simultanées partagées), décodées hors
// de la boucle principale (GdkPixbuf, dans un fil de GTask), gardées dans un cache borné commun à
// tous les onglets (les dernières utilisées) : une photo décodée pèse des dizaines de Mo.
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import type GLib from 'gi://GLib';
import type { SefariaClient } from '../shared/client.ts';
import { Lru } from '../shared/lru.ts';

/** Nombre d'images décodées gardées (amud courant, voisins, autres éditions). */
export const IMAGES_MAX = 6;

/** Décodage asynchrone (fil de GTask), puis texture en mémoire (sans copie supplémentaire). */
export async function decodeTexture(bytes: GLib.Bytes): Promise<Gdk.Texture> {
  const pixbuf = await new Promise<GdkPixbuf.Pixbuf>((resolve, reject) => {
    GdkPixbuf.Pixbuf.new_from_stream_async(Gio.MemoryInputStream.new_from_bytes(bytes), null, (_source, result) => {
      try {
        resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
  const format = pixbuf.hasAlpha ? Gdk.MemoryFormat.R8G8B8A8 : Gdk.MemoryFormat.R8G8B8;
  return Gdk.MemoryTexture.new(pixbuf.width, pixbuf.height, format, pixbuf.read_pixel_bytes(), pixbuf.rowstride);
}

export class PageImages {
  readonly #download: (url: string) => Promise<GLib.Bytes>;
  readonly #ready = new Lru<string, Gdk.Texture>(IMAGES_MAX);
  readonly #pending = new Map<string, Promise<Gdk.Texture>>();

  constructor(download: (url: string) => Promise<GLib.Bytes>) {
    this.#download = download;
  }

  /** Image déjà décodée (sans attendre), sinon undefined. */
  cached(url: string): Gdk.Texture | undefined {
    return this.#ready.get(url);
  }

  /** Image décodée (cache, sinon téléchargement partagé puis décodage). */
  texture(url: string): Promise<Gdk.Texture> {
    const ready = this.#ready.get(url);
    if (ready !== undefined) return Promise.resolve(ready);
    let p = this.#pending.get(url);
    if (p === undefined) {
      p = (async () => {
        try {
          const t = await decodeTexture(await this.#download(url));
          this.#ready.set(url, t);
          return t;
        } finally {
          this.#pending.delete(url);
        }
      })();
      this.#pending.set(url, p);
    }
    return p;
  }
}

const shared = new WeakMap<SefariaClient, PageImages>();

/** Cache d'images commun à tous les onglets d'un même client. */
export function pageImages(client: SefariaClient): PageImages {
  let images = shared.get(client);
  if (images === undefined) {
    images = new PageImages((url) => client.bytes(url));
    shared.set(client, images);
  }
  return images;
}
