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
.chapter-heading {
  margin: 22px 4px 6px 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid alpha(currentColor, 0.15);
}
.chapter-heading:first-child {
  margin-top: 4px;
}
.hebrew-heading {
  font-family: "${HEBREW_FONT}", serif;
  font-size: 1.35em;
  font-weight: bold;
}
.clickable-segment {
  border-radius: 8px;
}
.clickable-segment:hover {
  background: alpha(currentColor, 0.03);
}
.clickable-segment.selected-segment {
  background: alpha(var(--accent-bg-color), 0.12);
}
.link-source {
  padding-bottom: 12px;
  border-bottom: 1px solid alpha(currentColor, 0.1);
}
.ref-entry.compact {
  min-width: 70px;
}
.ref-suggestions {
  min-width: 260px;
}
.ref-entry {
  min-width: 110px;
}
`;
