// Panneau des liens d'un segment : catégories (Commentaires, Midrach…) et leurs sources, puis le
// texte des sources d'un auteur, avec ouverture dans le lecteur.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import Gio from 'gi://Gio';
import { type LinkBook, type LinkCategory, type Passage, segmentRef } from '../shared/api.ts';
import { languageLabel } from '../shared/aiprompt.ts';
import { translate, translateCommentaries } from '../shared/translate.ts';
import { errorMessage } from '../shared/errors.ts';
import { escapeMarkup, sefariaMarkup, withDirection } from '../shared/markup.ts';
import type { Reader } from '../shared/reader.ts';

/** Ouverture d'une source (nouvel onglet). */
export type OpenSource = (ref: string) => void;

/** Sources dont le texte est chargé d'un coup ; au-delà, à la demande. */
const PAGE = 8;

const scrolled = (child: Gtk.Widget): Gtk.ScrolledWindow => new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.NEVER, vexpand: true, child });
const spinner = (): Gtk.Widget => new Adw.Spinner({ widthRequest: 24, heightRequest: 24, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, marginTop: 24 });

function textLabel(markup: string, hebrew: boolean): Gtk.Label {
  return new Gtk.Label({
    useMarkup: true,
    label: withDirection(markup, hebrew),
    wrap: true,
    wrapMode: Pango.WrapMode.WORD_CHAR,
    selectable: true,
    xalign: hebrew ? 1 : 0,
    // Pango inverse LEFT / RIGHT pour un paragraphe RTL (voir AGENTS.md)
    justify: Gtk.Justification.LEFT,
    cssClasses: [hebrew ? 'hebrew' : 'translation', 'link-text'],
  });
}

/** Une source : référence (ouvre le passage) puis son texte. */
function sourceBlock(reader: Reader, ref: string, openSource: OpenSource, group: CommentaryGroup): Gtk.Widget {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, cssClasses: ['link-source'] });
  const header = new Gtk.Box({ spacing: 6 });
  header.append(new Gtk.Label({ label: ref, xalign: 0, hexpand: true, wrap: true, cssClasses: ['heading'] }));
  const open = new Gtk.Button({ iconName: 'go-jump-symbolic', tooltipText: `Ouvrir ${ref}`, cssClasses: ['flat'], valign: Gtk.Align.START });
  open.connect('clicked', () => openSource(ref));
  header.append(open);
  box.append(header);
  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
  body.append(spinner());
  box.append(body);
  void (async () => {
    let p: Passage | null = null;
    let error = '';
    try {
      p = await reader.store.linkedText(ref);
    } catch (e) {
      error = errorMessage(e);
    }
    for (let c = body.get_first_child(); c !== null; c = body.get_first_child()) body.remove(c);
    if (p === null) {
      body.append(new Gtk.Label({ label: `Texte indisponible : ${error}`, xalign: 0, wrap: true, cssClasses: ['dim-label'] }));
      return;
    }
    const translations = new Map<string, Gtk.Label>();
    for (const s of p.segments) {
      if (s.he !== '') body.append(textLabel(sefariaMarkup(s.he), true));
      const en = textLabel(s.en === '' ? '' : sefariaMarkup(s.en), false);
      en.visible = s.en !== '';
      translations.set(s.label, en);
      body.append(en);
    }
    if (reader.store.aiOptions() !== null && reader.selected.peek() !== null) header.insert_child_after(group.button(ref, translations), header.get_first_child());
  })();
  return box;
}

/** Source affichée : libellés de traduction (par segment), note et bouton. */
interface Block {
  readonly translations: Map<string, Gtk.Label>;
  readonly note: Gtk.Label;
  readonly button: Gtk.Button;
}

/**
 * Traduction groupée des commentaires d'un auteur sur le verset sélectionné : une seule requête
 * pour toutes ses sources, avec la section de l'onglet en contexte.
 */
class CommentaryGroup {
  readonly #reader: Reader;
  readonly #book: LinkBook;
  readonly #blocks = new Map<string, Block>();
  #running = false;
  /** annulé quand la sélection change ou que le panneau est libéré */
  readonly #cancellable: Gio.Cancellable;

  constructor(reader: Reader, book: LinkBook, cancellable: Gio.Cancellable) {
    this.#reader = reader;
    this.#book = book;
    this.#cancellable = cancellable;
  }

  /** Bouton « Traduire » d'une source affichée. */
  button(ref: string, translations: Map<string, Gtk.Label>): Gtk.Widget {
    const button = new Gtk.Button({ label: 'Traduire', tooltipText: `Traduire les commentaires de ${this.#book.title} sur ce verset (IA)`, cssClasses: ['flat', 'small-button'], valign: Gtk.Align.START, sensitive: !this.#running });
    const note = new Gtk.Label({ visible: false, xalign: 0, wrap: true, cssClasses: ['caption', 'dim-label'] });
    // la note s'affiche sous le dernier texte de la source
    const parent = [...translations.values()].at(-1)?.get_parent();
    if (parent instanceof Gtk.Box) parent.append(note);
    this.#blocks.set(ref, { translations, note, button });
    button.connect('clicked', () => this.#translate());
    return button;
  }

  #notes(text: string, buttons: boolean): void {
    for (const b of this.#blocks.values()) {
      b.note.label = text;
      b.note.visible = text !== '';
      b.button.sensitive = buttons;
    }
  }

  #translate(): void {
    const o = this.#reader.store.aiOptions();
    const base = this.#reader.passage.peek();
    const commented = this.#reader.selected.peek();
    if (o === null || base?.state !== 'ready' || commented === null || this.#running) return;
    const section = base.value;
    this.#running = true;
    const refs = this.#book.refs;
    this.#notes(`Traduction des ${refs.length} commentaire${refs.length > 1 ? 's' : ''} en ${languageLabel(o.language)}…`, false);
    void (async () => {
      try {
        // tous les commentaires de l'auteur sur ce verset (même non affichés : contexte), cache partagé
        // texte indisponible pour une source : traduite sans elle
        const settled = await Promise.allSettled(refs.map((r) => this.#reader.store.linkedText(r)));
        const passages = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
        if (passages.length === 0) throw new Error('textes des commentaires indisponibles');
        const result = await translateCommentaries(passages, section, commented, (label) => segmentRef(section, label), this.#book.title, o, this.#cancellable);
        if (this.#cancellable.is_cancelled()) return;
        for (const [ref, b] of this.#blocks) {
          const values = result.get(ref) ?? {};
          for (const [label, l] of b.translations) {
            const text = values[label];
            if (text === undefined) continue;
            l.label = withDirection(sefariaMarkup(text), false);
            l.visible = true;
          }
        }
        this.#notes(`Traduction par IA (${o.tool === 'claude' ? 'Claude Code' : 'opencode'})`, false);
      } catch (error) {
        if (!this.#cancellable.is_cancelled()) this.#notes(`Traduction impossible : ${errorMessage(error)}`, true);
      } finally {
        this.#running = false;
      }
    })();
  }
}

/** Page d'une source : textes de ses références, par lots. */
function bookPage(reader: Reader, book: LinkBook, openSource: OpenSource, cancellable: Gio.Cancellable): Adw.NavigationPage {
  const group = new CommentaryGroup(reader, book, cancellable);
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18, marginTop: 12, marginBottom: 18, marginStart: 12, marginEnd: 12 });
  let shown = 0;
  const more = new Gtk.Button({ label: 'Afficher la suite', halign: Gtk.Align.CENTER, cssClasses: ['pill'] });
  const showMore = (): void => {
    if (more.get_parent() !== null) box.remove(more);
    for (const ref of book.refs.slice(shown, shown + PAGE)) box.append(sourceBlock(reader, ref, openSource, group));
    shown = Math.min(book.refs.length, shown + PAGE);
    if (shown < book.refs.length) box.append(more);
  };
  more.connect('clicked', showMore);
  showMore();
  const view = new Adw.ToolbarView({ content: scrolled(box) });
  view.add_top_bar(new Adw.HeaderBar({ showEndTitleButtons: false, showStartTitleButtons: false }));
  return new Adw.NavigationPage({ title: book.title, child: view });
}

/** Liste des catégories et de leurs sources. */
function categoriesList(reader: Reader, categories: readonly LinkCategory[], push: (p: Adw.NavigationPage) => void, openSource: OpenSource, cancellable: Gio.Cancellable): Gtk.Widget {
  if (categories.length === 0) return new Adw.StatusPage({ iconName: 'dialog-information-symbolic', title: 'Aucun lien' });
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, marginTop: 12, marginBottom: 18, marginStart: 12, marginEnd: 12 });
  for (const c of categories) {
    const group = new Adw.PreferencesGroup({ title: c.label, description: `${c.count} lien${c.count > 1 ? 's' : ''}` });
    for (const b of c.books) {
      const row = new Adw.ActionRow({ title: b.title, subtitle: b.heTitle, activatable: true, useMarkup: false });
      row.add_suffix(new Gtk.Label({ label: String(b.refs.length), cssClasses: ['dim-label'] }));
      row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic' }));
      row.connect('activated', () => push(bookPage(reader, b, openSource, cancellable)));
      group.add(row);
    }
    box.append(group);
  }
  return scrolled(box);
}

/** « Traduire ce verset (IA) » : traduction du segment `ref` du passage de l'onglet, section en contexte. */
function verseTranslation(reader: Reader): { widget: Gtk.Widget; select: (ref: string | null) => void; dispose: () => void } {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, marginStart: 12, marginEnd: 12, marginTop: 6, marginBottom: 6 });
  const button = new Gtk.Button({ label: 'Traduire ce verset (IA)', halign: Gtk.Align.START, cssClasses: ['pill', 'small'] });
  const result = new Gtk.Label({ xalign: 0, wrap: true, selectable: true, visible: false, cssClasses: ['translation', 'link-text'] });
  box.append(button);
  box.append(result);
  let current: string | null = null;
  let cancellable: Gio.Cancellable | null = null;
  button.connect('clicked', () => {
    const p = reader.passage.peek();
    const o = reader.store.aiOptions();
    const ref = current;
    const segment = p?.state === 'ready' && ref !== null ? p.value.segments.find((s) => segmentRef(p.value, s.label) === ref) : undefined;
    if (p?.state !== 'ready' || o === null || ref === null || segment === undefined) return;
    cancellable?.cancel();
    const c = new Gio.Cancellable();
    cancellable = c;
    button.sensitive = false;
    result.visible = true;
    result.useMarkup = false;
    result.label = `Traduction en ${languageLabel(o.language)}…`;
    void (async () => {
      let text: string;
      try {
        text = (await translate(p.value, o, c, { only: segment.label }))[segment.label] ?? '';
      } catch (error) {
        text = `Traduction impossible : ${errorMessage(error)}`;
      }
      if (cancellable !== c || current !== ref) return;
      result.useMarkup = true;
      result.label = text.startsWith('Traduction impossible') ? escapeMarkup(text) : withDirection(sefariaMarkup(text), false);
      button.sensitive = true;
    })();
  });
  const select = (ref: string | null): void => {
    cancellable?.cancel();
    cancellable = null;
    current = ref;
    result.visible = false;
    result.label = '';
    button.sensitive = true;
    box.visible = ref !== null && reader.store.aiOptions() !== null;
  };
  // outil activé / désactivé dans les préférences : bouton affiché ou masqué sans attendre
  const unsubscribe = reader.store.aiChanged((): void => {
    box.visible = current !== null && reader.store.aiOptions() !== null;
  });
  return {
    widget: box,
    select,
    dispose: () => {
      unsubscribe();
      cancellable?.cancel();
    },
  };
}

/** Panneau latéral : liens du segment sélectionné de l'onglet (`reader.selected`). */
export function linksPanel(reader: Reader, openSource: OpenSource): { widget: Gtk.Widget; dispose: () => void } {
  const nav = new Adw.NavigationView();
  const close = (): void => reader.select(null);
  const content = new Gtk.Stack();
  const title = new Adw.WindowTitle({ title: 'Liens' });
  const header = new Adw.HeaderBar({ showEndTitleButtons: false, showStartTitleButtons: false, titleWidget: title });
  const closeButton = new Gtk.Button({ iconName: 'window-close-symbolic', tooltipText: 'Fermer les liens' });
  closeButton.connect('clicked', close);
  header.pack_end(closeButton);
  const view = new Adw.ToolbarView({ content });
  view.add_top_bar(header);
  const verse = verseTranslation(reader);
  view.add_top_bar(verse.widget);
  nav.add(new Adw.NavigationPage({ title: 'Liens', child: view, tag: 'links' }));

  let current: string | null = null;
  /** chargement en cours (un plus récent rend les précédents caducs) */
  let generation = 0;
  /** traductions groupées des commentaires du segment affiché */
  let translations = new Gio.Cancellable();
  const show = (): void => {
    const ref = reader.selected.peek();
    if (ref === current) return;
    current = ref;
    translations.cancel();
    translations = new Gio.Cancellable();
    const cancellable = translations;
    verse.select(ref);
    nav.pop_to_tag('links');
    title.subtitle = ref ?? '';
    for (let c = content.get_first_child(); c !== null; c = content.get_first_child()) content.remove(c);
    if (ref === null) return;
    content.add_named(spinner(), 'loading');
    generation += 1;
    const gen = generation;
    void (async () => {
      let widget: Gtk.Widget;
      try {
        widget = categoriesList(reader, await reader.store.links(ref), (p) => nav.push(p), openSource, cancellable);
      } catch (error) {
        widget = new Adw.StatusPage({ iconName: 'network-offline-symbolic', title: 'Liens indisponibles', description: errorMessage(error) });
      }
      // autre sélection entre-temps (même segment resélectionné compris)
      if (gen !== generation) return;
      content.add_named(widget, 'links');
      content.visibleChildName = 'links';
    })();
  };
  show();
  const unsubscribe = reader.selected.subscribe(show);
  return {
    widget: nav,
    dispose: () => {
      unsubscribe();
      verse.dispose();
      translations.cancel();
    },
  };
}
