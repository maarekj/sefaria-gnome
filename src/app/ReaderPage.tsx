// Page de lecture : saisie d'une référence, passage en hébreu et en traduction, segment par segment.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import { createComputed, createState, onCleanup } from 'gnim';
import type { Passage, Segment } from '../shared/api.ts';
import { sefariaMarkup } from '../shared/markup.ts';
import type { SettingsStore } from '../shared/settings.ts';
import type { Store } from '../shared/store.ts';

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
    justify: hebrew ? Gtk.Justification.RIGHT : Gtk.Justification.LEFT,
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

function segmentRow(s: Segment): Gtk.Widget {
  const row = new Gtk.Box({ spacing: 12, cssClasses: ['segment'] });
  row.append(new Gtk.Label({ label: s.label, valign: Gtk.Align.START, xalign: 0, cssClasses: ['segment-number', 'dim-label'] }));
  const texts = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, hexpand: true });
  if (s.he !== '') texts.append(textLabel(sefariaMarkup(s.he), true));
  if (s.en !== '') texts.append(textLabel(sefariaMarkup(s.en), false));
  row.append(texts);
  return row;
}

function fill(box: Gtk.Box, p: Passage, columns: boolean): void {
  for (let c = box.get_first_child(); c !== null; c = box.get_first_child()) box.remove(c);
  for (const s of p.segments) box.append(columns ? segmentColumns(s) : segmentRow(s));
  const versions = [p.heVersion, p.enVersion].filter((v) => v !== '').join(' · ');
  if (versions !== '') box.append(new Gtk.Label({ label: versions, wrap: true, marginTop: 18, cssClasses: ['caption', 'dim-label'] }));
}

export function ReaderPage({ store, settings }: { store: Store; settings: SettingsStore }): JSX.Element {
  /** largeur disponible pour le texte (repli en mode empilé si trop étroit) */
  const [width, setWidth] = createState(10_000);
  const columns = createComputed(() => settings.value().twoColumns && width() >= TWO_COLUMNS_MIN_WIDTH);
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
          <Gtk.ToggleButton
            $type="end"
            iconName="view-dual-symbolic"
            tooltipText="Deux colonnes"
            active={settings.value((s) => s.twoColumns)}
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
                      fill(self, p, columns.peek());
                      scroller?.vadjustment.set_value(0);
                    }),
                  );
                  // changement de mode : même passage, même position de défilement
                  onCleanup(
                    columns.subscribe(() => {
                      const p = ready();
                      if (p !== null) fill(self, p, columns.peek());
                    }),
                  );
                }}
              />
            </Adw.Clamp>
          </Gtk.ScrolledWindow>
        </Gtk.Stack>
      </Adw.ToolbarView>
    </Adw.NavigationPage>
  );
}
