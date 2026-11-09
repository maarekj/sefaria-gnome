// Page de lecture : saisie d'une référence, passage en hébreu et en traduction, segment par segment.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import { createComputed, createState, onCleanup } from 'gnim';
import type { Passage, Segment } from '../shared/api.ts';
import { sefariaMarkup } from '../shared/markup.ts';
import type { Display, SettingsStore } from '../shared/settings.ts';
import type { Store } from '../shared/store.ts';
import { scaleLabel } from './TextScale.ts';
import { versionsMenu } from './VersionsMenu.ts';

/** Largeur de texte minimale (px) pour afficher deux colonnes ; en dessous : empilé. */
export const TWO_COLUMNS_MIN_WIDTH = 700;

/** Page affichée selon l'état du passage. */
export const readerScreen = (p: ReturnType<Store['passage']>): 'empty' | 'loading' | 'error' | 'text' => (p === null ? 'empty' : p.state === 'ready' ? 'text' : p.state);

/** Libellé d'un texte ; l'hébreu est aligné à droite (direction RTL détectée par Pango). */
function textLabel(markup: string, hebrew: boolean): Gtk.Label {
  const label = new Gtk.Label({
    useMarkup: true,
    label: markup,
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
function segmentColumns(s: Segment): Gtk.Widget {
  const row = new Gtk.Box({ homogeneous: true, spacing: 24, cssClasses: ['segment', 'two-columns'] });
  const en = new Gtk.Box({ valign: Gtk.Align.START });
  if (s.en !== '') en.append(textLabel(sefariaMarkup(s.en), false));
  const he = new Gtk.Box({ spacing: 12, valign: Gtk.Align.START });
  he.append(s.he === '' ? new Gtk.Box({ hexpand: true }) : textLabel(sefariaMarkup(s.he), true));
  he.append(new Gtk.Label({ label: s.label, valign: Gtk.Align.START, xalign: 1, cssClasses: ['segment-number', 'dim-label'] }));
  row.append(he);
  row.append(en);
  return row;
}

/** Segment empilé ; hébreu seul : numéro en marge droite. */
function segmentRow(s: Segment, display: Display): Gtk.Widget {
  const row = new Gtk.Box({ spacing: 12, cssClasses: ['segment'] });
  const number = new Gtk.Label({ label: s.label, valign: Gtk.Align.START, xalign: display === 'hebrew' ? 1 : 0, cssClasses: ['segment-number', 'dim-label'] });
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

function fill(box: Gtk.Box, p: Passage, layout: Layout): void {
  for (let c = box.get_first_child(); c !== null; c = box.get_first_child()) box.remove(c);
  const { display } = layout;
  // texte demandé absent (ex. pas de traduction) : l'autre est affiché plutôt qu'une page vide
  const shown: Display = display === 'translation' && p.enVersion === '' ? 'hebrew' : display === 'hebrew' && p.heVersion === '' ? 'translation' : display;
  for (const s of p.segments) {
    if (shown === 'hebrew' && s.he === '') continue;
    if (shown === 'translation' && s.en === '') continue;
    box.append(layout.columns && shown === 'both' ? segmentColumns(s) : segmentRow(s, shown));
  }
  const versions = [shown === 'translation' ? '' : p.heVersion, shown === 'hebrew' ? '' : p.enVersion].filter((v) => v !== '').join(' · ');
  if (versions !== '') box.append(new Gtk.Label({ label: versions, wrap: true, marginTop: 18, cssClasses: ['caption', 'dim-label'] }));
}

export function ReaderPage({ store, settings }: { store: Store; settings: SettingsStore }): JSX.Element {
  /** largeur disponible pour le texte (repli en mode empilé si trop étroit) */
  const [width, setWidth] = createState(10_000);
  const columns = createComputed(() => settings.value().twoColumns && settings.value().display === 'both' && width() >= TWO_COLUMNS_MIN_WIDTH);
  const display = createComputed(() => settings.value().display);
  const layout = (): Layout => ({ display: display.peek(), columns: columns.peek() });
  const versions = versionsMenu(store, settings);
  onCleanup(versions.dispose);
  const ready = (): Passage | null => {
    const p = store.passage.peek();
    return p?.state === 'ready' ? p.value : null;
  };
  let scroller: Gtk.ScrolledWindow | null = null;
  return (
    <Adw.NavigationPage title="Lecture">
      <Adw.ToolbarView>
        <Adw.HeaderBar $type="top">
          <Gtk.Button
            $type="start"
            iconName="go-previous-symbolic"
            tooltipText="Section précédente"
            sensitive={store.passage((p) => p?.state === 'ready' && p.value.prev !== null)}
            onClicked={() => {
              const prev = ready()?.prev;
              if (prev !== undefined && prev !== null) store.open(prev);
            }}
          />
          <Gtk.Button
            $type="start"
            iconName="go-next-symbolic"
            tooltipText="Section suivante"
            sensitive={store.passage((p) => p?.state === 'ready' && p.value.next !== null)}
            onClicked={() => {
              const next = ready()?.next;
              if (next !== undefined && next !== null) store.open(next);
            }}
          />
          <Adw.WindowTitle
            $type="title"
            title={store.passage((p) => (p?.state === 'ready' ? p.value.ref : 'Sefaria'))}
            subtitle={store.passage((p) => (p?.state === 'ready' ? p.value.heRef : ''))}
          />
          <Gtk.Box $type="end" $={(self: Gtk.Box) => self.append(versions.button)} />
          <Gtk.MenuButton $type="end" label="Aa" tooltipText="Taille du texte">
            <Gtk.Popover>
              <Gtk.Box spacing={6} cssClasses={['text-scale']}>
                <Gtk.Button label="A−" tooltipText="Réduire le texte" actionName="app.text-smaller" cssClasses={['flat', 'text-smaller']} />
                <Gtk.Button label={settings.value((s) => scaleLabel(s.textScale))} tooltipText="Taille par défaut" actionName="app.text-reset" cssClasses={['flat', 'scale-value']} />
                <Gtk.Button label="A+" tooltipText="Agrandir le texte" actionName="app.text-larger" cssClasses={['flat', 'text-larger']} />
              </Gtk.Box>
            </Gtk.Popover>
          </Gtk.MenuButton>
          <Gtk.ToggleButton
            $type="end"
            iconName="view-dual-symbolic"
            tooltipText="Deux colonnes"
            active={settings.value((s) => s.twoColumns)}
            sensitive={settings.value((s) => s.display === 'both')}
            onToggled={(self: Gtk.ToggleButton) => {
              if (self.active !== settings.value.peek().twoColumns) settings.update({ twoColumns: self.active });
            }}
          />
          <Gtk.SearchEntry
            $type="end"
            name="ref-entry"
            placeholderText="Référence (ex. Genesis 1)"
            tooltipText="Aller à une référence"
            cssClasses={['ref-entry']}
            $={(self: Gtk.SearchEntry) => {
              self.connect('activate', () => store.open(self.text));
              onCleanup(
                store.passage.subscribe(() => {
                  const p = ready();
                  if (p !== null) self.text = p.ref;
                }),
              );
            }}
          />
        </Adw.HeaderBar>
        <Gtk.Stack visibleChildName={store.passage(readerScreen)} transitionType={Gtk.StackTransitionType.CROSSFADE}>
          <Adw.StatusPage $type="named" name="empty" iconName="accessories-dictionary-symbolic" title="Choisissez un texte" description="Parcourez la bibliothèque ou saisissez une référence." />
          <Adw.Spinner $type="named" name="loading" widthRequest={32} heightRequest={32} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
          <Adw.StatusPage $type="named" name="error" iconName="dialog-warning-symbolic" title="Texte introuvable" description={store.passage((p) => (p?.state === 'error' ? p.message : ''))} />
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
                    store.passage.subscribe(() => {
                      const p = ready();
                      if (p === null) return;
                      fill(self, p, layout());
                      scroller?.vadjustment.set_value(0);
                    }),
                  );
                  // changement de mode : même passage, même position de défilement
                  const relayout = (): void => {
                    const p = ready();
                    if (p !== null) fill(self, p, layout());
                  };
                  onCleanup(columns.subscribe(relayout));
                  onCleanup(display.subscribe(relayout));
                }}
              />
            </Adw.Clamp>
          </Gtk.ScrolledWindow>
        </Gtk.Stack>
      </Adw.ToolbarView>
    </Adw.NavigationPage>
  );
}
