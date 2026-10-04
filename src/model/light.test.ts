import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { bounceAt, contributionsAt, formatStop, luxForStop, powerTotals, readingAt, stopFromLux } from './light';
import { gelStack, GELS } from './gels';
import { computeScale, type FloorLight, type FloorReflector } from './floor';
import { addElements, addFloorPlan, cleanupFloorRefs, newFloorPlan } from './floorOps';
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
    const light: FloorLight = { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation, fixtureId: 'f2k', mode: 1, dimmer: 1, gels: [], lossStops: 0, circuit: 'A', label: '', icon: null, size: 40 };
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
  it('données incomplètes : aucun chiffre, aucune puissance inventée', () => {
    const { d, fp, light } = build();
    const partial = produce(d, (x) => {
      x.settings.fixtures[0]!.modes[1]!.distanceM = null;
      x.settings.fixtures[0]!.watts = null;
    });
    expect(readingAt(partial, fp, light, { x: 250, y: 0 })).toBeNull();
    const p = powerTotals(partial, fp);
    expect(p.total.watts).toBe(0);
    expect(p.unknown).toBe(1);
  });
  it('modèle retiré : le projecteur redevient non défini ; mode disparu : premier mode', () => {
    const { d } = build();
    const noMode = cleanupFloorRefs(produce(d, (x) => void x.settings.fixtures[0]!.modes.splice(1, 1)));
    expect(noMode.floorPlans[0]!.elements[0]).toMatchObject({ fixtureId: 'f2k', mode: 0 });
    const gone = cleanupFloorRefs(produce(d, (x) => void (x.settings.fixtures = [])));
    expect(gone.floorPlans[0]!.elements[0]).toMatchObject({ fixtureId: null, mode: 0 });
  });
});

describe('gélatines LEE', () => {
  it('valeurs des fiches, illuminant selon le projecteur', () => {
    expect(GELS.map((g) => g.ref)).toEqual(['216', '250', '251', '252', '201', '202', '203', '218', '204', '205', '206', '223', '298', '209', '210', '211']);
    expect(gelStack(['lee-201'], true).transmission).toBe(0.35);
    expect(gelStack(['lee-201'], false).transmission).toBe(0.34);
    // 211 : seule la valeur jour est cohérente sur la fiche.
    expect(gelStack(['lee-211'], true).transmission).toBe(0.137);
    const s = gelStack(['lee-216', 'lee-209', 'inconnue'], true);
    expect(s.transmission).toBeCloseTo(0.36 * 0.5);
    expect(s.diffused && s.strong).toBe(true);
    expect(gelStack(['lee-252'], false).atLeast).toBe(true);
  });
});

describe('gélatines et réflecteurs sur le plan', () => {
  function build(extra: (d: ReturnType<typeof doc>) => void = () => {}) {
    let d = doc((c) => [seq('1', [plan(c)])]);
    d = produce(d, (x) => {
      x.settings.fixtures.push({ id: 'f', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [{ label: 'Flood', lux: 1000, distanceM: 5, beamDeg: 60 }] });
      x.settings.reflectors.push({ id: 'poly', name: 'Poly', type: 'diffuse', reflectance: 0.8 }, { id: 'miroir', name: 'Miroir', type: 'mirror', reflectance: 0.9 }, { id: 'toile', name: 'Toile', type: 'diffuse', reflectance: null });
      extra(x);
    });
    // 100 unités = 1 m.
    const fp = { ...newFloorPlan('Salon', [d.sequences[0]!.id]), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1) };
    d = addFloorPlan(d, fp);
    const light: FloorLight = { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 90, fixtureId: 'f', mode: 0, dimmer: 1, gels: [], lossStops: 0, circuit: '', label: '', icon: null, size: 40 };
    d = addElements(d, fp.id, [light]);
    return { d, fp: d.floorPlans[0]!, light };
  }
  it('CTB sur un tungstène : transmission tungstène de la fiche', () => {
    const { d, fp, light } = build();
    const r = readingAt(d, fp, { ...light, gels: ['lee-201'] }, { x: 250, y: 0 })!;
    expect(r.lux).toBeCloseTo(4000 * 0.35);
  });
  it('diffusion : hors du faisceau d’origine, pas de valeur ni de « hors faisceau »', () => {
    const { d, fp, light } = build();
    expect(readingAt(d, fp, { ...light, gels: ['lee-250'] }, { x: 0, y: 500 })!.why).toBe('diffusion');
    expect(readingAt(d, fp, light, { x: 0, y: 500 })!.why).toBe('beam');
  });
  it('réflecteur diffus (poly) : formule du disque lambertien', () => {
    const { d, fp, light } = build();
    const board: FloorReflector = { id: 'r', kind: 'reflector', at: { x: 200, y: 0 }, rotation: 270, materialId: 'poly', widthM: 1, heightM: 1, label: '' };
    // Au centre : 1000 × (5/2)² = 6250 lx. Tache du faisceau ≈ 4,2 m² > toile 1 m² → r² = 1/π.
    // Cible à 1 m devant : 0,8 × 6250 × (1/π) / (1/π + 1) ≈ 1207 lx.
    const b = bounceAt(d, fp, light, board, { x: 100, y: 0 })!;
    expect(b.onReflector).toBeCloseTo(6250);
    expect(b.lux).toBeCloseTo((0.8 * 6250 * (1 / Math.PI)) / (1 / Math.PI + 1), 3);
    // Derrière la toile : rien.
    expect(bounceAt(d, fp, light, board, { x: 300, y: 0 })!.lux).toBeNull();
    // Toile tournée dos au projecteur : rien.
    expect(bounceAt(d, fp, light, { ...board, rotation: 90 }, { x: 300, y: 0 })!.why).toBe('back');
    // Matière non mesurée : signalée, pas de chiffre.
    expect(bounceAt(d, fp, light, { ...board, materialId: 'toile' }, { x: 100, y: 0 })!.why).toBe('material');
  });
  it('miroir : réflexion spéculaire, distance parcourue', () => {
    const { d, fp, light } = build();
    // Miroir à 2 m, tourné à 45° : renvoie le faisceau vers le bas du plan.
    const mirror: FloorReflector = { id: 'm', kind: 'reflector', at: { x: 200, y: 0 }, rotation: 225, materialId: 'miroir', widthM: 1, heightM: 1, label: '' };
    // 2 m + 3 m = 5 m parcourus : 0,9 × 1000 lx.
    const b = bounceAt(d, fp, light, mirror, { x: 200, y: 300 })!;
    expect(b.lux).toBeCloseTo(900);
    // À côté du rayon réfléchi : le miroir ne renvoie rien là.
    expect(bounceAt(d, fp, light, mirror, { x: 500, y: 300 })!.lux).toBeNull();
  });
  it('lumière reçue : directe et renvoyée, la plus forte d’abord', () => {
    const { d, fp } = build();
    const board: FloorReflector = { id: 'r', kind: 'reflector', at: { x: 200, y: 0 }, rotation: 270, materialId: 'poly', widthM: 1, heightM: 1, label: 'Poly 1×1' };
    const d2 = addElements(d, fp.id, [board]);
    const cs = contributionsAt(d2, d2.floorPlans[0]!, { x: 100, y: 0 });
    expect(cs.map((c) => c.label)).toEqual(['Fresnel 2K', 'Poly 1×1 ← Fresnel 2K']);
    expect(cs[0]!.lux).toBeCloseTo(25000);
    expect(cs[1]!.approx).toBe(true);
  });
});
