// Point d'entrée de l'application GTK : Sefaria pour GNOME.
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { createRoot } from 'gnim';
import { SefariaClient } from '../shared/client.ts';
import { Store } from '../shared/store.ts';
import { focusRefEntry, MainWindow } from './MainWindow.tsx';
import { STYLESHEET } from './style.ts';

/** Identifiant D-Bus (surchargeable pour lancer une version de développement à côté). */
export const APP_ID = GLib.getenv('SEFARIA_GNOME_APP_ID') ?? 'io.github.maarekj.SefariaGnome';

const app = new Adw.Application({ applicationId: APP_ID, flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
Gtk.Window.set_default_icon_name(APP_ID);
const store = new Store(new SefariaClient());
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

const quit = new Gio.SimpleAction({ name: 'quit' });
quit.connect('activate', () => app.quit());
app.add_action(quit);
app.set_accels_for_action('app.quit', ['<Control>q']);
app.set_accels_for_action('window.close', ['<Control>w']);

// ------------------------------------------------------------------ fenêtre

app.connect('startup', () => {
  const css = new Gtk.CssProvider();
  css.load_from_string(STYLESHEET);
  const display = Gdk.Display.get_default();
  // oxlint-disable-next-line typescript/no-deprecated -- seule API exposée par GJS pour un style global
  if (display !== null) Gtk.StyleContext.add_provider_for_display(display, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
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
    const win = MainWindow({ app, store });
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
