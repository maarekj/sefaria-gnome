// Traduction par IA : invite et lecture de la réponse.
import * as z from 'zod/mini';
import { buildCommentaryPrompt, buildPrompt, commentaryKey, parseAiResponse } from '../src/shared/aiprompt.ts';
import { TextResponse, toPassage } from '../src/shared/api.ts';

const passage = toPassage(
  z.parse(TextResponse, {
    ref: 'Genesis 1',
    heRef: 'בראשית א׳',
    indexTitle: 'Genesis',
    sections: ['1'],
    textDepth: 2,
    versions: [
      { language: 'he', versionTitle: 'H', text: ['<big>בְּ</big>רֵאשִׁית', 'וְהָאָרֶץ'] },
      { language: 'en', versionTitle: 'JPS', text: ['In the beginning<sup class="footnote-marker">a</sup><i class="footnote">note</i>', ''] },
    ],
  }),
);

describe('traduction par IA', () => {
  it('invite : contexte de la section, appui de Sefaria sans notes, langue', () => {
    const p = buildPrompt(passage, 'french');
    expect(p).toContain('Genesis 1 (בראשית א׳)');
    expect(p).toContain('[1] בְּרֵאשִׁית\n    (traduction existante : In the beginning)');
    expect(p).toContain('[2] וְהָאָרֶץ');
    expect(p).not.toContain('beginningnote');
    expect(p).toContain('vers le français');
    expect(buildPrompt(passage, 'english', '2')).toContain('uniquement le segment [2]');
  });
  it('réponse : JSON entouré de texte, segments inconnus ignorés', () => {
    expect(parseAiResponse('Voici :\n```json\n{"1": " Au commencement ", "9": "x"}\n```', ['1', '2'])).toEqual({ '1': 'Au commencement' });
    expect(() => parseAiResponse('pas de json', ['1'])).toThrowError(/sans JSON/u);
    expect(() => parseAiResponse('{"9": "x"}', ['1'])).toThrowError(/aucune traduction/u);
  });
  it('commentaire : verset commenté en contexte, sans notes', () => {
    const p = buildPrompt(passage, 'french', undefined, { ref: 'Genesis 1:1', he: '<b>בְּרֵאשִׁית</b>', en: 'In the beginning<i class="footnote">n</i>' });
    expect(p).toContain('Ce texte commente Genesis 1:1');
    expect(p).toContain('    בְּרֵאשִׁית\n    (traduction existante : In the beginning)');
  });
  it('commentaires groupés : section, verset signalé, identifiants', () => {
    const c1 = { id: 'c1', passage };
    const p = buildCommentaryPrompt([c1], passage, 'Genesis 1:2', (label) => `Genesis 1:${label}`, 'french', 'Rashi');
    expect(p).toContain('commentaires de Rashi sur Genesis 1:2');
    expect(p).toContain('(2) וְהָאָרֶץ  ← VERSET COMMENTÉ');
    expect(p).not.toContain('(1) בְּרֵאשִׁית  ←');
    expect(p).toContain('[c1.1] בְּרֵאשִׁית');
    expect(commentaryKey(c1, '2')).toBe('c1.2');
  });
});
