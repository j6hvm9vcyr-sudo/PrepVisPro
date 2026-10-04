import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { compareDocs } from './diff';
import { sampleProject } from './sample';
import { insertPlanAfter, deletePlan } from './ops';

describe('comparaison de versions', () => {
  it('identiques : rien à signaler', () => {
    const d = sampleProject();
    const r = compareDocs(d, d);
    expect(r.sequences).toEqual([]);
    expect(r.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('plan modifié, plan ajouté (renumérotation signalée), plan retiré, séquence modifiée', () => {
    const before = sampleProject();
    let after = produce(before, (d) => {
      d.sequences[0]!.plans[0]!.cameras[0]!.start.focalMm = 40;
      d.sequences[0]!.location = 'Gare du Nord';
    });
    after = insertPlanAfter(after, after.sequences[0]!.plans[0]!.id, { reprise: false }).doc;
    const r1 = deletePlan(after, after.sequences[1]!.plans[1]!.id);
    if (!r1.ok) throw new Error(r1.error);
    after = r1.doc;
    const r = compareDocs(before, after);
    expect(r.counts).toEqual({ added: 1, removed: 1, changed: 1 });
    const s1 = r.sequences.find((s) => s.number === '1')!;
    expect(s1.changes).toEqual([{ label: 'Décor', from: 'Quai de gare', to: 'Gare du Nord' }]);
    const p11 = s1.plans.find((p) => p.code === '1/1')!;
    expect(p11.changes).toEqual([{ label: 'Focale', from: '32 mm', to: '40 mm' }]);
    expect(s1.plans.find((p) => p.status === 'added')!.code).toBe('1/2');
    // L'ancien 1/2 est devenu 1/3 : renumérotation signalée, sans changement de contenu.
    expect(s1.plans.find((p) => p.oldCode === '1/2')!.code).toBe('1/3');
    expect(r.sequences.find((s) => s.number === '2')!.plans).toEqual([expect.objectContaining({ code: '2/2', status: 'removed' })]);
  });
});
