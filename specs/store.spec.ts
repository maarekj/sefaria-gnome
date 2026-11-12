// État partagé : requêtes simultanées partagées, échec non conservé, versions dans la clé.
import type { Passage, Wanted } from '../src/shared/api.ts';
import { SefariaClient } from '../src/shared/client.ts';
import { Store } from '../src/shared/store.ts';

const passage = (ref: string, enVersion: string): Passage => ({ ref, book: 'Genesis', language: 'english', heRef: '', next: null, prev: null, heVersion: '', enVersion, segments: [], multiChapter: false, sectionRef: ref, textDepth: 2 });

class CountingClient extends SefariaClient {
  readonly asked: string[] = [];
  fail = false;

  override text(ref: string, wanted?: Wanted): Promise<Passage> {
    this.asked.push(ref);
    if (this.fail) return Promise.reject(new Error('hors ligne'));
    return Promise.resolve(passage(ref, wanted?.translation.language ?? ''));
  }
}

describe('store', () => {
  it('deux demandes simultanées : une requête', async () => {
    const client = new CountingClient('http://localhost:1');
    const store = new Store(client);
    const [a, b] = await Promise.all([store.text('Genesis 1'), store.text('Genesis 1')]);
    expect(a).toBe(b);
    expect(client.asked).toEqual(['Genesis 1']);
  });
  it('échec non conservé : la demande suivante refait la requête', async () => {
    const client = new CountingClient('http://localhost:1');
    const store = new Store(client);
    client.fail = true;
    await expectAsync(store.text('Genesis 1')).toBeRejected();
    client.fail = false;
    expect((await store.text('Genesis 1')).ref).toBe('Genesis 1');
    expect(client.asked.length).toBe(2);
  });
  it('versions changées : nouvelle requête', async () => {
    const client = new CountingClient('http://localhost:1');
    let language = 'english';
    const store = new Store(client, () => ({ translation: { language } }));
    await store.text('Genesis 1');
    language = 'french';
    expect((await store.text('Genesis 1')).enVersion).toBe('french');
    expect(client.asked.length).toBe(2);
  });
});
