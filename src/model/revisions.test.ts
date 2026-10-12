import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { revisedPlans, revisionColor, revisionName } from './revisions';
import { sampleProject } from './sample';

describe('révisions colorées', () => {
  it('ordre WGA West : blanche, bleue, rose… cerise, puis 2e bleue', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => revisionColor(n).name)).toEqual(['blanche', 'bleue', 'rose', 'jaune', 'verte', 'dorée', 'chamois', 'saumon', 'cerise']);
    expect(revisionColor(10).name).toBe('2e bleue');
    expect(revisionColor(17).name).toBe('2e cerise');
    expect(revisionColor(18).name).toBe('3e bleue');
    expect(revisionName(3)).toBe('révision rose');
  });

  it('plans ajoutés ou modifiés depuis la publication précédente, avec l’avant et l’après', () => {
    const before = sampleProject();
    const after = produce(before, (d) => {
      d.sequences[0]!.plans[1]!.cameras[0]!.start.focalMm = 50;
    });
    const r = revisedPlans(before, after);
    expect([...r.keys()]).toEqual([before.sequences[0]!.plans[1]!.id]);
    const p = r.get(before.sequences[0]!.plans[1]!.id)!;
    expect(p.status).toBe('changed');
    expect(p.changes.some((c) => c.label.includes('Focale') && c.to.includes('50'))).toBe(true);
    expect(revisedPlans(before, before).size).toBe(0);
  });
});
