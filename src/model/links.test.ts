import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { planLinks } from './links';
import { sampleProjectMultiCam } from './sample';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { computeNumbers } from './numbering';

describe('ce plan ailleurs', () => {
  it('plan au sol, lumière, tournage, jours, images partagées : tout se lit dans le même document', () => {
    let d = sampleProjectMultiCam();
    const seq = d.sequences[0]!;
    const plan = seq.plans[0]!;
    // Sans rien : aucun plan au sol, ordre à établir, aucun jour.
    expect(planLinks(d, plan.id)).toEqual({ floors: [], shooting: { kind: 'none' }, days: [], sharedWith: [] });

    d = addFloorPlan(d, newFloorPlan('Quai', [seq.id]));
    const fp = d.floorPlans[0]!;
    d = addElements(d, fp.id, [
      { id: 'cam', kind: 'camera', at: { x: 0, y: 0 }, rotation: 0, planId: plan.id, setupId: plan.cameras[0]!.id, showFov: true, positions: [] },
      { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 0, fixtureId: null, mode: 0, dimmer: 1, gels: [], lossStops: 0, circuit: '', label: '', icon: null, size: 40, positions: [] },
    ]);
    d = produce(d, (x) => {
      x.sequences[0]!.shooting = { installations: [{ id: 'i1', name: 'Large', planIds: [x.sequences[0]!.plans[1]!.id, plan.id], note: '' }] };
      x.shootingDays.push({ id: 'j1', date: null, sequenceIds: [seq.id], note: '' }, { id: 'j2', date: null, sequenceIds: [seq.id], note: '' });
      x.sequences[0]!.plans[0]!.images.push({ id: 'a', kind: 'scouting', file: 'images/a.jpg', originalName: '', caption: '' });
      x.sequences[1]!.plans[0]!.images.push({ id: 'b', kind: 'reference', file: 'images/a.jpg', originalName: '', caption: '' });
    });
    const l = planLinks(d, plan.id)!;
    expect(l.floors).toEqual([{ id: fp.id, name: 'Quai', cameras: [{ setupId: plan.cameras[0]!.id, label: 'A', elementId: 'cam' }], lights: 1, reflectors: 0 }]);
    expect(l.shooting).toEqual({ kind: 'installation', index: 1, name: 'Large', order: 2 });
    expect(l.days).toEqual(['J1', 'J2']);
    expect(l.sharedWith).toEqual([computeNumbers(d).get(d.sequences[1]!.plans[0]!.id)!.code]);
    // Un plan de la séquence hors de toute installation : « à ranger ».
    expect(planLinks(d, seq.plans[2]!.id)!.shooting).toEqual({ kind: 'loose' });
    // Caméra du plan pas placée : signalée.
    expect(planLinks(d, seq.plans[2]!.id)!.floors[0]!.cameras[0]!.elementId).toBeNull();
  });
});
