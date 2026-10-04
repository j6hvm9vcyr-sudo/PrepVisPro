import { describe, expect, it } from 'vitest';
import { materialForPreset, presetById, presetValue, REFLECTOR_PRESETS } from './reflectorPresets';
import { newProject } from './defaults';
import { referencedFiles } from './images';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';

describe('matières de réflecteur préréglées', () => {
  it('valeurs publiées : milieu de la plage, plages cohérentes, sources présentes', () => {
    for (const p of REFLECTOR_PRESETS) {
      expect(p.min).toBeGreaterThan(0);
      expect(p.max).toBeLessThanOrEqual(1);
      expect(p.min).toBeLessThanOrEqual(p.max);
      expect(p.source.length).toBeGreaterThan(10);
    }
    // Essai Porwoll ancré sur le coton blanchi (85–90 %) : poly = 90/97 de la muslin blanchie.
    expect(presetValue(presetById('muslin-blanchie')!)).toBe(0.875);
    expect(presetValue(presetById('poly')!)).toBeCloseTo((0.875 * 90) / 97, 2);
    expect(presetValue(presetById('muslin-ecrue')!)).toBeCloseTo((0.875 * 80) / 97, 2);
    expect(presetById('miroir-verre')!.type).toBe('mirror');
  });
  it('une matière par preset dans le projet (réutilisée)', () => {
    let n = 0;
    const gen = () => `m${++n}`;
    const a = materialForPreset(newProject('X'), 'poly', gen);
    const b = materialForPreset(a.doc, 'poly', gen);
    expect(b.id).toBe(a.id);
    expect(b.doc.settings.reflectors).toHaveLength(1);
    expect(b.doc.settings.reflectors[0]).toMatchObject({ name: 'Poly / bead board', type: 'diffuse', presetId: 'poly' });
  });
});

describe('fichiers du projet', () => {
  it('icônes de tous les éléments comprises (copie à « Enregistrer sous »)', () => {
    let d = newProject('X');
    const fp = newFloorPlan('P', []);
    d = addFloorPlan(d, fp);
    d = addElements(d, fp.id, [
      { id: 'a', kind: 'actor', at: { x: 0, y: 0 }, rotation: 0, name: 'A', color: '#000', path: [], icon: 'icons/a.png', size: 40 },
      { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 0, fixtureId: null, mode: 0, dimmer: 1, gels: [], lossStops: 0, circuit: '', label: '', icon: 'icons/l.png', size: 40 },
      { id: 'r', kind: 'reflector', at: { x: 0, y: 0 }, rotation: 0, materialId: null, widthM: 1, heightM: 1, label: '', icon: 'icons/r.png', size: 40 },
      { id: 'i', kind: 'icon', at: { x: 0, y: 0 }, rotation: 0, icon: 'icons/i.png', label: '', size: 40 },
    ]);
    expect([...referencedFiles(d)].sort()).toEqual(['icons/a.png', 'icons/i.png', 'icons/l.png', 'icons/r.png']);
  });
});
