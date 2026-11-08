// Polices livrées avec l'application (data/fonts/), chargées au démarrage dans la table des
// polices de Pango : l'app n'en dépend ni du système ni du shell devenv.
import GLib from 'gi://GLib';
import PangoCairo from 'gi://PangoCairo?version=1.0';

/** Police du texte hébreu : Taamey Frank CLM (Culmus), conçue pour les nikoud et les te'amim. */
export const HEBREW_FONT = 'Taamey Frank CLM';

const FILES = ['TaameyFrankCLM-Medium.ttf', 'TaameyFrankCLM-Bold.ttf'];

/** Dossier data/fonts du dépôt (le bundle est dans dist/app/main.js). */
export function fontsDir(): string {
  const [file] = GLib.filename_from_uri(import.meta.url);
  return GLib.build_filenamev([GLib.path_get_dirname(file), '..', '..', 'data', 'fonts']);
}

/** Ajoute les polices de l'application ; renvoie celles qui n'ont pas pu être chargées. */
export function loadFonts(dir = fontsDir()): string[] {
  const map = PangoCairo.FontMap.get_default();
  return FILES.filter((f) => !map.add_font_file(GLib.build_filenamev([dir, f])));
}
