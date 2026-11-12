// Complétion du champ de référence : suggestions de Sefaria (/api/name) dans un menu sous le champ.
// Requête après une pause de frappe (une seule par pause), réponses dépassées ignorées ;
// Haut / Bas choisissent, Entrée ouvre, Échap ferme.
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import type { Suggestion } from '../shared/api.ts';
import type { SefariaClient } from '../shared/client.ts';
import { clearChildren } from './widgets.ts';

/** Pause de frappe avant la requête (ms). */
export const DEBOUNCE_MS = 250;

export interface RefCompletion {
  /** Texte posé par l'application (référence de l'onglet) : pas de complétion. */
  setText: (text: string) => void;
  dispose: () => void;
}

/**
 * Ajoute la complétion à `entry` ; `open(ref)` à la validation (suggestion choisie, référence
 * reconnue par Sefaria, sinon le texte saisi).
 */
export function attachCompletion(entry: Gtk.SearchEntry, client: SefariaClient, open: (ref: string) => void): RefCompletion {
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.SINGLE, cssClasses: ['ref-suggestions'] });
  const popover = new Gtk.Popover({ child: list, autohide: false, hasArrow: false, canFocus: false, position: Gtk.PositionType.BOTTOM, halign: Gtk.Align.START });
  popover.set_parent(entry);
  let suggestions: readonly Suggestion[] = [];
  /** référence reconnue pour la saisie courante */
  let recognized: string | null = null;
  let timer = 0;
  let generation = 0;
  let programmatic = false;

  const hide = (): void => {
    popover.popdown();
    list.unselect_all();
  };
  const show = (items: readonly Suggestion[]): void => {
    suggestions = items;
    clearChildren(list);
    for (const s of items) list.append(new Gtk.Label({ label: s.label, xalign: 0, marginTop: 4, marginBottom: 4, marginStart: 8, marginEnd: 8, ellipsize: Pango.EllipsizeMode.END }));
    if (items.length === 0) hide();
    else popover.popup();
  };
  const cancel = (): void => {
    if (timer !== 0) GLib.source_remove(timer);
    timer = 0;
    generation += 1;
  };
  const choose = (ref: string): void => {
    cancel();
    hide();
    open(ref);
  };

  entry.connect('changed', () => {
    if (programmatic) return;
    cancel();
    recognized = null;
    const text = entry.text.trim();
    if (text.length < 2) {
      show([]);
      return;
    }
    const gen = generation;
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
      timer = 0;
      void (async () => {
        try {
          const c = await client.complete(text);
          // saisie modifiée entre-temps : réponse dépassée
          if (gen !== generation) return;
          recognized = c.ref;
          show(c.suggestions);
        } catch {
          if (gen === generation) show([]);
        }
      })();
      return GLib.SOURCE_REMOVE;
    });
  });

  // Entrée : suggestion choisie au clavier, sinon référence reconnue, sinon le texte saisi
  entry.connect('activate', () => {
    const row = list.get_selected_row();
    const picked = popover.visible && row !== null ? suggestions[row.get_index()] : undefined;
    choose(picked?.ref ?? recognized ?? entry.text);
  });
  list.connect('row-activated', (_l: Gtk.ListBox, row: Gtk.ListBoxRow) => {
    const s = suggestions[row.get_index()];
    if (s !== undefined) choose(s.ref);
  });

  const keys = new Gtk.EventControllerKey({ propagationPhase: Gtk.PropagationPhase.CAPTURE });
  keys.connect('key-pressed', (_k: Gtk.EventControllerKey, keyval: number) => {
    if (!popover.visible || suggestions.length === 0) return false;
    if (keyval === Gdk.KEY_Escape) {
      cancel();
      hide();
      return true;
    }
    if (keyval !== Gdk.KEY_Down && keyval !== Gdk.KEY_Up) return false;
    const current = list.get_selected_row()?.get_index() ?? -1;
    const next = keyval === Gdk.KEY_Down ? Math.min(suggestions.length - 1, current + 1) : Math.max(-1, current - 1);
    if (next < 0) list.unselect_all();
    else list.select_row(list.get_row_at_index(next));
    return true;
  });
  entry.add_controller(keys);
  // focus perdu : menu fermé
  const focus = new Gtk.EventControllerFocus();
  focus.connect('leave', () => {
    cancel();
    hide();
  });
  entry.add_controller(focus);

  return {
    setText: (text: string) => {
      programmatic = true;
      entry.text = text;
      programmatic = false;
      cancel();
      hide();
    },
    dispose: () => {
      cancel();
      popover.unparent();
    },
  };
}
