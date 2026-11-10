// Faux serveur Sefaria (captures, tests de bout en bout) : sert la table des matières et les
// passages de e2e/fixtures/, sans accès réseau.
// Usage : node scripts/fake-sefaria.ts [--port 4890] [--delay ms]
//   GET /api/index, GET /api/v3/texts/{ref} : comme l'API réelle (un titre de livre renvoie sa
//   première section via `firstAvailableSectionRef`, une référence inconnue { error }) ;
//   GET /api/shape/{titre}, /api/v2/raw/index/{titre} : table des matières (e2e/fixtures/books.json) ;
//   POST /api/search-wrapper : recherche (e2e/fixtures/search.json par requête, première page) ;
//   GET /api/manuscripts/{amud} : éditions d'un amud (e2e/fixtures/manuscripts.json, images /__image/) ;
//   GET /api/calendars : lectures du jour (e2e/fixtures/calendars.json) ;
//   GET /api/name/{texte} : complétion (e2e/fixtures/names.json, sinon aucune) ;
//   GET /api/links/{ref} : liens d'un segment (e2e/fixtures/links.json, sinon aucun) ;
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
const books = z.parse(z.record(z.string(), z.object({ shape: z.unknown(), index: z.unknown() })), JSON.parse(fs.readFileSync(path.join(fixtures, 'books.json'), 'utf8')));
const links = z.parse(z.record(z.string(), z.array(z.unknown())), JSON.parse(fs.readFileSync(path.join(fixtures, 'links.json'), 'utf8')));
const names = z.parse(z.record(z.string(), z.unknown()), JSON.parse(fs.readFileSync(path.join(fixtures, 'names.json'), 'utf8')));
const calendars: unknown = JSON.parse(fs.readFileSync(path.join(fixtures, 'calendars.json'), 'utf8'));
const searches = z.parse(z.record(z.string(), z.unknown()), JSON.parse(fs.readFileSync(path.join(fixtures, 'search.json'), 'utf8')));
const manuscripts = z.parse(z.record(z.string(), z.unknown()), JSON.parse(fs.readFileSync(path.join(fixtures, 'manuscripts.json'), 'utf8')));
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
  if (req.method === 'POST' && url.pathname === '/api/search-wrapper') {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString();
    });
    req.on('end', () => {
      const q = z.safeParse(z.looseObject({ query: z.string(), from: z.optional(z.number()) }), JSON.parse(body));
      requests.push(`search ${body}`);
      const found = q.success && (q.data.from ?? 0) === 0 ? searches[q.data.query] : undefined;
      respond(res, 200, found ?? { hits: { total: 0, hits: [] }, aggregations: { path: { buckets: [] } } });
    });
    return;
  }
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
    for (const [prefix, part] of [['/api/shape/', 'shape'], ['/api/v2/raw/index/', 'index']] as const) {
      if (!url.pathname.startsWith(prefix)) continue;
      const found = books[decodeURIComponent(url.pathname.slice(prefix.length))];
      respond(res, found === undefined ? 404 : 200, found === undefined ? { error: 'livre inconnu' } : found[part]);
      return;
    }
    if (url.pathname.startsWith('/api/manuscripts/')) {
      // images servies par le faux serveur lui-même ({base})
      const found = manuscripts[decodeURIComponent(url.pathname.slice('/api/manuscripts/'.length))] ?? [];
      respond(res, 200, JSON.parse(JSON.stringify(found).replaceAll('{base}', `http://${req.headers.host ?? '127.0.0.1'}`)));
      return;
    }
    if (url.pathname.startsWith('/__image/')) {
      const file = path.join(fixtures, `page-${path.basename(url.pathname, '.png')}.png`);
      if (fs.existsSync(file)) {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(fs.readFileSync(file));
      } else respond(res, 404, { error: 'image inconnue' });
      return;
    }
    if (url.pathname === '/api/calendars') {
      respond(res, 200, calendars);
      return;
    }
    if (url.pathname.startsWith('/api/name/')) {
      respond(res, 200, names[decodeURIComponent(url.pathname.slice('/api/name/'.length))] ?? { is_ref: false, ref: null, completions: [], completion_objects: [] });
      return;
    }
    if (url.pathname.startsWith('/api/links/')) {
      respond(res, 200, links[decodeURIComponent(url.pathname.slice('/api/links/'.length))] ?? []);
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
