import { describe, expect, it } from 'vitest';
import { createHistory, pushHistory, redoHistory, undoHistory, HISTORY_LIMIT } from './history';

describe('historique', () => {
  it('annule et rétablit dans l’ordre', () => {
    let h = createHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    h = undoHistory(h);
    expect(h.present).toBe('b');
    h = undoHistory(h);
    expect(h.present).toBe('a');
    h = undoHistory(h);
    expect(h.present).toBe('a');
    h = redoHistory(h);
    h = redoHistory(h);
    expect(h.present).toBe('c');
  });
  it('une nouvelle modification efface le futur', () => {
    let h = pushHistory(pushHistory(createHistory(1), 2), 3);
    h = undoHistory(h);
    h = pushHistory(h, 4);
    expect(h.future).toEqual([]);
    expect(redoHistory(h).present).toBe(4);
  });
  it('fusionne la frappe continue dans un même champ', () => {
    let h = createHistory('');
    h = pushHistory(h, 'B', 'k', 1000);
    h = pushHistory(h, 'Bo', 'k', 1500);
    h = pushHistory(h, 'Bon', 'k', 2000);
    expect(h.past).toEqual(['']);
    h = pushHistory(h, 'Bonj', 'k', 5000);
    expect(h.past).toEqual(['', 'Bon']);
    h = pushHistory(h, 'X', 'autre', 5100);
    expect(h.past).toEqual(['', 'Bon', 'Bonj']);
  });
  it('limite la taille', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
  it('ignore une version identique', () => {
    const h = createHistory('a');
    expect(pushHistory(h, 'a')).toBe(h);
  });
});
