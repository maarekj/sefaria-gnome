// Fenêtre des préférences (Ctrl+,) : traduction par IA (outil, modèle, langue cible).
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { AI_LANGUAGES } from '../shared/aiprompt.ts';
import type { AiTool, SettingsStore } from '../shared/settings.ts';
import { TOOL_NAMES } from '../shared/translate.ts';

const TOOLS: readonly AiTool[] = ['none', 'claude', 'opencode'];

export function openPreferences(parent: Gtk.Widget, settings: SettingsStore): void {
  const s = settings.value.peek();
  const dialog = new Adw.PreferencesDialog({ title: 'Préférences' });
  const page = new Adw.PreferencesPage({ title: 'Lecture', iconName: 'accessories-dictionary-symbolic' });
  const group = new Adw.PreferencesGroup({
    title: 'Traduction par IA',
    description: 'Traduit une section ou un verset avec la commande « claude » (Claude Code) ou « opencode » installée sur cet ordinateur, en lui donnant la section entière et la traduction de Sefaria comme contexte.',
  });
  const tool = new Adw.ComboRow({ title: 'Outil', model: Gtk.StringList.new(TOOLS.map((t) => TOOL_NAMES[t])), selected: Math.max(0, TOOLS.indexOf(s.aiTool)) });
  tool.connect('notify::selected', () => settings.update({ aiTool: TOOLS[tool.selected] ?? 'none' }));
  const model = new Adw.EntryRow({ title: 'Modèle (vide : celui de l’outil)', text: s.aiModel, showApplyButton: true });
  model.connect('apply', () => settings.update({ aiModel: model.text.trim() }));
  const language = new Adw.ComboRow({
    title: 'Langue de la traduction',
    model: Gtk.StringList.new(AI_LANGUAGES.map(([, name]) => name.charAt(0).toUpperCase() + name.slice(1))),
    selected: Math.max(0, AI_LANGUAGES.findIndex(([c]) => c === s.aiLanguage)),
  });
  language.connect('notify::selected', () => settings.update({ aiLanguage: AI_LANGUAGES[language.selected]?.[0] ?? 'french' }));
  const sync = (): void => {
    const on = settings.value.peek().aiTool !== 'none';
    model.sensitive = on;
    language.sensitive = on;
  };
  sync();
  const unsubscribe = settings.value.subscribe(sync);
  dialog.connect('closed', unsubscribe);
  group.add(tool);
  group.add(model);
  group.add(language);
  page.add(group);
  dialog.add(page);
  dialog.present(parent);
}
