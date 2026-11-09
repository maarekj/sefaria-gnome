// Lance l'application sur un écran X virtuel (Xvfb), branchée sur le faux Sefaria, et en prend
// une capture, sans rien afficher à l'écran.
// Usage : node scripts/screenshot.ts [sortie.png] [--ref "Genesis 1"] [--real] [--settings '{"twoColumns":true}']
//   --ref : passage ouvert au démarrage ; --real : vrai serveur Sefaria (réseau) au lieu du faux ;
//   --settings : réglages de départ (dossiers de configuration et de données temporaires, jamais ceux
//   de l'utilisateur).
// Variables : SCREENSHOT_DELAY (s, défaut 4), SCREENSHOT_SIZE (défaut 1100x760),
// SCREENSHOT_XDOTOOL : commandes xdotool jouées avant la capture, séparées par « ; »
// (ex. « mousemove 200 150 click 1; sleep 1; type Genesis 2; key Return; sleep 2 » ;
// « sh: commande » exécute une commande shell, ex. xclip pour remplir le presse-papier).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildApp } from './build.ts';

const root = path.resolve(import.meta.dirname, '..');
const { values, positionals } = parseArgs({ allowPositionals: true, options: { ref: { type: 'string' }, real: { type: 'boolean', default: false }, settings: { type: 'string', default: '{}' } } });
const out = path.resolve(positionals[0] ?? path.join(root, 'dist', 'screenshot.png'));
const delay = process.env['SCREENSHOT_DELAY'] ?? '4';
const [w = '1100', h = '760'] = (process.env['SCREENSHOT_SIZE'] ?? '1100x760').split('x');
const port = '4891';
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'sefaria-screenshot-'));
fs.mkdirSync(path.join(config, 'sefaria-gnome'));
fs.writeFileSync(path.join(config, 'sefaria-gnome', 'settings.json'), values.settings);

await buildApp();
const fake = values.real ? null : spawn(process.execPath, [path.join(root, 'scripts', 'fake-sefaria.ts'), '--port', port], { stdio: 'inherit' });
await new Promise((resolve) => {
  setTimeout(resolve, 800);
});
const quote = (s: string): string => `'${s.replaceAll("'", String.raw`'\''`)}'`;
const script = [
  // bus D-Bus privé (pas de contact avec une instance déjà ouverte), sans accessibilité ni portails
  `export GDK_BACKEND=x11 GSK_RENDERER=cairo GTK_A11Y=none GDK_DEBUG=no-portals GIO_USE_VFS=local`,
  `export SEFARIA_GNOME_APP_ID=io.github.maarekj.SefariaGnome.Screenshot XDG_CONFIG_HOME=${quote(config)} XDG_DATA_HOME=${quote(path.join(config, 'data'))}`,
  ...(values.real ? [] : [`export SEFARIA_GNOME_URL=http://127.0.0.1:${port}`]),
  ...(values.ref === undefined ? [] : [`export SEFARIA_GNOME_REF=${quote(values.ref)}`]),
  `timeout ${Number(delay) + (process.env['SCREENSHOT_XDOTOOL'] === undefined ? 3 : 120)} dbus-run-session -- gjs -m ${quote(path.join(root, 'dist', 'app', 'main.js'))} > >(grep -v -e '^dbus-daemon' -e 'DRI3') 2>&1 &`,
  'app=$!',
  `sleep ${delay}`,
  // fenêtre à la taille de l'écran (pas de gestionnaire de fenêtres sous Xvfb)
  `xdotool search --sync --onlyvisible --name Sefaria windowsize ${w} ${h} windowmove 0 0 || true`,
  'sleep 1',
  ...(process.env['SCREENSHOT_XDOTOOL'] ?? '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .map((c) => (c.startsWith('sleep ') ? c : c.startsWith('sh:') ? c.slice(3) : `xdotool ${c}`)),
  'sleep 1',
  `import -window root ${quote(out)}`,
  'kill $app 2>/dev/null || true',
  'wait',
].join('\n');
try {
  execFileSync('xvfb-run', ['-a', '-s', `-screen 0 ${w}x${h}x24`, 'bash', '-c', script], { stdio: 'inherit' });
} finally {
  fake?.kill();
  fs.rmSync(config, { recursive: true, force: true });
}
console.log(out);
