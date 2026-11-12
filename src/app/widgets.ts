// Widgets communs : libellé de texte (hébreu ou traduction), défilement vertical, indicateur de
// chargement, vidage d'un conteneur.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import { withDirection } from '../shared/markup.ts';

/**
 * Libellé d'un texte balisé (Pango) ; l'hébreu est placé à droite. Pango détecte la direction de
 * chaque paragraphe et inverse alors LEFT / RIGHT : LEFT signifie « côté du début de ligne », donc
 * à droite pour l'hébreu (RIGHT le renverrait à gauche ; voir AGENTS.md).
 */
export function textLabel(markup: string, hebrew: boolean, options: { cssClasses: string[]; selectable?: boolean; hexpand?: boolean }): Gtk.Label {
  return new Gtk.Label({
    useMarkup: true,
    label: withDirection(markup, hebrew),
    wrap: true,
    wrapMode: Pango.WrapMode.WORD_CHAR,
    selectable: options.selectable ?? true,
    xalign: hebrew ? 1 : 0,
    justify: Gtk.Justification.LEFT,
    hexpand: options.hexpand ?? false,
    cssClasses: options.cssClasses,
  });
}

/** Défilement vertical seul. */
export const scrolled = (child: Gtk.Widget): Gtk.ScrolledWindow => new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.NEVER, vexpand: true, child });

/** Indicateur de chargement centré (`size` px). */
export const spinner = (size = 32, marginTop = 0): Adw.Spinner => new Adw.Spinner({ widthRequest: size, heightRequest: size, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, marginTop });

/** Conteneur dont on retire les enfants (Box, ListBox, Stack…). */
interface Container {
  get_first_child: () => Gtk.Widget | null;
  remove: (child: Gtk.Widget) => void;
}

/** Retire tous les enfants de `container`. */
export function clearChildren(container: Container): void {
  for (let c = container.get_first_child(); c !== null; c = container.get_first_child()) container.remove(c);
}
