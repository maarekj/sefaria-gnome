// Point d'entrée de l'application GTK : Sefaria pour GNOME.
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { createRoot } from 'gnim';
import { SefariaClient } from '../shared/client.ts';
import { bookOf } from '../shared/api.ts';
import { SettingsStore } from '../shared/settings.ts';
import { Store } from '../shared/store.ts';
import { loadFonts } from './fonts.ts';
import { focusRefEntry, MainWindow } from './MainWindow.tsx';
import { STYLESHEET } from './style.ts';
import { canGrow, canShrink, scaleCss, stepScale } from './TextScale.ts';

/** Identifiant D-Bus (surchargeable pour lancer une version de développement à côté). */
export const APP_ID = GLib.getenv('SEFARIA_GNOME_APP_ID') ?? 'io.github.maarekj.SefariaGnome';

const app = new Adw.Application({ applicationId: APP_ID, flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
Gtk.Window.set_default_icon_name(APP_ID);
const settings = new SettingsStore();
const store = new Store(new SefariaClient(), (ref) => {
  const s = settings.value.peek();
  const book = bookOf(ref, s.books);
  const chosen = book === undefined ? undefined : s.books[book];
  const tr = chosen?.translation;
  // traduction choisie dans la langue préférée ; choisie dans une autre langue (livre sans la
  // langue préférée) : elle sert de repli pour ce livre seulement
  if (tr?.language === s.language) return { translation: tr, hebrew: chosen?.hebrew };
  return { translation: { language: s.language }, fallback: tr, hebrew: chosen?.hebrew };
});
let mainWindow: Gtk.Window | null = null;

// ------------------------------------------------------------------ actions

const about = new Gio.SimpleAction({ name: 'about' });
about.connect('activate', () => {
  const dialog = new Adw.AboutDialog({
    applicationName: 'Sefaria pour GNOME',
    applicationIcon: APP_ID,
    version: '0.1.0',
    developerName: 'maarekj',
    licenseType: Gtk.License.UNKNOWN,
    comments: 'Lecteur non officiel de la bibliothèque Sefaria.',
    website: 'https://www.sefaria.org',
  });
  dialog.present(mainWindow);
});
app.add_action(about);

/** app.go-to : champ de la référence (Ctrl+L) */
const goTo = new Gio.SimpleAction({ name: 'go-to' });
goTo.connect('activate', () => {
  if (mainWindow !== null) focusRefEntry(mainWindow);
});
app.add_action(goTo);
app.set_accels_for_action('app.go-to', ['<Control>l']);

/** app.text-larger / app.text-smaller / app.text-reset : taille du texte (A+ / A-) */
const textLarger = new Gio.SimpleAction({ name: 'text-larger' });
textLarger.connect('activate', () => settings.update({ textScale: stepScale(settings.value.peek().textScale, 1) }));
const textSmaller = new Gio.SimpleAction({ name: 'text-smaller' });
textSmaller.connect('activate', () => settings.update({ textScale: stepScale(settings.value.peek().textScale, -1) }));
const textReset = new Gio.SimpleAction({ name: 'text-reset' });
textReset.connect('activate', () => settings.update({ textScale: 1 }));
for (const a of [textLarger, textSmaller, textReset]) app.add_action(a);
app.set_accels_for_action('app.text-larger', ['<Control>plus', '<Control>equal', '<Control>KP_Add']);
app.set_accels_for_action('app.text-smaller', ['<Control>minus', '<Control>KP_Subtract']);
app.set_accels_for_action('app.text-reset', ['<Control>0', '<Control>KP_0']);
/** feuille de style des tailles, régénérée à chaque changement d'échelle */
const scaleCssProvider = new Gtk.CssProvider();
const applyScale = (): void => {
  const scale = settings.value.peek().textScale;
  scaleCssProvider.load_from_string(scaleCss(scale));
  textLarger.enabled = canGrow(scale);
  textSmaller.enabled = canShrink(scale);
  textReset.enabled = Math.abs(scale - 1) > 1e-6;
};
applyScale();
settings.value.subscribe(applyScale);

const quit = new Gio.SimpleAction({ name: 'quit' });
quit.connect('activate', () => app.quit());
app.add_action(quit);
app.set_accels_for_action('app.quit', ['<Control>q']);
app.set_accels_for_action('window.close', ['<Control>w']);

// ------------------------------------------------------------------ fenêtre

app.connect('startup', () => {
  const missing = loadFonts();
  if (missing.length > 0) console.error(`polices introuvables : ${missing.join(', ')}`);
  const css = new Gtk.CssProvider();
  css.load_from_string(STYLESHEET);
  const display = Gdk.Display.get_default();
  // oxlint-disable-next-line typescript/no-deprecated -- seule API exposée par GJS pour un style global
  if (display !== null) {
    // oxlint-disable-next-line typescript/no-deprecated -- seule API exposée par GJS pour un style global
    Gtk.StyleContext.add_provider_for_display(display, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    // oxlint-disable-next-line typescript/no-deprecated -- idem
    Gtk.StyleContext.add_provider_for_display(display, scaleCssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
  }
});

app.connect('activate', () => {
  GLib.unsetenv('XDG_ACTIVATION_TOKEN');
  GLib.unsetenv('DESKTOP_STARTUP_ID');
  if (mainWindow !== null) {
    mainWindow.present();
    return;
  }
  store.loadLibrary();
  // référence ouverte au démarrage (captures, tests)
  const initial = GLib.getenv('SEFARIA_GNOME_REF');
  if (initial !== null) store.open(initial);
  createRoot((dispose) => {
    const win = MainWindow({ app, store, settings });
    if (!(win instanceof Gtk.Window)) throw new TypeError('fenêtre attendue');
    mainWindow = win;
    win.connect('close-request', () => {
      mainWindow = null;
      dispose();
      return false;
    });
    win.present();
  });
});

app.runAsync([imports.system.programInvocationName, ...ARGV]).catch((error: unknown) => {
  console.error(error);
});
