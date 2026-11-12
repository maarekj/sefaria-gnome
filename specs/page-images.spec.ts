// Images des pages imprimées : cache LRU borné, téléchargements simultanés partagés.
import GLib from 'gi://GLib';
import { IMAGES_MAX, PageImages } from '../src/app/PageImages.ts';
import { Lru } from '../src/shared/lru.ts';

/** PNG 1×1 (rouge). */
const PNG = GLib.base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC');

describe('page-images', () => {
  it('LRU : la plus ancienne non utilisée est évincée', () => {
    const l = new Lru<string, number>(2);
    l.set('a', 1);
    l.set('b', 2);
    l.get('a');
    l.set('c', 3);
    expect(l.keys()).toEqual(['a', 'c']);
  });
  it('décodage, une seule requête pour deux demandes, cache borné', async () => {
    const asked: string[] = [];
    const images = new PageImages((url) => {
      asked.push(url);
      return Promise.resolve(new GLib.Bytes(PNG));
    });
    const [a, b] = await Promise.all([images.texture('u0'), images.texture('u0')]);
    expect(a).toBe(b);
    expect(a.get_width()).toBe(1);
    expect(asked).toEqual(['u0']);
    const urls = Array.from({ length: IMAGES_MAX + 3 }, (_, i) => `v${i}`);
    await Promise.all(urls.map((u) => images.texture(u)));
    // au plus IMAGES_MAX gardées
    expect(['u0', ...urls].filter((u) => images.cached(u) !== undefined).length).toBe(IMAGES_MAX);
  });
});
