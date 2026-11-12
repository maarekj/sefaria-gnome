import '@girs/gjs';
import '@girs/gjs/dom';
import '@girs/gio-2.0';
import '@girs/glib-2.0';
import '@girs/gobject-2.0';
import '@girs/gtk-4.0';
import '@girs/adw-1';
import '@girs/soup-3.0';
import '@girs/pango-1.0';
import '@girs/pangocairo-1.0';
import '@girs/graphene-1.0';
import '@girs/gdkpixbuf-2.0';

// GLib.unix_signal_add : surcharge de GJS (GLibUnix) absente des types
declare module '@girs/glib-2.0/glib-2.0' {
  namespace GLib {
    function unix_signal_add(priority: number, signum: number, handler: () => boolean): number;
  }
}
