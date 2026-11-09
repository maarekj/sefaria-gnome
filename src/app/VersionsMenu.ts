// Menu « Affichage » de la barre d'en-tête : taille du texte, deux colonnes, textes affichés
// (hébreu et/ou traduction), langue de la traduction, traduction et version hébraïque du livre ouvert.
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { languageName, type Passage, type VersionInfo } from '../shared/api.ts';
import type { Display, SettingsStore } from '../shared/settings.ts';
import type { Accessor } from 'gnim';
import type { Reader } from '../shared/reader.ts';
import { scaleLabel } from './TextScale.ts';

const DISPLAYS: readonly (readonly [Display, string])[] = [
  ['both', 'Les deux'],
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
    row.append(new Gtk.Label({ label: it.label, xalign: 0, hexpand: true, wrap: true, maxWidthChars: 32 }));
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
function build(box: Gtk.Box, store: Reader, settings: SettingsStore, passage: Passage | null, reloadBook: (book: string) => void): void {
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
        maxWidthChars: 32,
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
        reloadBook('');
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
          reloadBook(passage.book);
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
          reloadBook(passage.book);
        },
      ),
    );
  }
}

/** Partie fixe du menu : taille du texte (actions app.text-*) et deux colonnes. */
function layoutRow(settings: SettingsStore): { widget: Gtk.Widget; dispose: () => void } {
  const row = new Gtk.Box({ spacing: 6, marginTop: 12, cssClasses: ['text-scale'] });
  row.append(new Gtk.Button({ label: 'A−', tooltipText: 'Réduire le texte', actionName: 'app.text-smaller', cssClasses: ['flat', 'text-smaller'] }));
  const value = new Gtk.Button({ tooltipText: 'Taille par défaut', actionName: 'app.text-reset', cssClasses: ['flat', 'scale-value'] });
  row.append(value);
  row.append(new Gtk.Button({ label: 'A+', tooltipText: 'Agrandir le texte', actionName: 'app.text-larger', cssClasses: ['flat', 'text-larger'] }));
  row.append(new Gtk.Box({ hexpand: true }));
  const columns = new Gtk.ToggleButton({ iconName: 'view-dual-symbolic', tooltipText: 'Deux colonnes' });
  columns.connect('toggled', () => {
    if (columns.active !== settings.value.peek().twoColumns) settings.update({ twoColumns: columns.active });
  });
  row.append(columns);
  const sync = (): void => {
    const s = settings.value.peek();
    value.label = scaleLabel(s.textScale);
    columns.active = s.twoColumns;
    columns.sensitive = s.display === 'both';
  };
  sync();
  return { widget: row, dispose: settings.value.subscribe(sync) };
}

/** Bouton « Affichage » et son menu, pour l'onglet courant. */
export function versionsMenu(current: Accessor<Reader>, settings: SettingsStore, reloadBook: (book: string) => void): { button: Gtk.MenuButton; dispose: () => void } {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, marginTop: 0, marginBottom: 12, marginStart: 12, marginEnd: 12, widthRequest: 300 });
  const fixed = layoutRow(settings);
  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  fixed.widget.set_margin_start(12);
  fixed.widget.set_margin_end(12);
  content.append(fixed.widget);
  content.append(box);
  const scroller = new Gtk.ScrolledWindow({ child: content, hscrollbarPolicy: Gtk.PolicyType.NEVER, propagateNaturalHeight: true, maxContentHeight: 600 });
  const popover = new Gtk.Popover({ child: scroller });
  const button = new Gtk.MenuButton({ label: 'Aa', tooltipText: 'Affichage', popover, cssClasses: ['display-menu'] });
  const ready = (): Passage | null => {
    const p = current.peek().passage.peek();
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
        current.peek().loadVersions(p.book);
      }
      build(box, current.peek(), settings, p, reloadBook);
      return GLib.SOURCE_REMOVE;
    });
  };
  let shownBook = '';
  popover.connect('show', () => {
    const p = ready();
    shownBook = p?.book ?? '';
    if (p !== null) current.peek().loadVersions(p.book);
    build(box, current.peek(), settings, p, reloadBook);
  });
  // onglet courant : abonnements à son passage et à ses versions, renouvelés au changement d'onglet
  let tabSubs: (() => void)[] = [];
  const follow = (): void => {
    tabSubs.forEach((u) => u());
    const r = current.peek();
    tabSubs = [r.versions.subscribe(refresh), r.passage.subscribe(refresh)];
    shownBook = '';
    refresh();
  };
  follow();
  const subs = [current.subscribe(follow), settings.value.subscribe(refresh), () => tabSubs.forEach((u) => u()), fixed.dispose];
  return {
    button,
    dispose: () => {
      subs.forEach((u) => u());
      if (pending !== 0) GLib.source_remove(pending);
    },
  };
}
