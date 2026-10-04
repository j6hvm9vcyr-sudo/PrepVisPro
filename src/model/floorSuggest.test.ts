import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { axisAngle, axisForAngle, sizeForFrameHeight, suggestFraming } from './floorSuggest';
import { computeScale, type FloorActor, type FloorCamera } from './floor';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { DEFAULT_TERMS } from './defaults';
import { doc, fr, plan, seq, setup } from './testkit';

describe('valeur d’après la hauteur de cadre', () => {
  it('repères usuels', () => {
    expect(sizeForFrameHeight(0.35, DEFAULT_TERMS.size)).toBe('GP');
    expect(sizeForFrameHeight(1.2, DEFAULT_TERMS.size)).toBe('Américain');
    expect(sizeForFrameHeight(2, DEFAULT_TERMS.size)).toBe('Moyen');
    expect(sizeForFrameHeight(40, DEFAULT_TERMS.size)).toBe('Général');
  });
  it('terme absent de la liste du projet : pas de suggestion inventée', () => {
    expect(sizeForFrameHeight(1.2, ['GP', 'Poitrine'])).toBeNull();
  });
});

describe('axe d’après l’orientation du personnage', () => {
  it('face, 3/4, profil, dos', () => {
    // Personnage en (0,0) qui regarde vers le bas (180°) ; caméra en dessous → face.
    const a = { at: { x: 0, y: 0 }, rotation: 180 };
    expect(axisForAngle(axisAngle(a, { x: 0, y: 10 }), DEFAULT_TERMS.axis)).toBe('Face');
    expect(axisForAngle(axisAngle(a, { x: 10, y: 10 }), DEFAULT_TERMS.axis)).toBe('3/4');
    expect(axisForAngle(axisAngle(a, { x: 10, y: 0 }), DEFAULT_TERMS.axis)).toBe('Profil');
    expect(axisForAngle(axisAngle(a, { x: 10, y: -10 }), DEFAULT_TERMS.axis)).toBe('3/4 dos');
    expect(axisForAngle(axisAngle(a, { x: 0, y: -10 }), DEFAULT_TERMS.axis)).toBe('Dos');
  });
});

describe('suggestion complète depuis le plan au sol', () => {
  function build(sensorH: number | null, distanceM: number) {
    let d = doc((c) => [seq('1', [plan(c, { cameras: [setup(c, { start: fr({ focalMm: 50 }) })] })])]);
    d = produce(d, (x) => {
      x.settings.cameras[0]!.sensorWidthMm = 36;
      x.settings.cameras[0]!.sensorHeightMm = sensorH;
      x.meta.aspectRatio = '';
    });
    const p = d.sequences[0]!.plans[0]!;
    // 100 unités = 1 m.
    const fp = { ...newFloorPlan('Salon', [d.sequences[0]!.id]), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1) };
    d = addFloorPlan(d, fp);
    const cam: FloorCamera = { id: 'c', kind: 'camera', at: { x: 0, y: 0 }, rotation: 90, planId: p.id, setupId: p.cameras[0]!.id, showFov: true, positions: [] };
    const actor: FloorActor = { id: 'a', kind: 'actor', at: { x: distanceM * 100, y: 0 }, rotation: 270, name: 'Léa', color: '#E5484D', positions: [], icon: null, size: 40 };
    d = addElements(d, fp.id, [cam, actor]);
    return { d, fp: d.floorPlans[0]!, cam };
  }

  it('50 mm sur 36 × 24 à 4 m : cadre de 1,92 m de haut → Moyen, de face', () => {
    const { d, fp, cam } = build(24, 4);
    const r = suggestFraming(d, fp, cam);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.start.distanceM).toBeCloseTo(4);
    expect(r.start.frameHeightM).toBeCloseTo(1.92);
    expect(r.start.size).toBe('Moyen');
    expect(r.start.axis).toBe('Face');
    expect(r.end).toBeNull();
  });

  it('positions : la fin du plan se lit à la dernière position de la caméra et du personnage', () => {
    const { d, fp, cam } = build(24, 4);
    // La caméra avance de 2 m (travelling avant) ; Léa, elle, se tourne de profil.
    const moved = produce(d, (x) => {
      const els = x.floorPlans[0]!.elements;
      const c = els.find((e) => e.id === 'c');
      const a = els.find((e) => e.id === 'a');
      if (c?.kind === 'camera') c.positions = [{ at: { x: 200, y: 0 }, rotation: 90 }];
      if (a?.kind === 'actor') a.positions = [{ at: { x: 400, y: 0 }, rotation: 0 }];
    });
    const r = suggestFraming(moved, moved.floorPlans[0]!, moved.floorPlans[0]!.elements.find((e) => e.id === 'c') as FloorCamera);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.start.size).toBe('Moyen');
    // 2 m à 50 mm : cadre de 0,96 m → Poitrine ; Léa vue de profil.
    expect(r.end!.distanceM).toBeCloseTo(2);
    expect(r.end!.frameHeightM).toBeCloseTo(0.96);
    expect(r.end!.axis).toBe('Profil');
    void fp;
    void cam;
  });

  it('sans hauteur capteur ni ratio : distance et axe, mais pas de valeur devinée', () => {
    const { d, fp, cam } = build(null, 4);
    const r = suggestFraming(d, fp, cam);
    expect(r.ok && r.start.frameHeightM === null && r.start.size === null && r.start.axis === 'Face').toBe(true);
  });

  it('plan non mis à l’échelle, ou personne dans le champ : explication', () => {
    const { d, fp, cam } = build(24, 4);
    expect(suggestFraming(d, { ...fp, scale: null }, cam)).toMatchObject({ ok: false });
    expect(suggestFraming(d, fp, { ...cam, rotation: 270 })).toMatchObject({ ok: false, reason: 'Aucun personnage dans le champ de la caméra.' });
  });
});

describe('écarts découpage / plan au sol', () => {
  it('signale une valeur différente, se tait quand elle correspond', async () => {
    const { floorMismatches } = await import('./floorSuggest');
    let d = doc((c) => [seq('1', [plan(c, { cameras: [setup(c, { start: fr({ focalMm: 50, size: 'GP', axis: 'Face' }) })] })])]);
    d = produce(d, (x) => {
      x.settings.cameras[0]!.sensorWidthMm = 36;
      x.settings.cameras[0]!.sensorHeightMm = 24;
    });
    const p = d.sequences[0]!.plans[0]!;
    const fp = { ...newFloorPlan('Salon', [d.sequences[0]!.id]), scale: computeScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1) };
    d = addFloorPlan(d, fp);
    d = addElements(d, fp.id, [
      { id: 'c', kind: 'camera', at: { x: 0, y: 0 }, rotation: 90, planId: p.id, setupId: p.cameras[0]!.id, showFov: true, positions: [] },
      { id: 'a', kind: 'actor', at: { x: 400, y: 0 }, rotation: 270, name: 'Léa', color: '#E5484D', positions: [], icon: null, size: 40 },
    ]);
    const m = floorMismatches(d).get(p.cameras[0]!.id)!;
    expect(m).toEqual([{ field: 'size', suggested: 'Moyen', current: 'GP', floorPlan: 'Salon' }]);
    d = produce(d, (x) => void (x.sequences[0]!.plans[0]!.cameras[0]!.start.size = 'Moyen'));
    expect(floorMismatches(d).size).toBe(0);
  });
});

describe('focale inverse', () => {
  it('Taille à 3 m sur 36 × 24 : focale idéale cohérente avec le calcul direct', async () => {
    const { idealFocalFor, sizeForFrameHeight } = await import('./floorSuggest');
    const f = idealFocalFor('Taille', 3, 24)!;
    // Avec cette focale, le cadre retombe bien sur « Taille ».
    expect(sizeForFrameHeight((3 * 24) / f, DEFAULT_TERMS.size)).toBe('Taille');
    expect(f).toBeGreaterThan(70);
    expect(f).toBeLessThan(90);
    expect(idealFocalFor('Inconnu', 3, 24)).toBeNull();
  });
});
