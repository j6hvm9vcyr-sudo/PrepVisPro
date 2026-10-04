import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addDay, cleanupDays, compactPlans, daySun, dayLabels, equipmentFor, moveDay, sortDaysByDate, unscheduled, updateDay } from './days';
import { sampleProjectMultiCam } from './sample';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { computeScale } from './floor';
import { validateProject } from './schema';

function project() {
  let d = sampleProjectMultiCam();
  d = produce(d, (x) => {
    x.settings.lenses = [
      { id: 'up', name: 'Ultra Prime', kind: 'primes', focals: [25, 32, 50, 75], min: null, max: null },
      { id: 'z', name: 'Angénieux', kind: 'zoom', focals: [], min: 25, max: 250 },
    ];
    x.settings.cameras[0]!.body = 'Alexa 35';
    x.settings.fixtures.push({ id: 'f2k', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [] }, { id: 'led', name: 'Panneau LED', watts: null, kind: 'led', modes: [] });
    x.settings.reflectors.push({ id: 'poly', name: 'Poly', type: 'diffuse', reflectance: null });
    x.sequences[1]!.breakdown.grip = 'Rail 6 m';
  });
  return d;
}

describe('jours de tournage', () => {
  it('ajout, numéros, ordre, tri par date, séquences sans jour', () => {
    let d = project();
    const a = addDay(d);
    d = a.doc;
    const b = addDay(d);
    d = b.doc;
    d = updateDay(d, a.id, (x) => ((x.date = '2026-11-03'), (x.sequenceIds = [d.sequences[1]!.id])));
    d = updateDay(d, b.id, (x) => ((x.date = '2026-11-02'), (x.sequenceIds = [d.sequences[0]!.id, d.sequences[1]!.id])));
    expect([...dayLabels(d).values()]).toEqual(['J1', 'J2']);
    expect(dayLabels(d).get(a.id)).toBe('J1');
    d = sortDaysByDate(d);
    expect(dayLabels(d).get(b.id)).toBe('J1');
    d = moveDay(d, b.id, 1);
    expect(dayLabels(d).get(b.id)).toBe('J2');
    expect(unscheduled(d).map((s) => s.number)).toEqual(['3', '4']);
    expect(validateProject(JSON.parse(JSON.stringify(d))).ok).toBe(true);
  });
  it('séquence supprimée : retirée des jours', () => {
    let d = project();
    const a = addDay(d);
    d = updateDay(a.doc, a.id, (x) => void (x.sequenceIds = [d.sequences[0]!.id, d.sequences[2]!.id]));
    d = produce(d, (x) => void x.sequences.splice(0, 1));
    expect(cleanupDays(d).shootingDays[0]!.sequenceIds).toEqual([d.sequences[1]!.id]);
  });
  it('fichier incohérent (séquence absente) : refusé', () => {
    const d = produce(project(), (x) => void x.shootingDays.push({ id: 'j', date: null, sequenceIds: ['absente'], note: '' }));
    expect(validateProject(JSON.parse(JSON.stringify(d))).ok).toBe(false);
  });
  it('soleil du jour pour les décors géolocalisés', () => {
    let d = produce(project(), (x) => {
      x.settings.timeZone = 'Europe/Paris';
      x.sequences[0]!.gps = { lat: 48.8566, lon: 2.3522 };
    });
    const a = addDay(d);
    d = updateDay(a.doc, a.id, (x) => ((x.date = '2026-06-21'), (x.sequenceIds = d.sequences.map((s) => s.id))));
    const s = daySun(d, d.shootingDays[0]!);
    expect(s).toHaveLength(1);
    expect(s[0]!.location).toBe('Quai de gare');
    // Référence NREL SPA : lever 05:46:56 (heure de Paris).
    expect(new Date(s[0]!.sun.sunrise!).toISOString().slice(11, 16)).toBe('03:46');
    expect(daySun(d, { ...d.shootingDays[0]!, date: null })).toEqual([]);
  });
});

describe('matériel déduit', () => {
  it('caméras, focales et séries, machinerie, notes', () => {
    const d = project();
    const e = equipmentFor(d, [d.sequences[0]!.id, d.sequences[1]!.id]);
    expect(e.cameras.map((c) => [c.label, c.body, c.plans])).toEqual([
      ['A', 'Alexa 35', ['1/1', '1/2', '1/3', '1/2B', '2/1', '2/2']],
      ['B', '', ['2/2']],
    ]);
    expect(e.focals.map((f) => [f.focal, f.series, f.offKit])).toEqual([
      [25, ['Ultra Prime', 'Angénieux 25-250 mm'], false],
      [32, ['Ultra Prime', 'Angénieux 25-250 mm'], false],
      [50, ['Ultra Prime', 'Angénieux 25-250 mm'], false],
      [75, ['Ultra Prime', 'Angénieux 25-250 mm'], false],
      [300, [], true],
    ]);
    expect(e.focals.find((f) => f.focal === 300)!.plans).toEqual(['1/3']);
    expect(e.grip.map((g) => g.term)).toEqual(['Branches', 'Steadicam', 'Épaule']);
    expect(e.notes).toEqual([{ sequence: '2', camera: '', grip: 'Rail 6 m', lighting: '', other: '' }]);
    // Séquences 3 et 4 : focales non renseignées.
    expect(equipmentFor(d, [d.sequences[2]!.id, d.sequences[3]!.id]).focalMissing).toEqual(['3/1', '4/1']);
  });
  it('plans au sol : trajets mesurés, projecteurs (maximum par plan), gélatines, réflecteurs, puissance', () => {
    let d = project();
    const s1 = d.sequences[0]!;
    const s2 = d.sequences[1]!;
    const fpA = { ...newFloorPlan('Quai', [s1.id]), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1) };
    const fpB = newFloorPlan('Wagon', [s2.id]);
    d = addFloorPlan(addFloorPlan(d, fpA), fpB);
    const light = (id: string, fixtureId: string | null, gels: string[] = []) => ({ id, kind: 'light' as const, at: { x: 0, y: 0 }, rotation: 0, fixtureId, mode: 0, dimmer: 1, gels, lossStops: 0, circuit: '', label: '', icon: null, size: 40 });
    d = addElements(d, fpA.id, [
      { id: 'c1', kind: 'camera', at: { x: 0, y: 0 }, rotation: 0, planId: s1.plans[0]!.id, setupId: s1.plans[0]!.cameras[0]!.id, showFov: true, path: [{ x: 300, y: 0 }, { x: 300, y: 400 }] },
      light('l1', 'f2k', ['lee-216', 'lee-201']),
      light('l2', 'f2k', ['lee-216']),
      light('l3', 'led'),
      { id: 'r1', kind: 'reflector', at: { x: 0, y: 0 }, rotation: 0, materialId: 'poly', widthM: 1.22, heightM: 1.22, label: '' },
    ]);
    d = addElements(d, fpB.id, [light('l4', 'f2k'), light('l5', null), { id: 'r2', kind: 'reflector', at: { x: 0, y: 0 }, rotation: 0, materialId: 'poly', widthM: 1.22, heightM: 1.22, label: '' }]);
    const e = equipmentFor(d, [s1.id, s2.id]);
    // Trajet : 3 m + 4 m.
    expect(e.moves).toEqual([{ plan: '1/1', floorPlan: 'Quai', grip: ['Branches'], lengthM: 7 }]);
    expect(e.fixtures).toEqual([
      { name: 'Fresnel 2K', watts: 2000, max: 2, perPlan: [{ floorPlan: 'Quai', count: 2 }, { floorPlan: 'Wagon', count: 1 }] },
      { name: 'Panneau LED', watts: null, max: 1, perPlan: [{ floorPlan: 'Quai', count: 1 }] },
    ]);
    expect(e.undefinedLights).toBe(1);
    expect(e.gels).toEqual([{ label: 'Lee 201 CTB', lights: 1 }, { label: 'Lee 216', lights: 2 }]);
    expect(e.reflectors).toEqual([{ name: 'Poly', size: '1,22 × 1,22 m', max: 1, perPlan: [{ floorPlan: 'Quai', count: 1 }, { floorPlan: 'Wagon', count: 1 }] }]);
    expect(e.peakPower).toEqual({ floorPlan: 'Quai', watts: 4000 });
    // Un jour sans la séquence 2 : le plan « Wagon » n'en fait pas partie.
    expect(equipmentFor(d, [s1.id]).floorPlans.map((f) => f.name)).toEqual(['Quai']);
  });
});

describe('listes de plans compactes', () => {
  it('plages par séquence, reprises à part', () => {
    expect(compactPlans(['1/1', '1/2', '1/3', '1/2B', '2/1', '2/2', '2/4', '3/1', '3/2'])).toBe('1/1–1/3, 1/2B, 2/1, 2/2, 2/4, 3/1, 3/2');
    expect(compactPlans(['10A/1', '10A/2', '10A/3'])).toBe('10A/1–10A/3');
    expect(compactPlans([])).toBe('');
  });
});
