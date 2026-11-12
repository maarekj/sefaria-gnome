// Client HTTP : réponses JSON, erreurs du serveur ({error} avec 200, page HTML d'un mandataire).
import Soup from 'gi://Soup?version=3.0';
import { SefariaClient } from '../src/shared/client.ts';
import { HttpError } from '../src/shared/errors.ts';

/** Réponses du serveur de test, par chemin : statut, type, corps. */
const ROUTES: Readonly<Record<string, readonly [number, string, string]>> = {
  '/ok': [200, 'application/json', '{"a":1}'],
  '/error200': [200, 'application/json', '{"error":"Référence inconnue"}'],
  '/proxy502': [502, 'text/html', '<html>Bad Gateway</html>'],
  '/html200': [200, 'text/html', '<html>maintenance</html>'],
};

describe('client', () => {
  const server = new Soup.Server({});
  server.add_handler(null, (_s, msg) => {
    const [status, type, body] = ROUTES[msg.get_uri().get_path()] ?? [404, 'application/json', '{"error":"absent"}'];
    msg.set_status(status, null);
    msg.set_response(type, Soup.MemoryUse.COPY, new TextEncoder().encode(body));
  });
  server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
  const port = server.get_uris()[0]?.get_port() ?? 0;
  const client = new SefariaClient(`http://127.0.0.1:${port}`);
  const failure = async (path: string): Promise<Error> => {
    try {
      await client.get(path);
    } catch (error) {
      if (error instanceof Error) return error;
    }
    throw new Error('échec attendu');
  };

  afterAll(() => server.disconnect());

  it('JSON', async () => {
    expect(await client.get('/ok')).toEqual({ a: 1 });
  });
  it('{error} avec un statut 200 : erreur', async () => {
    const e = await failure('/error200');
    expect(e).toBeInstanceOf(HttpError);
    expect(e.message).toBe('Référence inconnue');
  });
  it('page HTML en 502 : statut HTTP', async () => {
    expect((await failure('/proxy502')).message).toBe('GET /proxy502 : HTTP 502');
  });
  it('page HTML en 200 : réponse illisible', async () => {
    expect((await failure('/html200')).message).toContain('pas du JSON');
  });
  it('404 avec {error} : message du serveur', async () => {
    expect((await failure('/rien')).message).toBe('absent');
  });
});
