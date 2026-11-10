// Fenêtre « Page imprimée » d'un amud du Talmud : image de l'édition choisie (Vilna par défaut,
// Venise, manuscrits), zoom (boutons, molette centrée sur le pointeur), déplacement en glissant,
// amud précédent / suivant, ouverture dans le navigateur.
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import { type Edition, siblingAmud } from '../shared/api.ts';
import type { SefariaClient } from '../shared/client.ts';
import { errorMessage } from '../shared/errors.ts';
import { asPaintable, CleanPage } from './CleanPage.ts';

/** Zoom relatif à la page entière (1 : page entière visible). */
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
/** facteur par cran de molette, et par clic sur les boutons */
const WHEEL_STEP = 1.15;
const BUTTON_STEP = 1.5;

/** Zoom borné. */
export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * Défilement qui garde sous le pointeur le même point de l'image après un zoom de `ratio`
 * (`value` : défilement actuel, `pointer` : position du pointeur dans la zone visible).
 */
export const anchoredScroll = (value: number, pointer: number, ratio: number): number => Math.max(0, (value + pointer) * ratio - pointer);

/** Défilement à `value` une fois la nouvelle taille calculée (bornes de l'ajustement à jour). */
function scrollWhenResized(adj: Gtk.Adjustment, value: number): void {
  const id = adj.connect('changed', () => {
    adj.disconnect(id);
    adj.value = Math.min(value, adj.upper - adj.pageSize);
  });
}

export function openPageViewer(parent: Gtk.Window | null, client: SefariaClient, amud: string): void {
  const win = new Adw.Window({ defaultWidth: 760, defaultHeight: 900, ...(parent === null ? {} : { transientFor: parent }) });
  const title = new Adw.WindowTitle({ title: 'Page imprimée' });
  const header = new Adw.HeaderBar({ titleWidget: title });
  const prev = new Gtk.Button({ iconName: 'go-previous-symbolic', tooltipText: 'Amud précédent' });
  const next = new Gtk.Button({ iconName: 'go-next-symbolic', tooltipText: 'Amud suivant' });
  header.pack_start(prev);
  header.pack_start(next);
  const names = Gtk.StringList.new([]);
  const edition = new Gtk.DropDown({ model: names, tooltipText: 'Édition' });
  header.pack_end(edition);
  const browser = new Gtk.Button({ iconName: 'web-browser-symbolic', tooltipText: 'Ouvrir l’image dans le navigateur' });
  header.pack_end(browser);
  const zoomOut = new Gtk.Button({ iconName: 'zoom-out-symbolic', tooltipText: 'Réduire' });
  const zoomIn = new Gtk.Button({ iconName: 'zoom-in-symbolic', tooltipText: 'Agrandir' });
  const zoomBox = new Gtk.Box({ cssClasses: ['linked'] });
  zoomBox.append(zoomOut);
  zoomBox.append(zoomIn);
  header.pack_end(zoomBox);

  const pagesBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, halign: Gtk.Align.CENTER, marginTop: 8, marginBottom: 8 });
  const scroller = new Gtk.ScrolledWindow({ child: pagesBox, hscrollbarPolicy: Gtk.PolicyType.NEVER, vexpand: true });
  const stack = new Gtk.Stack();
  stack.add_named(new Adw.Spinner({ widthRequest: 32, heightRequest: 32, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER }), 'loading');
  const error = new Adw.StatusPage({ iconName: 'image-missing-symbolic', title: 'Page indisponible' });
  stack.add_named(error, 'error');
  stack.add_named(scroller, 'pages');
  const view = new Adw.ToolbarView({ content: stack });
  view.add_top_bar(header);
  win.content = view;
  // thème : encre noire (clair) ou blanche (sombre) des pages nettoyées
  const style = Adw.StyleManager.get_default();
  const themeId = style.connect('notify::dark', () => {
    for (const c of cleanPages) c.update(c.texture, style.dark);
  });
  win.connect('destroy', () => style.disconnect(themeId));

  let current = amud;
  let editions: Edition[] = [];
  let zoom = 1;
  /** dernière position du pointeur dans la zone visible (centre du zoom à la molette) */
  let pointer: { x: number; y: number } | null = null;
  /** chargement en cours (un plus récent rend les précédents caducs) */
  let generation = 0;
  let filling = false;
  const pictures: Gtk.Picture[] = [];
  const images = new Map<string, Gdk.Texture>();
  const cleanPages: InstanceType<typeof CleanPage>[] = [];

  const applyZoom = (): void => {
    // zoom 1 : page entière visible (largeur et hauteur de la zone)
    const first = pictures[0]?.paintable ?? null;
    const aspect = first === null ? 1.6 : first.get_intrinsic_height() / Math.max(1, first.get_intrinsic_width());
    const width = Math.max(200, Math.min(scroller.get_width() - 24, (scroller.get_height() - 16) / aspect));
    scroller.hscrollbarPolicy = zoom > 1.001 ? Gtk.PolicyType.AUTOMATIC : Gtk.PolicyType.NEVER;
    for (const p of pictures) {
      // hauteur imposée aussi : sans elle, l'image élargie resterait dans sa hauteur d'origine (réduite)
      const t = p.paintable;
      const ratio = t === null ? 1.6 : t.get_intrinsic_height() / Math.max(1, t.get_intrinsic_width());
      p.widthRequest = Math.round(width * zoom);
      p.heightRequest = Math.round(width * zoom * ratio);
    }
    zoomOut.sensitive = zoom > ZOOM_MIN + 0.001;
    zoomIn.sensitive = zoom < ZOOM_MAX - 0.001;
    scroller.set_cursor_from_name(zoom > 1.001 ? 'grab' : null);
  };

  /** Zoom à `next`, le point `at` (zone visible ; défaut : centre) restant fixe à l'écran. */
  const zoomTo = (wanted: number, at: { x: number; y: number } | null): void => {
    const target = clampZoom(wanted);
    if (Math.abs(target - zoom) < 0.001) return;
    const ratio = target / zoom;
    const h = scroller.hadjustment;
    const v = scroller.vadjustment;
    const point = at ?? { x: h.pageSize / 2, y: v.pageSize / 2 };
    const x = anchoredScroll(h.value, point.x, ratio);
    const y = anchoredScroll(v.value, point.y, ratio);
    zoom = target;
    applyZoom();
    scrollWhenResized(h, x);
    scrollWhenResized(v, y);
  };

  /** Image affichée telle quelle, ou nettoyée selon le thème. */
  const show = (picture: Gtk.Picture, clean: InstanceType<typeof CleanPage> | null, texture: Gdk.Texture): void => {
    if (clean === null) picture.paintable = texture;
    else clean.update(texture, style.dark);
  };

  /** Image chargée (cache de la fenêtre), affichée si la page n'a pas changé entre-temps. */
  const loadImage = (picture: Gtk.Picture, clean: InstanceType<typeof CleanPage> | null, url: string, gen: number): void => {
    void (async () => {
      try {
        const texture = Gdk.Texture.new_from_bytes(await client.bytes(url));
        images.set(url, texture);
        if (gen === generation) {
          show(picture, clean, texture);
          applyZoom();
        }
      } catch (e) {
        if (gen === generation) picture.alternativeText = `Image indisponible : ${errorMessage(e)}`;
      }
    })();
  };

  const showEdition = (): void => {
    const e = editions[edition.selected];
    for (let c = pagesBox.get_first_child(); c !== null; c = pagesBox.get_first_child()) pagesBox.remove(c);
    pictures.length = 0;
    cleanPages.length = 0;
    if (e === undefined) return;
    browser.sensitive = e.pages.length > 0;
    const gen = generation;
    for (const page of e.pages) {
      const picture = new Gtk.Picture({ canShrink: true, contentFit: Gtk.ContentFit.CONTAIN, alternativeText: `${e.title} · ${page.label}` });
      // édition nettoyée : la photo est dessinée à travers la matrice de couleur (encre seule)
      const clean = e.clean === true ? new CleanPage() : null;
      if (clean !== null) {
        cleanPages.push(clean);
        picture.paintable = asPaintable(clean);
      }
      pictures.push(picture);
      pagesBox.append(picture);
      if (e.pages.length > 1) pagesBox.append(new Gtk.Label({ label: page.label, cssClasses: ['caption', 'dim-label'] }));
      const cached = images.get(page.url);
      if (cached !== undefined) {
        show(picture, clean, cached);
        continue;
      }
      // en attente de l'image : proportions d'une page
      loadImage(picture, clean, page.url, gen);
    }
    applyZoom();
  };

  const load = (): void => {
    generation += 1;
    const gen = generation;
    title.title = 'Page imprimée';
    title.subtitle = current;
    win.title = `Page imprimée · ${current}`;
    prev.sensitive = siblingAmud(current, -1) !== null;
    next.sensitive = siblingAmud(current, 1) !== null;
    stack.visibleChildName = 'loading';
    void (async () => {
      try {
        // Torah-Box en tête (meilleure qualité) ; Sefaria injoignable : Torah-Box seule
        const found = await client.manuscripts(current);
        if (gen !== generation) return;
        if (found.length === 0) {
          error.description = `Aucune page imprimée pour ${current}.`;
          stack.visibleChildName = 'error';
          return;
        }
        // même édition qu'avant si disponible
        const previous = editions[edition.selected]?.slug;
        editions = found;
        filling = true;
        names.splice(0, names.get_n_items(), found.map((e) => e.title));
        edition.selected = Math.max(0, found.findIndex((e) => e.slug === previous));
        filling = false;
        stack.visibleChildName = 'pages';
        showEdition();
      } catch (e) {
        if (gen !== generation) return;
        error.description = errorMessage(e);
        stack.visibleChildName = 'error';
      }
    })();
  };

  edition.connect('notify::selected', () => {
    if (!filling) showEdition();
  });
  prev.connect('clicked', () => {
    const s = siblingAmud(current, -1);
    if (s !== null) {
      current = s;
      load();
    }
  });
  next.connect('clicked', () => {
    const s = siblingAmud(current, 1);
    if (s !== null) {
      current = s;
      load();
    }
  });
  zoomIn.connect('clicked', () => zoomTo(zoom * BUTTON_STEP, null));
  zoomOut.connect('clicked', () => zoomTo(zoom / BUTTON_STEP, null));

  // molette : zoom centré sur le pointeur (le défilement se fait en glissant l'image)
  const motion = new Gtk.EventControllerMotion();
  motion.connect('motion', (_m: Gtk.EventControllerMotion, x: number, y: number) => {
    pointer = { x, y };
  });
  motion.connect('leave', () => {
    pointer = null;
  });
  scroller.add_controller(motion);
  const wheel = new Gtk.EventControllerScroll({ flags: Gtk.EventControllerScrollFlags.VERTICAL, propagationPhase: Gtk.PropagationPhase.CAPTURE });
  wheel.connect('scroll', (_w: Gtk.EventControllerScroll, _dx: number, dy: number) => {
    if (dy === 0) return false;
    zoomTo(zoom * WHEEL_STEP ** -dy, pointer);
    return true;
  });
  scroller.add_controller(wheel);

  // glisser : déplacement dans l'image
  const drag = new Gtk.GestureDrag();
  let start = { x: 0, y: 0 };
  drag.connect('drag-begin', () => {
    start = { x: scroller.hadjustment.value, y: scroller.vadjustment.value };
    scroller.set_cursor_from_name('grabbing');
  });
  drag.connect('drag-update', (_d: Gtk.GestureDrag, dx: number, dy: number) => {
    scroller.hadjustment.value = start.x - dx;
    scroller.vadjustment.value = start.y - dy;
  });
  drag.connect('drag-end', () => scroller.set_cursor_from_name(zoom > 1.001 ? 'grab' : null));
  scroller.add_controller(drag);
  browser.connect('clicked', () => {
    const page = editions[edition.selected]?.pages[0];
    if (page !== undefined) new Gtk.UriLauncher({ uri: page.url }).launch(win, null, null);
  });
  // largeur de la fenêtre modifiée : images recalculées
  scroller.hadjustment.connect('notify::page-size', applyZoom);
  scroller.vadjustment.connect('notify::page-size', applyZoom);
  const keys = new Gtk.EventControllerKey();
  keys.connect('key-pressed', (_k: Gtk.EventControllerKey, keyval: number) => {
    if (keyval !== Gdk.KEY_Escape) return false;
    win.close();
    return true;
  });
  win.add_controller(keys);
  load();
  win.present();
}
