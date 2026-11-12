// Onglet de lecture : une réponse dépassée (même de la même référence) n'écrase pas la plus récente.
import type { Passage, Wanted } from '../src/shared/api.ts';
import { SefariaClient } from '../src/shared/client.ts';
import { Reader } from '../src/shared/reader.ts';
import { Store } from '../src/shared/store.ts';

const passage = (ref: string, enVersion: string): Passage => ({ ref, book: 'Genesis', language: 'english', heRef: '', next: null, prev: null, heVersion: '', enVersion, segments: [], multiChapter: false, sectionRef: ref, textDepth: 2 });

/** Client dont les réponses sont rendues à la main, dans l'ordre voulu. */
class ManualClient extends SefariaClient {
  readonly pending: { ref: string; resolve: (p: Passage) => void }[] = [];

  override text(ref: string, _wanted?: Wanted): Promise<Passage> {
    return new Promise((resolve) => {
      this.pending.push({ ref, resolve });
    });
  }
}

const tick = (): Promise<void> => new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('reader', () => {
  it('versions changées : la réponse de la première requête, arrivée après, est ignorée', async () => {
    const client = new ManualClient('http://localhost:1');
    let language = 'english';
    const reader = new Reader(new Store(client, () => ({ translation: { language } })));
    reader.open('Genesis 1');
    client.pending[0]?.resolve(passage('Genesis 1', 'v1'));
    await tick();
    language = 'french';
    reader.reload();
    language = 'german';
    reader.reload();
    // la plus récente répond d'abord, l'autre ensuite
    client.pending[2]?.resolve(passage('Genesis 1', 'german'));
    await tick();
    client.pending[1]?.resolve(passage('Genesis 1', 'french'));
    await tick();
    const p = reader.passage.peek();
    expect(p?.state === 'ready' ? p.value.enVersion : null).toBe('german');
  });

  it('retour à un passage déjà lu : servi par le cache, sans requête', async () => {
    const client = new ManualClient('http://localhost:1');
    const reader = new Reader(new Store(client));
    reader.open('Genesis 1');
    client.pending[0]?.resolve(passage('Genesis 1', 'v'));
    await tick();
    reader.open('Genesis 2');
    client.pending[1]?.resolve(passage('Genesis 2', 'v'));
    await tick();
    reader.goBack();
    await tick();
    expect(client.pending.length).toBe(2);
    const p = reader.passage.peek();
    expect(p?.state === 'ready' ? p.value.ref : null).toBe('Genesis 1');
  });

  it('onglet fermé : plus aucune réponse affichée', async () => {
    const client = new ManualClient('http://localhost:1');
    const reader = new Reader(new Store(client));
    reader.open('Genesis 1');
    reader.dispose();
    client.pending[0]?.resolve(passage('Genesis 1', 'v1'));
    await tick();
    expect(reader.passage.peek()?.state).toBe('loading');
  });
});

describe('reader différé', () => {
  it('onglet restauré : rien demandé avant son affichage', async () => {
    const client = new ManualClient('http://localhost:1');
    const reader = new Reader(new Store(client));
    reader.defer('Genesis 3');
    expect(reader.ref).toBe('Genesis 3');
    expect(client.pending.length).toBe(0);
    reader.wake();
    reader.wake();
    expect(client.pending.map((p) => p.ref)).toEqual(['Genesis 3']);
    client.pending[0]?.resolve(passage('Genesis 3', 'v'));
    await tick();
    expect(reader.passage.peek()?.state).toBe('ready');
  });
});
