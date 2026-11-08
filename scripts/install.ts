// Installation locale (développement) : ~/.local/bin/sefaria-gnome, fichier .desktop, service
// D-Bus et icônes. À lancer depuis le shell devenv (gjs et les typelibs sont capturés depuis
// l'environnement courant).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './build.ts';

const APP_ID = 'io.github.maarekj.SefariaGnome';
const LAUNCHER = 'sefaria-gnome';

const root = path.resolve(import.meta.dirname, '..');
const home = os.homedir();
const binDir = path.join(home, '.local', 'bin');
const appsDir = path.join(home, '.local', 'share', 'applications');
const dbusDir = path.join(home, '.local', 'share', 'dbus-1', 'services');
const iconsDir = path.join(home, '.local', 'share', 'icons', 'hicolor');

const which = (bin: string): string => {
  const found = (process.env['PATH'] ?? '').split(':').map((d) => path.join(d, bin)).find((p) => fs.existsSync(p));
  if (found === undefined) throw new Error(`${bin} introuvable dans le PATH (lance ce script depuis le shell devenv)`);
  return fs.realpathSync(found);
};
const shq = (s: string): string => `'${s.replaceAll("'", String.raw`'\''`)}'`;
const write = (file: string, content: string, mode = 0o644): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
  fs.chmodSync(file, mode);
  console.log(`  ${file.replace(home, '~')}`);
};

console.log('build…');
await buildApp();

console.log('fichiers :');
write(
  path.join(binDir, LAUNCHER),
  `#!/usr/bin/env bash
# Lance sefaria-gnome (version de développement : ${root}).
export GI_TYPELIB_PATH=${shq(process.env['GI_TYPELIB_PATH'] ?? '')}\${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}
exec ${shq(which('gjs'))} -m ${shq(path.join(root, 'dist', 'app', 'main.js'))} "$@"
`,
  0o755,
);

write(path.join(iconsDir, 'scalable', 'apps', `${APP_ID}.svg`), fs.readFileSync(path.join(root, 'data', 'icons', 'app.svg'), 'utf8'));
write(path.join(iconsDir, 'symbolic', 'apps', `${APP_ID}-symbolic.svg`), fs.readFileSync(path.join(root, 'data', 'icons', 'app-symbolic.svg'), 'utf8'));
try {
  // le thème hicolor n'est relu qu'à la mise à jour de son horodatage
  fs.utimesSync(iconsDir, new Date(), new Date());
} catch {
  // dossier absent : rien à rafraîchir
}

write(
  path.join(appsDir, `${APP_ID}.desktop`),
  `[Desktop Entry]
Type=Application
Name=Sefaria
Comment=Bibliothèque de textes juifs (Sefaria)
Exec=${path.join(binDir, LAUNCHER)}
Icon=${APP_ID}
Terminal=false
Categories=Education;Literature;
Keywords=sefaria;torah;talmud;tanakh;hebrew;
StartupNotify=true
DBusActivatable=true
`,
);

write(
  path.join(dbusDir, `${APP_ID}.service`),
  `[D-BUS Service]
Name=${APP_ID}
Exec=${path.join(binDir, LAUNCHER)} --gapplication-service
`,
);
console.log(`ok — app : ${LAUNCHER}`);
