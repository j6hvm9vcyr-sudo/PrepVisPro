import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { cleanupShooting, effectiveShooting, movePlanToInstallation, proposeShooting, setShooting } from './shooting';
import { computeScale, type FloorElement } from './floor';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { doc, fr, plan, seq, setup } from './testkit';
import { deletePlan, insertPlanAfter } from './ops';

/** Champ / contrechamp : deux personnages face à face, caméras de chaque côté. */
function scene() {
  let d = doc((c) => [
    seq('1', [
      plan(c, { action: 'Large champ', cameras: [setup(c, { start: fr({ size: 'Ensemble' }) })] }),
      plan(c, { action: 'GP Léa', cameras: [setup(c, { start: fr({ size: 'GP' }) })] }),
      plan(c, { action: 'GP Marc (contrechamp)', cameras: [setup(c, { start: fr({ size: 'GP' }) })] }),
      plan(c, { action: 'Taille Léa', cameras: [setup(c, { start: fr({ size: 'Taille' }) })] }),
      plan(c, { action: 'Insert hors plan', cameras: [setup(c, { start: fr({ size: 'Insert' }) })] }),
    ]),
  ]);
  const s = d.sequences[0]!;
  const fp = { ...newFloorPlan('Salon', [s.id]), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1) };
  d = addFloorPlan(d, fp);
  const cam = (i: number, x: number, y: number, rotation: number): FloorElement => ({ id: `c${i}`, kind: 'camera', at: { x, y }, rotation, planId: s.plans[i]!.id, setupId: s.plans[i]!.cameras[0]!.id, showFov: true, positions: [] });
  d = addElements(d, fp.id, [
    cam(0, 0, 600, 0), // large, regarde vers le haut
    cam(1, 50, 650, 5), // même endroit, même direction
    cam(2, 0, -200, 180), // contrechamp
    cam(3, 30, 560, 355), // même installation que le large
  ]);
  return d;
}

describe('ordre de tournage', () => {
  it('regroupe par installation, champ puis contrechamp, du plus large au plus serré', () => {
    const d = scene();
    const s = d.sequences[0]!;
    const o = proposeShooting(d, s);
    const actions = o.installations.map((i) => ({ name: i.name, plans: i.planIds.map((id) => s.plans.find((p) => p.id === id)!.action) }));
    expect(actions).toEqual([
      { name: 'Champ 1', plans: ['Large champ', 'Taille Léa', 'GP Léa'] },
      { name: 'Contrechamp 2', plans: ['GP Marc (contrechamp)'] },
      { name: 'Hors plan au sol', plans: ['Insert hors plan'] },
    ]);
  });

  it('plans ajoutés après coup : « à ranger » ; supprimés : retirés ; déplacement à la main', () => {
    let d = scene();
    const s = d.sequences[0]!;
    d = setShooting(d, s.id, proposeShooting(d, s));
    d = insertPlanAfter(d, s.plans[4]!.id, { reprise: false }).doc;
    const r = deletePlan(d, s.plans[1]!.id);
    if (!r.ok) throw new Error(r.error);
    d = cleanupShooting(r.doc);
    const e = effectiveShooting(d.sequences[0]!)!;
    expect(e.loose).toHaveLength(1);
    expect(e.installations[0]!.plans.map((p) => p.action)).toEqual(['Large champ', 'Taille Léa']);
    // Glisser « Taille Léa » dans le contrechamp, en tête.
    d = movePlanToInstallation(d, s.id, s.plans[3]!.id, e.installations[1]!.id, 0);
    const e2 = effectiveShooting(d.sequences[0]!)!;
    expect(e2.installations[1]!.plans.map((p) => p.action)).toEqual(['Taille Léa', 'GP Marc (contrechamp)']);
    expect(e2.installations[0]!.plans.map((p) => p.action)).toEqual(['Large champ']);
  });

  it('séquence sans plan au sol : une seule installation à organiser', () => {
    const d = produce(scene(), (x) => void (x.floorPlans = []));
    const o = proposeShooting(d, d.sequences[0]!);
    expect(o.installations).toHaveLength(1);
    expect(o.installations[0]!.planIds).toHaveLength(5);
  });
});
