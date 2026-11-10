// Zoom de la page imprimée : bornes et point fixe sous le pointeur.
import { anchoredScroll, clampZoom } from '../src/app/PageView.ts';

describe('zoom de la page imprimée', () => {
  it('borné entre 1 et 6', () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(10)).toBe(6);
    expect(clampZoom(2.5)).toBe(2.5);
  });
  it('le point sous le pointeur reste fixe', () => {
    // point de l'image sous le pointeur : 100 + 50 = 150 ; zoom x2 → 300, pointeur toujours à 50
    expect(anchoredScroll(100, 50, 2)).toBe(250);
    expect(anchoredScroll(0, 10, 0.5)).toBe(0);
  });
});
