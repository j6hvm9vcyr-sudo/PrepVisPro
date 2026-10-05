import { describe, expect, it } from 'vitest';
import { bearing, computeScale, fovCone, metersBetween, normalizeDeg, project, setupFov } from './floor';
import { addElements, addFloorPlan, cameraLabel, cleanupFloorRefs, moveElements, newFloorPlan, unplacedSetups } from './floorOps';
import { doc, fr, plan, seq, setup } from './testkit';
import { deletePlan } from './ops';
import { validateProject } from './schema';
import { produce } from 'immer';

describe('géométrie du plan au sol', () => {
  it('échelle par deux points', () => {
    const s = computeScale({ x: 0, y: 0 }, { x: 300, y: 400 }, 5)!;
    expect(s.metersPerUnit).toBeCloseTo(0.01, 10);
    expect(computeScale({ x: 1, y: 1 }, { x: 1, y: 1 }, 5)).toBeNull();
    expect(computeScale({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBeNull();
  });
  it('orientation : 0° vers le haut, sens horaire', () => {
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0);
    expect(bearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(180);
    expect(bearing({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
    const p = project({ x: 0, y: 0 }, 90, 10);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
    expect(normalizeDeg(-30)).toBe(330);
  });
  it('champ caméra : demi-angle de chaque côté de l’axe', () => {
    const c = fovCone({ x: 0, y: 0 }, 0, 90, 10)!;
    expect(c.left.x).toBeCloseTo(-7.0711, 3);
    expect(c.right.x).toBeCloseTo(7.0711, 3);
    expect(c.left.y).toBeCloseTo(-7.0711, 3);
    expect(fovCone({ x: 0, y: 0 }, 0, null, 10)).toBeNull();
  });
  it('distance réelle', () => {
    const fp = { ...newFloorPlan('x', []), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 2) };
    expect(metersBetween(fp, { x: 0, y: 0 }, { x: 50, y: 0 })).toBeCloseTo(1);
  });
});

describe('caméras du plan au sol reliées au découpage', () => {
  const build = () =>
    doc((c) => [
      seq('4', [plan(c, { cameras: [setup(c, { start: fr({ focalMm: 32 }), end: fr({ focalMm: 85 }) })] }), plan(c, { cameras: [setup(c, { start: fr({ focalMm: 50 }) })] })]),
    ]);

  it('étiquette à jour et champs début / fin', () => {
    let d = build();
    d = produce(d, (x) => void (x.settings.cameras[0]!.sensorWidthMm = 36));
    const p = d.sequences[0]!.plans[0]!;
    expect(cameraLabel(d, p.id, p.cameras[0]!.id)).toEqual({ code: '4/1', detail: '32 → 85 mm', missing: false });
    const f = setupFov(d, p.cameras[0]!);
    expect(f.start).toBeCloseTo(58.716, 2);
    expect(f.end).toBeCloseTo(23.912, 2);
  });

  it('sans largeur capteur, pas d’angle (rien n’est inventé)', () => {
    const d = build();
    expect(setupFov(d, d.sequences[0]!.plans[0]!.cameras[0]!).start).toBeNull();
  });

  it('caméras non placées, puis déplacement et déliaison quand le plan est supprimé', () => {
    let d = build();
    const s = d.sequences[0]!;
    const fp = newFloorPlan('Séq. 4', [s.id]);
    d = addFloorPlan(d, fp);
    expect(unplacedSetups(d, d.floorPlans[0]!)).toHaveLength(2);
    const p0 = s.plans[0]!;
    d = addElements(d, fp.id, [{ id: 'e1', kind: 'camera', at: { x: 10, y: 10 }, rotation: 0, planId: p0.id, setupId: p0.cameras[0]!.id, showFov: true, positions: [{ at: { x: 12, y: 12 }, rotation: 0 }], icon: null }]);
    expect(unplacedSetups(d, d.floorPlans[0]!)).toHaveLength(1);
    d = moveElements(d, fp.id, ['e1'], 5, -5);
    expect(d.floorPlans[0]!.elements[0]!.at).toEqual({ x: 15, y: 5 });
    expect((d.floorPlans[0]!.elements[0] as { positions: unknown }).positions).toEqual([{ at: { x: 17, y: 7 }, rotation: 0 }]);
    const r = deletePlan(d, p0.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cleaned = cleanupFloorRefs(r.doc);
    const cam = cleaned.floorPlans[0]!.elements[0]!;
    expect(cam.kind === 'camera' && cam.planId).toBeNull();
    expect(cameraLabel(cleaned, null, null).missing).toBe(true);
    expect(validateProject(JSON.parse(JSON.stringify(cleaned))).ok).toBe(true);
  });
});
