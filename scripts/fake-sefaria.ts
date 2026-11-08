// Faux serveur Sefaria (captures, tests de bout en bout) : sert la table des matières et les
// passages de e2e/fixtures/, sans accès réseau.
// Usage : node scripts/fake-sefaria.ts [--port 4890] [--delay ms]
//   GET /api/index, GET /api/v3/texts/{ref} : comme l'API réelle (un titre de livre renvoie sa
//   première section via `firstAvailableSectionRef`, une référence inconnue { error }) ;
//   GET /__test/requests : requêtes reçues (chemins), pour les vérifications des tests.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as z from 'zod/mini';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'e2e', 'fixtures');
const { values } = parseArgs({ options: { port: { type: 'string', default: '4890' }, delay: { type: 'string', default: '0' } } });
const index: unknown = JSON.parse(fs.readFileSync(path.join(fixtures, 'index.json'), 'utf8'));
const texts = z.parse(z.record(z.string(), z.looseObject({ ref: z.string() })), JSON.parse(fs.readFileSync(path.join(fixtures, 'texts.json'), 'utf8')));
const requests: string[] = [];

/** Réponse pour un livre entier : sans section, avec sa première section disponible. */
function book(ref: string): unknown {
  const first = Object.keys(texts).find((k) => k.startsWith(`${ref} `));
  if (first === undefined) return null;
  return { ref, heRef: ref, sectionRef: ref, firstAvailableSectionRef: first, next: first, prev: null, sections: [], textDepth: 2, versions: [] };
}

function respond(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__test/requests') {
    respond(res, 200, requests);
    return;
  }
  requests.push(`${url.pathname}${url.search}`);
  setTimeout(() => {
    if (url.pathname === '/api/index') {
      respond(res, 200, index);
      return;
    }
    if (url.pathname.startsWith('/api/v3/texts/')) {
      const ref = decodeURIComponent(url.pathname.slice('/api/v3/texts/'.length));
      const found = texts[ref] ?? book(ref);
      // comme l'API réelle : 200 avec { error } pour une référence inconnue
      respond(res, 200, found ?? { error: `Impossible de trouver la référence « ${ref} ».` });
      return;
    }
    respond(res, 404, { error: 'introuvable' });
  }, Number(values.delay));
});
server.listen(Number(values.port), '127.0.0.1', () => console.log(`faux Sefaria sur http://127.0.0.1:${values.port}`));
