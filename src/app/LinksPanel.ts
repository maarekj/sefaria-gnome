// Panneau des liens d'un segment : catégories (Commentaires, Midrach…) et leurs sources, puis le
// texte des sources d'un auteur, avec ouverture dans le lecteur.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import type { LinkBook, LinkCategory, Passage } from '../shared/api.ts';
import { errorMessage } from '../shared/errors.ts';
import { sefariaMarkup, withDirection } from '../shared/markup.ts';
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
function sourceBlock(reader: Reader, ref: string, openSource: OpenSource): Gtk.Widget {
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
    for (const s of p.segments) {
      if (s.he !== '') body.append(textLabel(sefariaMarkup(s.he), true));
      if (s.en !== '') body.append(textLabel(sefariaMarkup(s.en), false));
    }
  })();
  return box;
}

/** Page d'une source : textes de ses références, par lots. */
function bookPage(reader: Reader, book: LinkBook, openSource: OpenSource): Adw.NavigationPage {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18, marginTop: 12, marginBottom: 18, marginStart: 12, marginEnd: 12 });
  let shown = 0;
  const more = new Gtk.Button({ label: 'Afficher la suite', halign: Gtk.Align.CENTER, cssClasses: ['pill'] });
  const showMore = (): void => {
    if (more.get_parent() !== null) box.remove(more);
    for (const ref of book.refs.slice(shown, shown + PAGE)) box.append(sourceBlock(reader, ref, openSource));
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
function categoriesList(reader: Reader, categories: readonly LinkCategory[], push: (p: Adw.NavigationPage) => void, openSource: OpenSource): Gtk.Widget {
  if (categories.length === 0) return new Adw.StatusPage({ iconName: 'dialog-information-symbolic', title: 'Aucun lien' });
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, marginTop: 12, marginBottom: 18, marginStart: 12, marginEnd: 12 });
  for (const c of categories) {
    const group = new Adw.PreferencesGroup({ title: c.label, description: `${c.count} lien${c.count > 1 ? 's' : ''}` });
    for (const b of c.books) {
      const row = new Adw.ActionRow({ title: b.title, subtitle: b.heTitle, activatable: true, useMarkup: false });
      row.add_suffix(new Gtk.Label({ label: String(b.refs.length), cssClasses: ['dim-label'] }));
      row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic' }));
      row.connect('activated', () => push(bookPage(reader, b, openSource)));
      group.add(row);
    }
    box.append(group);
  }
  return scrolled(box);
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
  nav.add(new Adw.NavigationPage({ title: 'Liens', child: view, tag: 'links' }));

  let current: string | null = null;
  /** chargement en cours (un plus récent rend les précédents caducs) */
  let generation = 0;
  const show = (): void => {
    const ref = reader.selected.peek();
    if (ref === current) return;
    current = ref;
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
        widget = categoriesList(reader, await reader.store.links(ref), (p) => nav.push(p), openSource);
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
  return { widget: nav, dispose: unsubscribe };
}
