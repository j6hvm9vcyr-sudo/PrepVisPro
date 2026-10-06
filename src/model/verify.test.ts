import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { itemLabel, planStarted, verify } from './verify';
import { sampleProject } from './sample';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { missingFields } from './completeness';

describe('À vérifier', () => {
  it('un plan sans aucune case remplie est « pas commencé » (gris), pas « à vérifier »', () => {
    const d = produce(sampleProject(), (x) => {
      const p = x.sequences[0]!.plans[0]!;
      p.action = '';
      p.cameras = [{ ...p.cameras[0]!, start: { size: '', axis: '', angle: '', tiltDeg: null, focalMm: null }, end: null, movements: [], grip: [] }];
    });
    const p = d.sequences[0]!.plans[0]!;
    expect(planStarted(p)).toBe(false);
    const v = verify(d);
    expect(v.states.get(p.id)).toBe('none');
    expect(v.notStarted.map((n) => n.planId)).toContain(p.id);
    expect(v.items.some((it) => it.kind !== 'day' && it.planId === p.id)).toBe(false);
  });

  it('cases manquantes : mêmes champs que la complétude du projet ; complet = vert', () => {
    const d = sampleProject();
    const v = verify(d);
    for (const s of d.sequences)
      for (const p of s.plans) {
        if (!planStarted(p)) continue;
        const missing = missingFields(p, d.settings);
        const item = v.items.find((it) => it.kind === 'fields' && it.planId === p.id);
        expect(item ? (item as { missing: string[] }).missing : []).toEqual(missing);
        expect(v.states.get(p.id)).toBe(missing.length ? 'warn' : 'ok');
      }
  });

  it('plan au sol : vérifié seulement si la séquence en a un ; une caméra placée suffit', () => {
    let d = sampleProject();
    const seq = d.sequences[0]!;
    const before = verify(d).items.filter((it) => it.kind === 'floor');
    expect(before).toEqual([]);
    d = addFloorPlan(d, newFloorPlan('Quai', [seq.id]));
    const unplaced = verify(d).items.filter((it) => it.kind === 'floor');
    expect(unplaced.length).toBe(seq.plans.filter(planStarted).length);
    const p = seq.plans[0]!;
    d = addElements(d, d.floorPlans[0]!.id, [{ id: 'cam', kind: 'camera', at: { x: 0, y: 0 }, rotation: 0, planId: p.id, setupId: p.cameras[0]!.id, showFov: true, positions: [], icon: null }]);
    const after = verify(d).items.filter((it) => it.kind === 'floor');
    expect(after.some((it) => it.kind === 'floor' && it.planId === p.id)).toBe(false);
    expect(after.length).toBe(unplaced.length - 1);
    expect(itemLabel(unplaced[0]!)).toMatch(/pas sur le plan au sol$/);
  });

  it('jours : vérifiés seulement si le projet a au moins un jour', () => {
    let d = sampleProject();
    expect(verify(d).items.filter((it) => it.kind === 'day')).toEqual([]);
    d = produce(d, (x) => {
      x.shootingDays.push({ id: 'j1', date: null, sequenceIds: [x.sequences[0]!.id], note: '' });
    });
    const days = verify(d).items.filter((it) => it.kind === 'day');
    expect(days.map((it) => (it.kind === 'day' ? it.seqId : ''))).toEqual(d.sequences.slice(1).filter((s) => s.plans.length).map((s) => s.id));
    expect(itemLabel(days[0]!)).toMatch(/^Séq\. .* · aucun jour$/);
  });
});
