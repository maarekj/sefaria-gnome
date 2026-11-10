// Page nettoyée : proportions gardées au dessin, matrice de couleur.
import { cleanMatrix, containRect, INK, PAPER } from '../src/app/CleanPage.ts';

describe('page nettoyée', () => {
  it('page contenue dans la zone, proportions gardées, centrée', () => {
    // page 100×160 dans une zone large 400×320 : 200×320, marges de 100 à gauche et à droite
    expect(containRect(100, 160, 400, 320)).toEqual({ x: 100, y: 0, width: 200, height: 320 });
    // zone haute : pleine largeur, centrée verticalement
    expect(containRect(100, 160, 100, 400)).toEqual({ x: 0, y: 120, width: 100, height: 160 });
  });
  it('opacité : papier 0, encre 1', () => {
    const { matrix, offset } = cleanMatrix(0);
    const alpha = (l: number): number => Math.min(1, Math.max(0, l * ((matrix[3] ?? 0) + (matrix[7] ?? 0) + (matrix[11] ?? 0)) + offset[3]));
    expect(alpha(PAPER)).toBeCloseTo(0, 5);
    expect(alpha(INK)).toBeCloseTo(1, 5);
    expect(cleanMatrix(1).offset.slice(0, 3)).toEqual([1, 1, 1]);
  });
});
