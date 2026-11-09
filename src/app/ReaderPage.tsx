// Page de lecture : saisie d'une référence, passage en hébreu et en traduction, segment par segment.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import { type Accessor, createComputed, createState, onCleanup } from 'gnim';
import { type Passage, type Segment, segmentRef } from '../shared/api.ts';
import { chapterTitle, passageItems } from '../shared/chapters.ts';
import { sefariaMarkup, withDirection } from '../shared/markup.ts';
import type { Display, SettingsStore } from '../shared/settings.ts';
import type { Reader } from '../shared/reader.ts';
import type { ReadingStore } from '../shared/userdata.ts';
import { linksPanel } from './LinksPanel.ts';
import { attachCompletion } from './RefCompletion.ts';
import type { Tabs } from './Tabs.ts';
import { versionsMenu } from './VersionsMenu.ts';

/** Largeur de texte minimale (px) pour afficher deux colonnes ; en dessous : empilé. */
export const TWO_COLUMNS_MIN_WIDTH = 700;

/** Page affichée selon l'état du passage. */
export const readerScreen = (p: ReturnType<Reader['passage']>): 'empty' | 'loading' | 'error' | 'text' => (p === null ? 'empty' : p.state === 'ready' ? 'text' : p.state);

/** Libellé d'un texte ; l'hébreu est aligné à droite (direction RTL détectée par Pango). */
function textLabel(markup: string, hebrew: boolean): Gtk.Label {
  const label = new Gtk.Label({
    useMarkup: true,
    label: withDirection(markup, hebrew),
    wrap: true,
    wrapMode: Pango.WrapMode.WORD_CHAR,
    selectable: true,
    xalign: hebrew ? 1 : 0,
    // Pango détecte la direction de chaque paragraphe et inverse alors LEFT / RIGHT : LEFT signifie
    // « côté du début de ligne », donc à droite pour l'hébreu (RIGHT le renverrait à gauche)
    justify: Gtk.Justification.LEFT,
    hexpand: true,
    cssClasses: [hebrew ? 'hebrew' : 'translation'],
  });
  return label;
}

/** Segment en deux colonnes, face à face : hébreu à gauche (aligné à droite), numéro au centre,
 * traduction à droite (alignée à gauche). */
function segmentColumns(s: Segment, number: string): Gtk.Widget {
  const row = new Gtk.Box({ homogeneous: true, spacing: 24, cssClasses: ['segment', 'two-columns'] });
  const en = new Gtk.Box({ valign: Gtk.Align.START });
  if (s.en !== '') en.append(textLabel(sefariaMarkup(s.en), false));
  const he = new Gtk.Box({ spacing: 12, valign: Gtk.Align.START });
  he.append(s.he === '' ? new Gtk.Box({ hexpand: true }) : textLabel(sefariaMarkup(s.he), true));
  he.append(new Gtk.Label({ label: number, valign: Gtk.Align.START, xalign: 1, cssClasses: ['segment-number', 'dim-label'] }));
  row.append(he);
  row.append(en);
  return row;
}

/** Titre de chapitre : français à gauche, hébreu à droite (selon les textes affichés). */
function chapterHeading(chapter: string, shown: Display, columns: boolean): Gtk.Widget | null {
  const t = chapterTitle(chapter);
  const fr = shown === 'hebrew' ? null : new Gtk.Label({ label: t.fr, xalign: 0, hexpand: true, cssClasses: ['title-3'] });
  const he = shown === 'translation' || t.he === '' ? null : new Gtk.Label({ label: t.he, xalign: 1, hexpand: true, cssClasses: ['title-3', 'hebrew-heading'] });
  if (fr === null && he === null) return null;
  // deux colonnes : chaque titre au-dessus de sa colonne (hébreu à gauche, aligné à droite)
  const row = new Gtk.Box({ spacing: 24, homogeneous: columns, cssClasses: ['chapter-heading'] });
  for (const l of columns ? [he, fr] : [fr, he]) if (l !== null) row.append(l);
  return row;
}

/** Segment empilé ; hébreu seul : numéro en marge droite. */
function segmentRow(s: Segment, display: Display, label: string): Gtk.Widget {
  const row = new Gtk.Box({ spacing: 12, cssClasses: ['segment'] });
  const number = new Gtk.Label({ label, valign: Gtk.Align.START, xalign: display === 'hebrew' ? 1 : 0, cssClasses: ['segment-number', 'dim-label'] });
  const texts = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, hexpand: true });
  if (s.he !== '' && display !== 'translation') texts.append(textLabel(sefariaMarkup(s.he), true));
  if (s.en !== '' && display !== 'hebrew') texts.append(textLabel(sefariaMarkup(s.en), false));
  if (display !== 'hebrew') row.append(number);
  row.append(texts);
  if (display === 'hebrew') row.append(number);
  return row;
}

/** Mise en page : textes affichés, deux colonnes (seulement avec les deux textes). */
interface Layout {
  readonly display: Display;
  readonly columns: boolean;
}

/** Segments affichés, par référence (sélection). */
type SegmentWidgets = Map<string, Gtk.Widget>;

/** Clic sur un segment : `select` (phase de capture : les libellés sélectionnables gardent leurs clics). */
function clickable(widget: Gtk.Widget, select: () => void): Gtk.Widget {
  const click = new Gtk.GestureClick({ propagationPhase: Gtk.PropagationPhase.CAPTURE });
  // « pressed » : le libellé sélectionnable réclame ensuite la séquence (« released » ne viendrait pas)
  click.connect('pressed', (_g: Gtk.GestureClick, n: number) => {
    if (n === 1) select();
  });
  widget.add_controller(click);
  widget.add_css_class('clickable-segment');
  return widget;
}

function fill(box: Gtk.Box, p: Passage, layout: Layout, select: (ref: string) => void): SegmentWidgets {
  const widgets: SegmentWidgets = new Map();
  for (let c = box.get_first_child(); c !== null; c = box.get_first_child()) box.remove(c);
  const { display } = layout;
  // texte demandé absent (ex. pas de traduction) : l'autre est affiché plutôt qu'une page vide
  const shown: Display = display === 'translation' && p.enVersion === '' ? 'hebrew' : display === 'hebrew' && p.heVersion === '' ? 'translation' : display;
  const visible = p.segments.filter((s) => !(shown === 'hebrew' && s.he === '') && !(shown === 'translation' && s.en === ''));
  for (const item of passageItems(visible, p.multiChapter)) {
    if (item.kind === 'chapter') {
      const heading = chapterHeading(item.chapter, shown, layout.columns && shown === 'both');
      if (heading !== null) box.append(heading);
      continue;
    }
    const ref = segmentRef(p, item.segment.label);
    const w = clickable(layout.columns && shown === 'both' ? segmentColumns(item.segment, item.number) : segmentRow(item.segment, shown, item.number), () => select(ref));
    widgets.set(ref, w);
    box.append(w);
  }
  const versions = [shown === 'translation' ? '' : p.heVersion, shown === 'hebrew' ? '' : p.enVersion].filter((v) => v !== '').join(' · ');
  if (versions !== '') box.append(new Gtk.Label({ label: versions, wrap: true, marginTop: 18, cssClasses: ['caption', 'dim-label'] }));
  return widgets;
}

/** Contenu d'un onglet : passage et panneau des liens de ses segments. */
export function ReaderView({ reader, tabs, settings, linksCollapsed }: { reader: Reader; tabs: Tabs; settings: SettingsStore; linksCollapsed: Accessor<boolean> }): Gtk.Widget {
  /** largeur disponible pour le texte (repli en mode empilé si trop étroit) */
  const [width, setWidth] = createState(10_000);
  const columns = createComputed(() => settings.value().twoColumns && settings.value().display === 'both' && width() >= TWO_COLUMNS_MIN_WIDTH);
  const display = createComputed(() => settings.value().display);
  const layout = (): Layout => ({ display: display.peek(), columns: columns.peek() });
  // source ouverte depuis le panneau des liens : nouvel onglet
  const links = linksPanel(reader, (ref) => {
    tabs.newTab(ref);
  });
  onCleanup(links.dispose);
  let segments: SegmentWidgets = new Map();
  let highlighted: Gtk.Widget | undefined;
  const highlight = (): void => {
    highlighted?.remove_css_class('selected-segment');
    const ref = reader.selected.peek();
    highlighted = ref === null ? undefined : segments.get(ref);
    highlighted?.add_css_class('selected-segment');
  };
  /** sélection (un clic sur le segment déjà sélectionné, ex. pour en sélectionner le texte, ne ferme rien) */
  const select = (ref: string): void => reader.select(ref);
  const render = (box: Gtk.Box, p: Passage): void => {
    segments = fill(box, p, layout(), select);
    highlight();
  };
  const ready = (): Passage | null => {
    const p = reader.passage.peek();
    return p?.state === 'ready' ? p.value : null;
  };
  let scroller: Gtk.ScrolledWindow | null = null;
  const view = (
    <Adw.OverlaySplitView
      sidebarPosition={Gtk.PackType.END}
      // seule la sélection ouvre / ferme le panneau (pas le repli ou l'élargissement de la fenêtre)
      pinSidebar
      collapsed={linksCollapsed}
      minSidebarWidth={300}
      maxSidebarWidth={440}
      sidebarWidthFraction={0.36}
      showSidebar={reader.selected((r) => r !== null)}
      $={(self: Adw.OverlaySplitView) => {
        self.sidebar = links.widget;
        // panneau refermé (glissement, Échap en mode superposé) : plus de sélection
        self.connect('notify::show-sidebar', () => {
          if (!self.showSidebar) reader.select(null);
        });
      }}
    >
      <Gtk.Stack visibleChildName={reader.passage(readerScreen)} transitionType={Gtk.StackTransitionType.CROSSFADE}>
        <Adw.StatusPage $type="named" name="empty" iconName="accessories-dictionary-symbolic" title="Choisissez un texte" description="Parcourez la bibliothèque ou saisissez une référence." />
        <Adw.Spinner $type="named" name="loading" widthRequest={32} heightRequest={32} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
        <Adw.StatusPage $type="named" name="error" iconName="dialog-warning-symbolic" title="Texte introuvable" description={reader.passage((p) => (p?.state === 'error' ? p.message : ''))} />
        <Gtk.ScrolledWindow
          $type="named"
          name="text"
          hscrollbarPolicy={Gtk.PolicyType.NEVER}
          $={(self: Gtk.ScrolledWindow) => {
            scroller = self;
            // changement de taille : même proportion défilée une fois le texte remis en page
            let scale = settings.value.peek().textScale;
            onCleanup(
              settings.value.subscribe(() => {
                const next = settings.value.peek().textScale;
                if (next === scale) return;
                scale = next;
                const v = self.vadjustment;
                const ratio = v.upper > 0 ? v.value / v.upper : 0;
                const id = v.connect('notify::upper', () => {
                  v.disconnect(id);
                  v.set_value(ratio * v.upper);
                });
              }),
            );
            const adj = self.hadjustment;
            adj.connect('notify::page-size', () => {
              const w = Math.round(adj.pageSize);
              // largeur nulle avant la première allocation : ignorée
              if (w > 0 && (w >= TWO_COLUMNS_MIN_WIDTH) !== (width.peek() >= TWO_COLUMNS_MIN_WIDTH)) setWidth(w);
            });
          }}
        >
          <Adw.Clamp maximumSize={columns((c) => (c ? 1400 : 820))} tighteningThreshold={600}>
            <Gtk.Box
              orientation={Gtk.Orientation.VERTICAL}
              marginTop={18}
              marginBottom={24}
              marginStart={12}
              marginEnd={12}
              $={(self: Gtk.Box) => {
                onCleanup(
                  reader.passage.subscribe(() => {
                    const p = ready();
                    if (p === null) return;
                    render(self, p);
                    scroller?.vadjustment.set_value(0);
                  }),
                );
                // changement de mode : même passage, même position de défilement
                const relayout = (): void => {
                  const p = ready();
                  if (p !== null) render(self, p);
                };
                onCleanup(columns.subscribe(relayout));
                onCleanup(display.subscribe(relayout));
                // segment sélectionné : mis en évidence
                onCleanup(reader.selected.subscribe(highlight));
              }}
            />
          </Adw.Clamp>
        </Gtk.ScrolledWindow>
      </Gtk.Stack>
    </Adw.OverlaySplitView>
  );
  if (!(view instanceof Gtk.Widget)) throw new TypeError('widget attendu');
  return view;
}

/** Page de lecture : barre d'en-tête (onglet affiché), barre d'onglets, onglets. */
export function ReaderPage({ tabs, settings, narrow, reading }: { tabs: Tabs; settings: SettingsStore; narrow: Accessor<boolean>; reading: ReadingStore }): JSX.Element {
  /** passage affiché en signet */
  const bookmarked = createComputed(() => {
    const p = tabs.passage();
    return p?.state === 'ready' && reading.value().bookmarks.some((b) => b.ref === p.value.ref);
  });
  const versions = versionsMenu(tabs.current, settings, (book) => tabs.reloadBook(book));
  onCleanup(versions.dispose);
  const ready = (): Passage | null => {
    const p = tabs.passage.peek();
    return p?.state === 'ready' ? p.value : null;
  };
  return (
    <Adw.NavigationPage title="Lecture">
      <Adw.ToolbarView>
        <Adw.HeaderBar $type="top" decorationLayout={narrow((n) => (n ? ":close" : (Gtk.Settings.get_default()?.gtkDecorationLayout ?? ":minimize,maximize,close")))}>
          <Gtk.Button
            $type="start"
            iconName="go-previous-symbolic"
            tooltipText="Section précédente"
            sensitive={tabs.passage((p) => p?.state === 'ready' && p.value.prev !== null)}
            onClicked={() => {
              const prev = ready()?.prev;
              if (prev !== undefined && prev !== null) tabs.open(prev);
            }}
          />
          <Gtk.Button
            $type="start"
            iconName="go-next-symbolic"
            tooltipText="Section suivante"
            sensitive={tabs.passage((p) => p?.state === 'ready' && p.value.next !== null)}
            onClicked={() => {
              const next = ready()?.next;
              if (next !== undefined && next !== null) tabs.open(next);
            }}
          />
          <Adw.WindowTitle
            $type="title"
            visible={narrow((n) => !n)}
            title={tabs.passage((p) => (p?.state === 'ready' ? p.value.ref : 'Sefaria'))}
            subtitle={tabs.passage((p) => (p?.state === 'ready' ? p.value.heRef : ''))}
          />
          <Gtk.Box $type="end" $={(self: Gtk.Box) => self.append(versions.button)} />
          <Gtk.ToggleButton
            $type="end"
            iconName="starred-symbolic"
            tooltipText={bookmarked((b) => (b ? 'Retirer le signet' : 'Ajouter un signet'))}
            visible={narrow((n) => !n)}
            sensitive={tabs.passage((p) => p?.state === 'ready')}
            active={bookmarked}
            onToggled={(self: Gtk.ToggleButton) => {
              const p = ready();
              if (p !== null && self.active !== reading.isBookmarked(p.ref)) reading.toggleBookmark({ ref: p.ref, heRef: p.heRef });
            }}
          />
          <Gtk.SearchEntry
            $type="end"
            name="ref-entry"
            placeholderText="Référence (ex. Genesis 1)"
            tooltipText="Aller à une référence"
            cssClasses={narrow((n) => (n ? ['ref-entry', 'compact'] : ['ref-entry']))}
            $={(self: Gtk.SearchEntry) => {
              const completion = attachCompletion(self, tabs.store.client, (ref) => tabs.open(ref));
              onCleanup(completion.dispose);
              const sync = (): void => {
                const p = tabs.passage.peek();
                completion.setText(p?.state === 'ready' ? p.value.ref : tabs.current.peek().wanted);
              };
              onCleanup(tabs.passage.subscribe(sync));
            }}
          />
        </Adw.HeaderBar>
        <Adw.TabBar $type="top" view={tabs.view} autohide />
        <Gtk.Box $={(self: Gtk.Box) => self.append(tabs.view)} vexpand />
      </Adw.ToolbarView>
    </Adw.NavigationPage>
  );
}
