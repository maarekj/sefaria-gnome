// Page « nettoyée » : photo d'une page imprimée rendue en encre seule sur fond transparent, par une
// matrice de couleur appliquée au dessin (carte graphique) : ni traitement d'image ni cache.
// La luminosité de chaque pixel devient l'opacité de l'encre : papier (clair) transparent, encre
// (sombre) opaque, contraste étiré entre les deux seuils ; encre noire ou blanche selon le thème.
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gtk from 'gi://Gtk?version=4.0';

/** Seuils de luminosité (0 noir, 1 blanc) mesurés sur les photos de Vilna de Sefaria. */
export const PAPER = 0.7;
export const INK = 0.3;

/**
 * Coefficients de la matrice : opacité = (PAPER − luminance) / (PAPER − INK), bornée à [0, 1] par
 * GTK ; couleur = `ink` (0 noir, 1 blanc). Renvoie la matrice (ligne par ligne) et le décalage.
 */
export function cleanMatrix(ink: 0 | 1): { matrix: number[]; offset: [number, number, number, number] } {
  const a = 1 / (PAPER - INK);
  // luminance (Rec. 601) → opacité ; la couleur d'entrée n'influe pas sur la couleur de sortie
  const matrix = [0, 0, 0, -a * 0.299, 0, 0, 0, -a * 0.587, 0, 0, 0, -a * 0.114, 0, 0, 0, 0];
  return { matrix, offset: [ink, ink, ink, a * PAPER] };
}

/** Rectangle d'une image `w`×`h` contenue dans `width`×`height`, proportions gardées et centrée. */
export function containRect(w: number, h: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
  if (w <= 0 || h <= 0) return { x: 0, y: 0, width, height };
  const scale = Math.min(width / w, height / h);
  return { x: (width - w * scale) / 2, y: (height - h * scale) / 2, width: w * scale, height: h * scale };
}

/** Objet vu comme Gdk.Paintable (interface implémentée par CleanPage). */
export function asPaintable(o: GObject.Object): Gdk.Paintable {
  if (!(o instanceof Gdk.Paintable)) throw new TypeError('Gdk.Paintable attendu');
  return o;
}

/** Paintable de la page : texture d'origine dessinée à travers la matrice. */
export const CleanPage = GObject.registerClass(
  { GTypeName: 'SefariaCleanPage', Implements: [Gdk.Paintable] },
  class CleanPage extends GObject.Object {
    // déclarés sans initialiseur : les champs initialisés d'une sous-classe GObject passeraient
    // avant la construction de l'objet GObject (GJS)
    declare texture: Gdk.Texture | null;
    declare dark: boolean;

    constructor() {
      super();
      this.texture = null;
      this.dark = false;
    }

    /** Texture et thème ; redessin demandé. */
    update(texture: Gdk.Texture | null, dark: boolean): void {
      const resized = texture?.get_width() !== this.texture?.get_width() || texture?.get_height() !== this.texture?.get_height();
      this.texture = texture;
      this.dark = dark;
      const paintable = asPaintable(this);
      if (resized) paintable.invalidate_size();
      paintable.invalidate_contents();
    }

    vfunc_snapshot(snapshot: Gdk.Snapshot, width: number, height: number): void {
      if (this.texture === null || !(snapshot instanceof Gtk.Snapshot)) return;
      // proportions de la page gardées, centrée dans la zone (GTK ne le fait pas pour un paintable maison)
      const fit = containRect(this.texture.get_width(), this.texture.get_height(), width, height);
      const { matrix, offset } = cleanMatrix(this.dark ? 1 : 0);
      snapshot.save();
      snapshot.translate(new Graphene.Point({ x: fit.x, y: fit.y }));
      snapshot.push_color_matrix(new Graphene.Matrix().init_from_float(matrix), new Graphene.Vec4().init(...offset));
      this.texture.snapshot(snapshot, fit.width, fit.height);
      snapshot.pop();
      snapshot.restore();
    }

    vfunc_get_intrinsic_width(): number {
      return this.texture?.get_width() ?? 0;
    }

    vfunc_get_intrinsic_height(): number {
      return this.texture?.get_height() ?? 0;
    }

    vfunc_get_intrinsic_aspect_ratio(): number {
      const t = this.texture;
      return t === null ? 0 : t.get_width() / Math.max(1, t.get_height());
    }
  },
);
