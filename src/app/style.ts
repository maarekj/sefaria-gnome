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
}
.translation {
  font-family: "Noto Serif", serif;
  line-height: 1.4;
}
.text-scale button {
  min-width: 44px;
}
.text-smaller {
  font-size: 0.85em;
  font-weight: bold;
}
.text-larger {
  font-size: 1.25em;
  font-weight: bold;
}
.section-button {
  min-width: 0;
  padding: 4px 2px;
  font-feature-settings: "tnum";
}
.section-button.current-section {
  background: var(--accent-bg-color);
  color: var(--accent-fg-color);
}
.ref-entry {
  min-width: 160px;
}
`;
