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
  it('aller-retour A → B → A : la première réponse de A, arrivée après, est ignorée', async () => {
    const client = new ManualClient('http://localhost:1');
    const reader = new Reader(new Store(client));
    reader.open('Genesis 1');
    reader.open('Genesis 2');
    reader.open('Genesis 1');
    // la plus récente répond d'abord, la première ensuite
    client.pending[2]?.resolve(passage('Genesis 1', 'récente'));
    await tick();
    client.pending[0]?.resolve(passage('Genesis 1', 'ancienne'));
    client.pending[1]?.resolve(passage('Genesis 2', 'B'));
    await tick();
    const p = reader.passage.peek();
    expect(p?.state === 'ready' ? p.value.enVersion : null).toBe('récente');
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
