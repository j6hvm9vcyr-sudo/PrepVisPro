import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { formatStop, luxForStop, powerTotals, readingAt, stopFromLux } from './light';
import { computeScale, type FloorLight } from './floor';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { doc, plan, seq } from './testkit';

const E = { iso: 800, fps: 24, shutterDeg: 180 };

describe('diaph', () => {
  it('formule du posemètre incident, aller-retour', () => {
    // 800 ISO, 1/48 s : T2,8 demande 2,8² × 340 / (800 / 48) ≈ 160 lux.
    expect(luxForStop(2.8, E)).toBeCloseTo(159.94, 1);
    expect(stopFromLux(luxForStop(4, E), E)).toBeCloseTo(4, 6);
    expect(stopFromLux(0, E)).toBeNull();
  });
  it('affichage en diaphs et tiers', () => {
    expect(formatStop(4)).toBe('T4');
    expect(formatStop(2.8)).toBe('T2,8');
    expect(formatStop(2 * Math.SQRT2 * 2 ** (1 / 6))).toBe('T2,8 ⅓');
    expect(formatStop(0.8)).toBe('sous T1');
  });
});

describe('éclairement sur le plan', () => {
  function build(rotation = 90) {
    let d = doc((c) => [seq('1', [plan(c)])]);
    d = produce(d, (x) => {
      x.settings.fixtures.push({ id: 'f2k', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [{ label: 'Spot', lux: 9000, distanceM: 5, beamDeg: 16 }, { label: 'Flood', lux: 1000, distanceM: 5, beamDeg: 60 }] });
    });
    const fp = { ...newFloorPlan('Salon', [d.sequences[0]!.id]), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1) };
    d = addFloorPlan(d, fp);
    const light: FloorLight = { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation, fixtureId: 'f2k', mode: 1, dimmer: 1, lossStops: 0, circuit: 'A', label: '', icon: null, size: 40 };
    d = addElements(d, fp.id, [light]);
    return { d, fp: d.floorPlans[0]!, light };
  }
  it('inverse du carré depuis la donnée du fabricant', () => {
    const { d, fp, light } = build();
    // Flood : 1000 lx à 5 m → 4000 lx à 2,5 m (devant, dans l'axe).
    const r = readingAt(d, fp, light, { x: 250, y: 0 })!;
    expect(r.distanceM).toBeCloseTo(2.5);
    expect(r.lux).toBeCloseTo(4000);
  });
  it('gradateur et pertes', () => {
    const { d, fp, light } = build();
    const r = readingAt(d, fp, { ...light, dimmer: 0.5, lossStops: 1 }, { x: 500, y: 0 })!;
    expect(r.lux).toBeCloseTo(250);
  });
  it('hors du faisceau : pas de valeur', () => {
    const { d, fp, light } = build();
    const r = readingAt(d, fp, light, { x: 0, y: 500 })!;
    expect(r.lux).toBeNull();
    expect(readingAt(d, { ...fp, scale: null }, light, { x: 500, y: 0 })).toBeNull();
  });
  it('puissance par circuit', () => {
    const { d, fp } = build();
    const p = powerTotals(d, fp);
    expect(p.total.watts).toBe(2000);
    expect(p.total.amps).toBeCloseTo(8.7, 1);
    expect(p.circuits).toEqual([expect.objectContaining({ circuit: 'A', watts: 2000, count: 1 })]);
  });
});
