// Menu « Versions » de la barre d'en-tête : textes affichés (hébreu et/ou traduction), langue de
// la traduction, traduction et version hébraïque du livre ouvert.
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { languageName, type Passage, type VersionInfo } from '../shared/api.ts';
import type { Display, SettingsStore } from '../shared/settings.ts';
import type { Store } from '../shared/store.ts';

const DISPLAYS: readonly (readonly [Display, string])[] = [
  ['both', 'Hébreu et traduction'],
  ['hebrew', 'Hébreu'],
  ['translation', 'Traduction'],
];

const heading = (text: string): Gtk.Label => new Gtk.Label({ label: text, xalign: 0, marginTop: 12, cssClasses: ['heading'] });

/** Liste à choix unique : `current` coché, `pick` au clic. */
function choices(items: readonly { readonly key: string; readonly label: string }[], current: string, pick: (key: string) => void): Gtk.ListBox {
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] });
  const keys = new Map<Gtk.ListBoxRow, string>();
  for (const it of items) {
    const row = new Gtk.Box({ spacing: 8, marginTop: 6, marginBottom: 6, marginStart: 10, marginEnd: 10 });
    row.append(new Gtk.Label({ label: it.label, xalign: 0, hexpand: true, wrap: true, maxWidthChars: 40 }));
    row.append(new Gtk.Image({ iconName: 'object-select-symbolic', opacity: it.key === current ? 1 : 0 }));
    const r = new Gtk.ListBoxRow({ child: row, activatable: true });
    keys.set(r, it.key);
    list.append(r);
  }
  list.connect('row-activated', (_l: Gtk.ListBox, r: Gtk.ListBoxRow) => {
    const key = keys.get(r);
    if (key !== undefined) pick(key);
  });
  return list;
}

/** Contenu du menu pour l'état courant. */
function build(box: Gtk.Box, store: Store, settings: SettingsStore, passage: Passage | null): void {
  for (let c = box.get_first_child(); c !== null; c = box.get_first_child()) box.remove(c);
  const s = settings.value.peek();

  const displays = new Gtk.Box({ cssClasses: ['linked'], homogeneous: true });
  let group: Gtk.ToggleButton | null = null;
  for (const [key, label] of DISPLAYS) {
    const b = new Gtk.ToggleButton({ label, active: s.display === key, ...(group === null ? {} : { group }) });
    group ??= b;
    b.connect('toggled', () => {
      if (b.active && settings.value.peek().display !== key) settings.update({ display: key });
    });
    displays.append(b);
  }
  box.append(heading('Affichage'));
  box.append(displays);
  if (passage === null) return;

  const versions = store.versions.peek();
  if (versions?.state !== 'ready') {
    box.append(new Gtk.Label({ label: versions?.state === 'error' ? `Versions indisponibles : ${versions.message}` : 'Chargement des versions…', marginTop: 12, wrap: true, cssClasses: ['dim-label'] }));
    return;
  }
  const all: readonly VersionInfo[] = versions.value;
  const languages = [...new Set(all.map((v) => v.language).filter((l) => l !== 'hebrew'))].toSorted((a, b) => languageName(a).localeCompare(languageName(b), 'fr'));
  if (!languages.includes(s.language)) languages.unshift(s.language);

  if (passage.language !== s.language) {
    box.append(
      new Gtk.Label({
        label: `Pas de traduction en ${languageName(s.language).toLowerCase()} pour ce texte : ${passage.language === '' ? 'aucune traduction' : languageName(passage.language).toLowerCase()} affiché.`,
        wrap: true,
        xalign: 0,
        marginTop: 12,
        maxWidthChars: 40,
        cssClasses: ['warning'],
      }),
    );
  }

  box.append(heading('Langue de la traduction'));
  box.append(
    choices(
      languages.map((l) => ({ key: l, label: languageName(l) })),
      s.language,
      (language) => {
        if (language === settings.value.peek().language) return;
        settings.update({ language });
        store.reload();
      },
    ),
  );

  const translations = all.filter((v) => v.language === passage.language);
  if (translations.length > 0) {
    box.append(heading('Traduction'));
    box.append(
      choices(
        translations.map((v) => ({ key: v.title, label: v.title })),
        passage.enVersion,
        (title) => {
          if (title === passage.enVersion) return;
          // langue de repli (préférée absente) : choix limité à ce livre, la langue préférée ne change pas
          settings.updateBook(passage.book, { translation: { language: passage.language, title } });
          store.reload();
        },
      ),
    );
  }

  const hebrew = all.filter((v) => v.language === 'hebrew');
  if (hebrew.length > 1) {
    box.append(heading('Version hébraïque'));
    box.append(
      choices(
        hebrew.map((v) => ({ key: v.title, label: v.title })),
        passage.heVersion,
        (title) => {
          if (title === passage.heVersion) return;
          settings.updateBook(passage.book, { hebrew: title });
          store.reload();
        },
      ),
    );
  }
}

/** Bouton « Versions » et son menu. */
export function versionsMenu(store: Store, settings: SettingsStore): { button: Gtk.MenuButton; dispose: () => void } {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, marginTop: 0, marginBottom: 12, marginStart: 12, marginEnd: 12, widthRequest: 340 });
  const scroller = new Gtk.ScrolledWindow({ child: box, hscrollbarPolicy: Gtk.PolicyType.NEVER, propagateNaturalHeight: true, maxContentHeight: 560 });
  const popover = new Gtk.Popover({ child: scroller });
  const button = new Gtk.MenuButton({ label: 'Versions', tooltipText: 'Versions et affichage', popover });
  const ready = (): Passage | null => {
    const p = store.passage.peek();
    return p?.state === 'ready' ? p.value : null;
  };
  // reconstruit hors du signal en cours (le bouton cliqué fait partie du contenu remplacé)
  let pending = 0;
  const refresh = (): void => {
    if (!popover.visible || pending !== 0) return;
    pending = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      pending = 0;
      if (!popover.visible) return GLib.SOURCE_REMOVE;
      const p = ready();
      // passage d'un autre livre pendant que le menu est ouvert : ses versions
      if (p !== null && p.book !== shownBook) {
        shownBook = p.book;
        store.loadVersions(p.book);
      }
      build(box, store, settings, p);
      return GLib.SOURCE_REMOVE;
    });
  };
  let shownBook = '';
  popover.connect('show', () => {
    const p = ready();
    shownBook = p?.book ?? '';
    if (p !== null) store.loadVersions(p.book);
    build(box, store, settings, p);
  });
  const subs = [store.versions.subscribe(refresh), store.passage.subscribe(refresh), settings.value.subscribe(refresh)];
  return {
    button,
    dispose: () => {
      subs.forEach((u) => u());
      if (pending !== 0) GLib.source_remove(pending);
    },
  };
}
