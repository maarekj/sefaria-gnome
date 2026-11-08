// Taille du texte lu (A+ / A-) : paliers d'échelle et feuille de style correspondante.

/** Paliers d'échelle, de 80 % à 200 %. */
export const SCALES: readonly number[] = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];

/** Palier suivant (`+1`) ou précédent (`-1`) ; une échelle hors palier rejoint le plus proche dans ce sens. */
export function stepScale(scale: number, direction: 1 | -1): number {
  if (direction > 0) return SCALES.find((s) => s > scale + 1e-6) ?? SCALES.at(-1) ?? scale;
  return SCALES.findLast((s) => s < scale - 1e-6) ?? SCALES[0] ?? scale;
}

export const canGrow = (scale: number): boolean => scale < (SCALES.at(-1) ?? 2) - 1e-6;
export const canShrink = (scale: number): boolean => scale > (SCALES[0] ?? 0.8) + 1e-6;

/** Échelle ramenée dans les bornes (réglage modifié à la main). */
export const clampScale = (scale: number): number => Math.min(SCALES.at(-1) ?? 2, Math.max(SCALES[0] ?? 0.8, scale));

export const scaleLabel = (scale: number): string => `${Math.round(scale * 100)} %`;

/** Tailles du texte hébreu et de la traduction à l'échelle `scale`. */
export function scaleCss(scale: number): string {
  const em = (n: number): string => `${(n * clampScale(scale)).toFixed(3)}em`;
  return `
.hebrew { font-size: ${em(1.6)}; }
.translation { font-size: ${em(1.05)}; }
.segment.two-columns .translation { font-size: ${em(1)}; }
.segment-number { font-size: ${em(0.85)}; }
`;
}
