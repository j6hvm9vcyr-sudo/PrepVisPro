import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { lightLegend } from './render';
import { addElements, addFloorPlan, newFloorPlan } from '../model/floorOps';
import { doc, plan, seq } from '../model/testkit';

describe('légende des exports : projecteurs et réflecteurs', () => {
  it('gélatines LEE, puissance et réflecteurs', () => {
    let d = doc((c) => [seq('1', [plan(c)])]);
    d = produce(d, (x) => {
      x.settings.fixtures.push({ id: 'f', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [{ label: 'Flood', lux: 1000, distanceM: 5, beamDeg: 60 }] });
      x.settings.reflectors.push({ id: 'p', name: 'Poly', type: 'diffuse', reflectance: 0.8, presetId: null });
    });
    const fp = newFloorPlan('Salon', [d.sequences[0]!.id]);
    d = addFloorPlan(d, fp);
    d = addElements(d, fp.id, [
      { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 90, fixtureId: 'f', mode: 0, dimmer: 1, gels: ['lee-216', 'lee-201'], lossStops: 0, circuit: 'A', label: '', icon: null, size: 40, positions: [] },
      { id: 'r', kind: 'reflector', at: { x: 200, y: 0 }, rotation: 270, materialId: 'p', widthM: 1.22, heightM: 1.22, label: '', icon: null, size: 40 },
    ]);
    const lg = lightLegend(d, d.floorPlans[0]!);
    expect(lg.lights).toEqual([
      { name: 'Fresnel 2K', detail: '2000 W · Flood · Lee 216 + Lee 201 CTB · circuit A' },
      { name: 'Poly', detail: 'réflecteur diffus · 1,22 × 1,22 m · réflexion 80 %' },
    ]);
    expect(lg.power).toMatch(/2\s?000 W/);
  });
});
