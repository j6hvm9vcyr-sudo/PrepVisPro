import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { axisJumps, axisReports, sideOf } from './raccords';
import { addElements, addFloorPlan, cleanupFloorRefs, deleteElements, newFloorPlan } from './floorOps';
import type { FloorCamera, Point } from './floor';
import type { ProjectDoc } from './types';
import { doc, plan, seq, setup } from './testkit';
import { itemLabel, verify } from './verify';

const cam = (id: string, planId: string, setupId: string, at: Point, end?: Point): FloorCamera => ({
  id,
  kind: 'camera',
  at,
  rotation: 0,
  planId,
  setupId,
  showFov: true,
  positions: end ? [{ at: end, rotation: 0 }] : [],
  icon: null,
});

/** Léa (0,0) et Paul (100,0), axe horizontal ; dessous = côté 1, dessus = côté -1 (y vers le bas). */
function scene(cams: (d: ProjectDoc) => FloorCamera[], plans = 6): ProjectDoc {
  let d = doc((c) => [seq('1', Array.from({ length: plans }, (_, i) => plan(c, { action: `Plan ${i + 1}` })))]);
  d = addFloorPlan(d, newFloorPlan('Quai', [d.sequences[0]!.id]));
  const fpId = d.floorPlans[0]!.id;
  d = addElements(d, fpId, [
    { id: 'lea', kind: 'actor', at: { x: 0, y: 0 }, rotation: 90, name: 'Léa', color: '#E5484D', positions: [], icon: null, size: 40 },
    { id: 'paul', kind: 'actor', at: { x: 100, y: 0 }, rotation: 270, name: 'Paul', color: '#3E63DD', positions: [], icon: null, size: 40 },
    ...cams(d),
  ]);
  return produce(d, (x) => void x.floorPlans[0]!.axes.push({ id: 'ax', actorIds: ['lea', 'paul'], accepted: [] }));
}
const P = (d: ProjectDoc, i: number) => d.sequences[0]!.plans[i]!;
const on = (d: ProjectDoc, i: number, id: string, at: Point, end?: Point) => cam(id, P(d, i).id, P(d, i).cameras[0]!.id, at, end);

describe('côté de l’axe', () => {
  it('à droite, à gauche, sur l’axe (moins de 3°), et dans son prolongement', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    expect(sideOf(a, b, { x: 50, y: 80 })).toBe(1);
    expect(sideOf(a, b, { x: 50, y: -80 })).toBe(-1);
    // 2 unités d'écart à 50 du personnage le plus proche : 2,3° → sur l'axe.
    expect(sideOf(a, b, { x: 150, y: 2 })).toBe(0);
    // 4 unités d'écart à 50 : 4,6° → déjà d'un côté.
    expect(sideOf(a, b, { x: 150, y: 4 })).toBe(1);
    expect(sideOf(a, b, { x: -40, y: 0 })).toBe(0);
  });
});

describe('sauts d’axe entre plans qui se suivent', () => {
  it('signale le changement de côté, pas les plans sans caméra ni ceux sur l’axe ; une reprise prend la caméra de son plan', () => {
    let d = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 }), on(x, 1, 'c2', { x: 20, y: 60 }), on(x, 2, 'c3', { x: 60, y: -70 }), on(x, 4, 'c5', { x: 150, y: 1 })]);
    // Le plan 6 est la reprise du plan 3 (même caméra, même côté).
    d = produce(d, (x) => void (x.sequences[0]!.plans[5]!.repriseOf = x.sequences[0]!.plans[2]!.id));
    const [r] = axisReports(d, d.floorPlans[0]!);
    expect(r!.names).toEqual(['Léa', 'Paul']);
    expect(r!.sequences[0]!.shots.map((s) => s.start)).toEqual([1, 1, -1, null, 0, -1]);
    expect(r!.jumps.map((j) => `${j.fromCode} → ${j.toCode}`)).toEqual(['1/2 → 1/3']);
    expect(r!.jumps[0]!.accepted).toBe(false);
  });

  it('« C’est voulu » : le saut reste connu mais accepté', () => {
    let d = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 }), on(x, 1, 'c2', { x: 50, y: -80 })], 2);
    const key = `${P(d, 0).id}>${P(d, 1).id}`;
    d = produce(d, (x) => void x.floorPlans[0]!.axes[0]!.accepted.push(key));
    expect(axisJumps(d).map((j) => [j.key, j.accepted])).toEqual([[key, true]]);
  });

  it('une caméra qui traverse l’axe pendant le plan : on compare la fin du plan au début du suivant', () => {
    const d = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 }, { x: 50, y: -80 }), on(x, 1, 'c2', { x: 20, y: -60 })], 2);
    expect(axisJumps(d)).toEqual([]);
    const back = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 }, { x: 50, y: -80 }), on(x, 1, 'c2', { x: 20, y: 60 })], 2);
    expect(axisJumps(back)).toHaveLength(1);
  });

  it('un plan à deux caméras de part et d’autre n’a pas de côté : rien n’est signalé', () => {
    let d = doc((c) => [seq('1', [plan(c, { cameras: [setup(c), setup(c)] }), plan(c)])]);
    d = addFloorPlan(d, newFloorPlan('Q', [d.sequences[0]!.id]));
    const p0 = P(d, 0);
    const p1 = P(d, 1);
    d = addElements(d, d.floorPlans[0]!.id, [
      { id: 'lea', kind: 'actor', at: { x: 0, y: 0 }, rotation: 0, name: 'Léa', color: '#E5484D', positions: [], icon: null, size: 40 },
      { id: 'paul', kind: 'actor', at: { x: 100, y: 0 }, rotation: 0, name: 'Paul', color: '#3E63DD', positions: [], icon: null, size: 40 },
      cam('a', p0.id, p0.cameras[0]!.id, { x: 50, y: 80 }),
      cam('b', p0.id, p0.cameras[1]!.id, { x: 50, y: -80 }),
      cam('c', p1.id, p1.cameras[0]!.id, { x: 50, y: -80 }),
    ]);
    d = produce(d, (x) => void x.floorPlans[0]!.axes.push({ id: 'ax', actorIds: ['lea', 'paul'], accepted: [] }));
    const [r] = axisReports(d, d.floorPlans[0]!);
    expect(r!.sequences[0]!.shots[0]!.start).toBeNull();
    expect(r!.jumps).toEqual([]);
  });

  it('un personnage qui se déplace : l’axe n’est pas vérifié', () => {
    let d = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 }), on(x, 1, 'c2', { x: 50, y: -80 })], 2);
    d = produce(d, (x) => {
      const lea = x.floorPlans[0]!.elements.find((e) => e.id === 'lea');
      if (lea?.kind === 'actor') lea.positions.push({ at: { x: 0, y: 50 }, rotation: 90 });
    });
    const [r] = axisReports(d, d.floorPlans[0]!);
    expect(r!.moving).toBe(true);
    expect(r!.jumps).toEqual([]);
  });

  it('un personnage retiré du plan au sol emporte son axe', () => {
    const d = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 })], 1);
    const after = cleanupFloorRefs(deleteElements(d, d.floorPlans[0]!.id, ['paul']));
    expect(after.floorPlans[0]!.axes).toEqual([]);
    expect(cleanupFloorRefs(d)).toBe(d);
  });
});

describe('À vérifier', () => {
  it('un saut d’axe met le second plan en orange ; « C’est voulu » le retire', () => {
    let d = scene((x) => [on(x, 0, 'c1', { x: 50, y: 80 }), on(x, 1, 'c2', { x: 50, y: -80 })], 2);
    let v = verify(d);
    const it0 = v.items.find((i) => i.kind === 'axis');
    expect(it0 && itemLabel(it0)).toBe('1/1 → 1/2 · saut d’axe Léa ↔ Paul');
    expect(v.states.get(P(d, 1).id)).toBe('warn');
    d = produce(d, (x) => void x.floorPlans[0]!.axes[0]!.accepted.push(`${P(d, 0).id}>${P(d, 1).id}`));
    v = verify(d);
    expect(v.items.some((i) => i.kind === 'axis')).toBe(false);
  });
});

