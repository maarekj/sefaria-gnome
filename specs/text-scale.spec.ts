// Paliers de taille du texte.
import { canGrow, canShrink, scaleCss, scaleLabel, stepScale } from '../src/app/TextScale.ts';

describe('stepScale', () => {
  it('avance et recule par paliers, borné', () => {
    expect(stepScale(1, 1)).toBe(1.1);
    expect(stepScale(1, -1)).toBe(0.9);
    expect(stepScale(2, 1)).toBe(2);
    expect(stepScale(0.8, -1)).toBe(0.8);
  });
  it('échelle hors palier : palier voisin dans le sens demandé', () => {
    expect(stepScale(1.3, 1)).toBe(1.4);
    expect(stepScale(1.3, -1)).toBe(1.25);
  });
  it('bornes et libellé', () => {
    expect(canGrow(2)).toBeFalse();
    expect(canShrink(0.8)).toBeFalse();
    expect(canGrow(1) && canShrink(1)).toBeTrue();
    expect(scaleLabel(1.25)).toBe('125 %');
  });
  it('feuille de style proportionnelle, bornée', () => {
    expect(scaleCss(1)).toContain('.hebrew { font-size: 1.600em; }');
    expect(scaleCss(5)).toContain('.hebrew { font-size: 3.200em; }');
  });
});
