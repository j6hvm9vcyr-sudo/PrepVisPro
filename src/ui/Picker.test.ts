import { describe, expect, it } from 'vitest';
import { filterGroups } from './Picker';

const groups = [
  { label: 'CTB (vers lumière du jour)', items: [{ id: 'a', label: '201 Full C.T. Blue', meta: '35 %' }, { id: 'b', label: '202 Half C.T. Blue' }] },
  { label: 'Diffusion', items: [{ id: 'c', label: '216 White Diffusion' }] },
  { label: 'Vide', items: [] },
];

describe('filterGroups', () => {
  it('sans recherche : tous les groupes non vides', () => {
    expect(filterGroups(groups, '  ').map((g) => g.label)).toEqual(['CTB (vers lumière du jour)', 'Diffusion']);
  });
  it('chaque mot doit se trouver dans le libellé, la précision, la valeur ou le groupe ; accents et majuscules ignorés', () => {
    expect(filterGroups(groups, 'ctb 201').flatMap((g) => g.items.map((i) => i.id))).toEqual(['a']);
    expect(filterGroups(groups, 'LUMIERE half').flatMap((g) => g.items.map((i) => i.id))).toEqual(['b']);
    expect(filterGroups(groups, '35 %').flatMap((g) => g.items.map((i) => i.id))).toEqual(['a']);
    expect(filterGroups(groups, 'tungstène')).toEqual([]);
  });
});
