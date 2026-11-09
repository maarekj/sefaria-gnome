// Faux serveur Sefaria (captures, tests de bout en bout) : sert la table des matières et les
// passages de e2e/fixtures/, sans accès réseau.
// Usage : node scripts/fake-sefaria.ts [--port 4890] [--delay ms]
//   GET /api/index, GET /api/v3/texts/{ref} : comme l'API réelle (un titre de livre renvoie sa
//   première section via `firstAvailableSectionRef`, une référence inconnue { error }) ;
//   GET /api/texts/versions/{titre} : versions des passages de ce livre ;
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
const FixtureVersion = z.looseObject({ languageFamilyName: z.string(), versionTitle: z.string(), language: z.string() });
const texts = z.parse(
  z.record(z.string(), z.looseObject({ ref: z.string(), indexTitle: z.string(), versions: z.array(FixtureVersion) })),
  JSON.parse(fs.readFileSync(path.join(fixtures, 'texts.json'), 'utf8')),
);

/** Versions demandées (`version=famille` ou `famille|titre`), comme l'API : première de la famille par défaut. */
function withVersions(text: (typeof texts)[string], wanted: readonly string[]): unknown {
  const versions = wanted.flatMap((w) => {
    const [family = '', title] = w.split('|');
    const found = text.versions.find((v) => v.languageFamilyName === family && (title === undefined || v.versionTitle === title));
    return found === undefined ? [] : [found];
  });
  return { ...text, versions: [...new Set(versions)] };
}

/** Versions d'un livre : celles des passages de ce livre. */
function bookVersions(title: string): unknown[] {
  const seen = new Map<string, unknown>();
  for (const t of Object.values(texts)) {
    if (t.indexTitle !== title) continue;
    for (const v of t.versions) seen.set(v.versionTitle, { versionTitle: v.versionTitle, language: v.language, languageFamilyName: v.languageFamilyName });
  }
  return [...seen.values()];
}
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
      const text = texts[ref];
      const found = text === undefined ? book(ref) : withVersions(text, url.searchParams.getAll('version'));
      // comme l'API réelle : 200 avec { error } pour une référence inconnue
      respond(res, 200, found ?? { error: `Impossible de trouver la référence « ${ref} ».` });
      return;
    }
    if (url.pathname.startsWith('/api/texts/versions/')) {
      respond(res, 200, bookVersions(decodeURIComponent(url.pathname.slice('/api/texts/versions/'.length))));
      return;
    }
    respond(res, 404, { error: 'introuvable' });
  }, Number(values.delay));
});
server.listen(Number(values.port), '127.0.0.1', () => console.log(`faux Sefaria sur http://127.0.0.1:${values.port}`));
