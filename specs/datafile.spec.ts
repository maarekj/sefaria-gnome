// Écritures regroupées : une seule écriture pour plusieurs modifications, écriture finale à la fermeture.
import GLib from 'gi://GLib';
import { DataWriter, flushDataFiles, WRITE_DELAY_MS } from '../src/shared/datafile.ts';

const read = (file: string): unknown => JSON.parse(new TextDecoder().decode(GLib.file_get_contents(file)[1]));
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('datafile', () => {
  const dir = GLib.dir_make_tmp('sefaria-data-XXXXXX');
  it('écritures regroupées, dernière valeur écrite', async () => {
    const file = GLib.build_filenamev([dir, 'a', 'x.json']);
    const w = new DataWriter(file, 'test');
    for (let i = 0; i < 10; i += 1) w.schedule({ i });
    expect(GLib.file_test(file, GLib.FileTest.EXISTS)).toBe(false);
    await wait(WRITE_DELAY_MS + 300);
    expect(read(file)).toEqual({ i: 9 });
  });
  it('fermeture : valeur en attente écrite tout de suite', () => {
    const file = GLib.build_filenamev([dir, 'b.json']);
    new DataWriter(file, 'test').schedule({ ok: true });
    flushDataFiles();
    expect(read(file)).toEqual({ ok: true });
  });
});

describe('datafile fermeture pendant une écriture', () => {
  it('écriture asynchrone en cours : refaite en synchrone', async () => {
    const dir = GLib.dir_make_tmp('sefaria-data-XXXXXX');
    const file = GLib.build_filenamev([dir, 'c.json']);
    const w = new DataWriter(file, 'test');
    w.schedule({ v: 1 });
    // juste après le délai : écriture asynchrone lancée, pas forcément finie
    await new Promise<void>((resolve) => {
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, WRITE_DELAY_MS + 1, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
      });
    });
    flushDataFiles();
    expect(read(file)).toEqual({ v: 1 });
  });
});
