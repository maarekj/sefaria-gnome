// Page de lecture : saisie d'une référence, passage en hébreu et en traduction, segment par segment.
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import { type Accessor, createComputed, createState, onCleanup } from 'gnim';
import { isAmud, type Passage, type Segment, segmentRef } from '../shared/api.ts';
import { chapterTitle, passageItems } from '../shared/chapters.ts';
import { Lru } from '../shared/lru.ts';
import { sefariaMarkup, withDirection } from '../shared/markup.ts';
import type { Display, SettingsStore } from '../shared/settings.ts';
import type { AiState, Reader } from '../shared/reader.ts';
import type { ReadingStore } from '../shared/userdata.ts';
import { linksPanel } from './LinksPanel.ts';
import { pageImages } from './PageImages.ts';
import { type PageView, pageView } from './PageView.ts';
import { attachCompletion } from './RefCompletion.ts';
import type { Tabs } from './Tabs.ts';
import { versionsMenu } from './VersionsMenu.ts';

/** Largeur de texte minimale (px) pour afficher deux colonnes ; en dessous : empilé. */
export const TWO_COLUMNS_MIN_WIDTH = 700;

/** Page affichée selon l'état du passage. */
export const readerScreen = (p: ReturnType<Reader['passage']>): 'empty' | 'loading' | 'error' | 'text' => (p === null ? 'empty' : p.state === 'ready' ? 'text' : p.state);

/** Balisage Pango des textes déjà affichés (changement de mode, retour à un passage : pas recalculé). */
const markups = new Lru<string, string>(4000);
const markupOf = (html: string): string => {
  let m = markups.get(html);
  if (m === undefined) {
    m = sefariaMarkup(html);
    markups.set(html, m);
  }
  return m;
};

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
  if (s.en !== '') en.append(textLabel(markupOf(s.en), false));
  const he = new Gtk.Box({ spacing: 12, valign: Gtk.Align.START });
  he.append(s.he === '' ? new Gtk.Box({ hexpand: true }) : textLabel(markupOf(s.he), true));
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
  if (s.he !== '' && display !== 'translation') texts.append(textLabel(markupOf(s.he), true));
  if (s.en !== '' && display !== 'hebrew') texts.append(textLabel(markupOf(s.en), false));
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

/**
 * Segments construits d'un coup au premier affichage, puis un lot par image (la mise en page d'un
 * segment coûte ≈ 2 ms : 176 versets d'un coup figeaient l'interface ≈ 0,4 s).
 */
export const FILL_FIRST = 15;
export const FILL_BATCH = 12;

/** Remplissage en cours d'une boîte (le suivant l'annule). */
const filling = new WeakMap<Gtk.Box, number>();

/**
 * Remplit `box` avec le passage ; `ai` : traductions par IA (numéro → texte) remplaçant celles de
 * Sefaria, et leur auteur. Les premiers segments sont construits tout de suite, les suivants par
 * lots en tâche de fond (`progress` après chacun) : un long passage ne fige pas l'interface.
 */
export function fill(box: Gtk.Box, p: Passage, layout: Layout, select: (ref: string) => void, ai: { values: Readonly<Record<string, string>>; label: string } | null, progress?: () => void): SegmentWidgets {
  const widgets: SegmentWidgets = new Map();
  const pending = filling.get(box);
  if (pending !== undefined) GLib.source_remove(pending);
  filling.delete(box);
  for (let c = box.get_first_child(); c !== null; c = box.get_first_child()) box.remove(c);
  const { display } = layout;
  // texte demandé absent (ex. pas de traduction) : l'autre est affiché plutôt qu'une page vide
  const hasTranslation = ai !== null || p.enVersion !== '';
  const shown: Display = display === 'translation' && !hasTranslation ? 'hebrew' : display === 'hebrew' && p.heVersion === '' ? 'translation' : display;
  // traduction par IA : HTML limité (gras, italique), assaini par sefariaMarkup comme le texte de Sefaria ;
  // segment non traduit par l'IA : rien plutôt que le texte de Sefaria (pas de mélange sous la mention « IA »)
  const segs = ai === null ? p.segments : p.segments.map((s) => ({ ...s, en: ai.values[s.label] ?? '' }));
  const visible = segs.filter((s) => !(shown === 'hebrew' && s.he === '') && !(shown === 'translation' && s.en === ''));
  const items = passageItems(visible, p.multiChapter);
  const build = (item: (typeof items)[number]): void => {
    if (item.kind === 'chapter') {
      const heading = chapterHeading(item.chapter, shown, layout.columns && shown === 'both');
      if (heading !== null) box.append(heading);
      return;
    }
    const ref = segmentRef(p, item.segment.label);
    const w = clickable(layout.columns && shown === 'both' ? segmentColumns(item.segment, item.number) : segmentRow(item.segment, shown, item.number), () => select(ref));
    widgets.set(ref, w);
    box.append(w);
  };
  const finish = (): void => {
    const versions = [shown === 'translation' ? '' : p.heVersion, shown === 'hebrew' ? '' : ai === null ? p.enVersion : `Traduction par IA : ${ai.label}`].filter((v) => v !== '').join(' · ');
    if (versions !== '') box.append(new Gtk.Label({ label: versions, wrap: true, marginTop: 18, cssClasses: ['caption', 'dim-label'] }));
  };
  let next = Math.min(FILL_FIRST, items.length);
  for (const item of items.slice(0, next)) build(item);
  if (next >= items.length) {
    finish();
    return widgets;
  }
  // un lot toutes les 16 ms (≈ une image) : un rappel inactif en enchaînerait plusieurs avant la mise
  // en page ; un rappel d'image (tick) ne viendrait pas dans un onglet caché
  const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 16, () => {
    const end = Math.min(items.length, next + FILL_BATCH);
    for (const item of items.slice(next, end)) build(item);
    next = end;
    const done = next >= items.length;
    if (done) {
      filling.delete(box);
      finish();
    }
    progress?.();
    return done ? GLib.SOURCE_REMOVE : GLib.SOURCE_CONTINUE;
  });
  filling.set(box, id);
  return widgets;
}

/** Contenu d'un onglet : passage et panneau des liens de ses segments. */
export function ReaderView({
  reader,
  tabs,
  settings,
  linksCollapsed,
  narrow,
}: {
  reader: Reader;
  tabs: Tabs;
  settings: SettingsStore;
  linksCollapsed: Accessor<boolean>;
  narrow: Accessor<boolean>;
}): Gtk.Widget {
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
    // résultat de recherche : défilement jusqu'au segment, une fois sa mise en page faite
    const target = highlighted;
    if (target !== undefined && reader.takeReveal()) {
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
        const content = scroller?.child;
        const [ok, bounds] = content === null || content === undefined ? [false, null] : target.compute_bounds(content);
        if (ok && bounds !== null && scroller !== null) scroller.vadjustment.set_value(Math.max(0, bounds.get_y() - 24));
        return GLib.SOURCE_REMOVE;
      });
    }
  };
  /** sélection (un clic sur le segment déjà sélectionné, ex. pour en sélectionner le texte, ne ferme rien) */
  const select = (ref: string): void => reader.select(ref);
  const render = (box: Gtk.Box, p: Passage): void => {
    const a = reader.ai.peek();
    segments = fill(box, p, layout(), select, a.state === 'ready' && a.ref === p.ref ? a : null, () => {
      // segment sélectionné construit dans un lot suivant
      if (highlighted === undefined && reader.selected.peek() !== null) highlight();
    });
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
      <Gtk.Box orientation={Gtk.Orientation.VERTICAL}>
      <Adw.Banner
        title={reader.ai((a) => (a.state === 'loading' ? `Traduction par ${a.tool} en cours…` : a.state === 'error' ? a.message : ''))}
        buttonLabel={reader.ai((a) => (a.state === 'loading' ? 'Annuler' : 'Fermer'))}
        revealed={reader.ai((a) => a.state === 'loading' || a.state === 'error')}
        onButtonClicked={() => reader.cancelAi()}
      />
      <Gtk.Stack vexpand visibleChildName={reader.passage(readerScreen)} transitionType={Gtk.StackTransitionType.CROSSFADE}>
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
                // traduction par IA : seulement quand celle affichée change (pas pour « en cours », ni « erreur »)
                const shownAi = (): AiState | null => {
                  const a = reader.ai.peek();
                  const p = ready();
                  return a.state === 'ready' && p !== null && a.ref === p.ref ? a : null;
                };
                let lastAi = shownAi();
                onCleanup(
                  reader.passage.subscribe(() => {
                    const p = ready();
                    if (p === null) return;
                    lastAi = shownAi();
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
                // traduction par IA : seulement quand celle affichée change (pas pour « en cours », ni « erreur »)
                onCleanup(
                  reader.ai.subscribe(() => {
                    const a = shownAi();
                    if (a === lastAi) return;
                    lastAi = a;
                    relayout();
                  }),
                );
                // segment sélectionné : mis en évidence
                onCleanup(reader.selected.subscribe(highlight));
              }}
            />
          </Adw.Clamp>
        </Gtk.ScrolledWindow>
      </Gtk.Stack>
      </Gtk.Box>
    </Adw.OverlaySplitView>
  );
  if (!(view instanceof Gtk.Widget)) throw new TypeError('widget attendu');
  return withPagePane(view, reader, tabs, narrow);
}

/**
 * Volet « Page imprimée » à gauche du texte (redimensionnable), créé à la première ouverture ; agrandi
 * (ou fenêtre étroite) : la page occupe tout l'onglet.
 */
function withPagePane(text: Gtk.Widget, reader: Reader, tabs: Tabs, narrow: Accessor<boolean>): Gtk.Widget {
  const paned = new Gtk.Paned({ orientation: Gtk.Orientation.HORIZONTAL, endChild: text, resizeStartChild: true, resizeEndChild: true, shrinkStartChild: false, shrinkEndChild: false, wideHandle: true });
  let pane: PageView | null = null;
  /** amud du passage affiché, ou demandé (la page suit dès la navigation) ; null sinon */
  const amud = (): string | null => {
    const p = reader.passage.peek();
    if (p?.state === 'ready') return isAmud(p.value.sectionRef) ? p.value.sectionRef : null;
    const wanted = reader.wanted.replace(/:[^:]*$/u, '');
    return isAmud(wanted) ? wanted : null;
  };
  const sync = (): void => {
    const on = reader.pageOn.peek();
    if (on && pane === null) {
      pane = pageView(tabs.store.client, pageImages(tabs.store.client), {
        navigate: (ref) => reader.open(ref),
        maximized: () => reader.pageMax.peek(),
        setMaximized: (m) => reader.setPageMax(m),
        close: () => reader.setPage(false),
      });
      paned.startChild = pane.widget;
      // moitié de la largeur à l'ouverture
      paned.position = Math.round(paned.get_width() * 0.45);
    }
    if (pane !== null) {
      pane.widget.visible = on;
      if (on) pane.setAmud(amud());
      else pane.hide();
    }
    const full = on && (reader.pageMax.peek() || narrow.peek());
    text.visible = !full;
  };
  sync();
  // racine de l'onglet : libérée à sa fermeture (`destroy` ne viendrait jamais, `narrow` retenant le volet)
  for (const s of [reader.pageOn, reader.pageMax, reader.passage, narrow]) onCleanup(s.subscribe(sync));
  onCleanup(() => pane?.dispose());
  return paned;
}

/** Page de lecture : barre d'en-tête (onglet affiché), barre d'onglets, onglets. */
export function ReaderPage({ tabs, settings, narrow, reading }: { tabs: Tabs; settings: SettingsStore; narrow: Accessor<boolean>; reading: ReadingStore }): JSX.Element {
  /** passage affiché en signet */
  const bookmarked = createComputed(() => {
    const p = tabs.passage();
    return p?.state === 'ready' && reading.value().bookmarks.some((b) => b.ref === p.value.ref);
  });
  const versions = versionsMenu(tabs.current, settings, (book) => tabs.reloadBook(book));
  /** volet de la page imprimée ouvert dans l'onglet affiché */
  const pageOn = createComputed(() => tabs.current().pageOn());
  onCleanup(versions.dispose);
  const ready = (): Passage | null => {
    const p = tabs.passage.peek();
    return p?.state === 'ready' ? p.value : null;
  };
  return (
    <Adw.NavigationPage title="Lecture">
      <Adw.ToolbarView>
        <Adw.HeaderBar $type="top" decorationLayout={narrow((n) => (n ? ":close" : (Gtk.Settings.get_default()?.gtkDecorationLayout ?? ":minimize,maximize,close")))}>
          <Gtk.ToggleButton $type="start" iconName="sidebar-show-symbolic" tooltipText="Afficher la bibliothèque (F9)" actionName="win.toggle-sidebar" />
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
            iconName="image-x-generic-symbolic"
            tooltipText="Page imprimée"
            visible={tabs.passage((p) => p?.state === 'ready' && isAmud(p.value.sectionRef))}
            active={pageOn}
            onToggled={(self: Gtk.ToggleButton) => {
              const r = tabs.current.peek();
              if (self.active !== r.pageOn.peek()) r.setPage(self.active);
            }}
          />
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
