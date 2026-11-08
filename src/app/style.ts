// Feuille de style de l'application (chargée au démarrage).
import { HEBREW_FONT } from './fonts.ts';

export const STYLESHEET = `
.segment {
  padding: 10px 4px;
}
.segment-number {
  font-size: 0.85em;
  font-feature-settings: "tnum";
  min-width: 2.5em;
}
.hebrew {
  font-family: "${HEBREW_FONT}", "Frank Ruehl CLM", "Noto Serif Hebrew", serif;
  font-size: 1.6em;
}
.translation {
  font-family: "Noto Serif", serif;
  font-size: 1.05em;
  line-height: 1.4;
}
.segment.two-columns .translation {
  font-size: 1em;
}
.ref-entry {
  min-width: 160px;
}
`;
