// Lectures du jour.
import { parseCalendar } from '../src/shared/api.ts';

describe('parseCalendar', () => {
  it('noms français, montées, lectures sans référence ignorées', () => {
    const items = parseCalendar({
      calendar_items: [
        { title: { en: 'Parashat Hashavua', he: 'פרשת השבוע' }, displayValue: { en: 'Toldot', he: 'תולדות' }, ref: 'Genesis 25:19-28:9', extraDetails: { aliyot: ['Genesis 25:19-26:5'] } },
        { title: { en: 'Chok LeYisrael' }, displayValue: { en: 'Toldot' }, ref: null },
        { title: { en: 'Inconnu', he: 'א' }, displayValue: { en: 'X 1' }, ref: 'X 1' },
        { bad: 1 },
      ],
    });
    expect(items).toEqual([
      { name: 'Paracha de la semaine', heName: 'פרשת השבוע', value: 'Toldot', heValue: 'תולדות', ref: 'Genesis 25:19-28:9', aliyot: ['Genesis 25:19-26:5'] },
      { name: 'Inconnu', heName: 'א', value: 'X 1', heValue: '', ref: 'X 1', aliyot: [] },
    ]);
  });
});
