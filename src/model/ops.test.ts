import { describe, expect, it } from 'vitest';
import { computeNumbers } from './numbering';
import { addCameraToPlan, addTerms, deletePlan, insertPlanAfter, movePlan, removeImage, setCover } from './ops';
import { doc, fr, plan, seq, setup } from './testkit';
import { coverImage } from './images';
import { missingFields } from './completeness';
import { horizontalFovDeg } from './optics';
import { validateProject } from './schema';
import { newProject } from './defaults';

const codes = (d: ReturnType<typeof doc>) => {
  const n = computeNumbers(d);
  return d.sequences.flatMap((s) => s.plans.map((p) => n.get(p.id)!.code));
};

describe('opérations sur les plans', () => {
  it('insère un plan qui reprend les réglages caméra, et renumérote', () => {
    const d = doc((c) => [seq('4', [plan(c, { action: 'A', cameras: [setup(c, { start: fr({ size: 'GP', focalMm: 40 }), grip: ['Branches'] })] }), plan(c)])]);
    const first = d.sequences[0]!.plans[0]!;
    const r = insertPlanAfter(d, first.id, { reprise: false });
    expect(codes(r.doc)).toEqual(['4/1', '4/2', '4/3']);
    const np = r.doc.sequences[0]!.plans[1]!;
    expect(np.id).toBe(r.planId);
    expect(np.action).toBe('');
    expect(np.cameras[0]!.start).toEqual(first.cameras[0]!.start);
    expect(np.cameras[0]!.id).not.toBe(first.cameras[0]!.id);
    expect(d.sequences[0]!.plans).toHaveLength(2); // original intact
  });

  it('crée une reprise rattachée au plan d’origine, même depuis une reprise', () => {
    const d = doc((c) => [seq('4', [plan(c, { action: 'Regard' }), plan(c)])]);
    const a = d.sequences[0]!.plans[0]!;
    const r1 = insertPlanAfter(d, a.id, { reprise: true });
    const r2 = insertPlanAfter(r1.doc, r1.planId, { reprise: true });
    expect(codes(r2.doc)).toEqual(['4/1', '4/1B', '4/1C', '4/2']);
    expect(r2.doc.sequences[0]!.plans[1]!.action).toBe('Regard');
  });

  it('supprime un plan, libère ses reprises et refuse de vider une séquence', () => {
    const d = doc((c) => {
      const a = plan(c);
      return [seq('1', [a, plan(c, { repriseOf: a.id }), plan(c)]), seq('2', [plan(c)])];
    });
    const r = deletePlan(d, d.sequences[0]!.plans[0]!.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(codes(r.doc)).toEqual(['1/1', '1/2', '2/1']);
    expect(deletePlan(d, d.sequences[1]!.plans[0]!.id).ok).toBe(false);
  });

  it('déplace un plan dans sa séquence, sans en sortir', () => {
    const d = doc((c) => [seq('1', [plan(c, { action: 'a' }), plan(c, { action: 'b' })])]);
    const b = d.sequences[0]!.plans[1]!;
    const up = movePlan(d, b.id, -1);
    expect(up.sequences[0]!.plans.map((p) => p.action)).toEqual(['b', 'a']);
    expect(movePlan(up, b.id, -1)).toBe(up);
  });

  it('ajoute une caméra B au projet si besoin', () => {
    const d = doc((c) => [seq('1', [plan(c)])]);
    const p = d.sequences[0]!.plans[0]!;
    const r = addCameraToPlan(d, p.id);
    expect(r.doc.settings.cameras.map((c) => c.label)).toEqual(['A', 'B']);
    const r2 = addCameraToPlan(r.doc, p.id);
    expect(r2.doc.settings.cameras.map((c) => c.label)).toEqual(['A', 'B', 'C']);
    // un autre plan réutilise la caméra B existante
    const d3 = { ...r2.doc, sequences: [...r2.doc.sequences, seq('2', [plan(d.settings.cameras[0]!.id)])] };
    const r3 = addCameraToPlan(d3, d3.sequences[1]!.plans[0]!.id);
    expect(r3.doc.settings.cameras).toHaveLength(3);
  });

  it('ajoute des termes sans doublon', () => {
    const d = doc((c) => [seq('1', [plan(c)])]);
    const r = addTerms(d, 'size', ['Pied', 'poitrine', ' Pied ']);
    expect(r.settings.terms.size.filter((t) => t === 'Pied')).toHaveLength(1);
    expect(r.settings.terms.size.filter((t) => t.toLowerCase() === 'poitrine')).toHaveLength(1);
  });
});

describe('images', () => {
  const img = (id: string, kind: 'reference' | 'scouting') => ({ id, kind, file: `images/${id}.jpg`, originalName: '', caption: '' });
  it('repérage prioritaire sur référence, choix manuel prioritaire sur tout', () => {
    const d = doc((c) => [seq('1', [plan(c, { images: [img('r1', 'reference'), img('s1', 'scouting')] })])]);
    const p = d.sequences[0]!.plans[0]!;
    expect(coverImage(p)!.id).toBe('s1');
    const d2 = setCover(d, p.id, 'r1');
    expect(coverImage(d2.sequences[0]!.plans[0]!)!.id).toBe('r1');
    const d3 = removeImage(d2, p.id, 'r1');
    expect(d3.sequences[0]!.plans[0]!.coverImageId).toBeNull();
    expect(coverImage(d3.sequences[0]!.plans[0]!)!.id).toBe('s1');
  });
});

describe('complétude', () => {
  it('liste les champs manquants selon les réglages du projet', () => {
    const d = doc((c) => [seq('1', [plan(c, { action: 'x', cameras: [setup(c, { start: fr({ size: 'GP', axis: 'Face', tiltDeg: -10, focalMm: 40 }), movements: ['Fixe'] })] })])]);
    const p = d.sequences[0]!.plans[0]!;
    expect(missingFields(p, d.settings)).toEqual(['machinerie']);
    const s2 = { ...d.settings, required: { ...d.settings.required, grip: false } };
    expect(missingFields(p, s2)).toEqual([]);
  });
});

describe('optique', () => {
  it('angle de champ horizontal', () => {
    // 36 mm de large, 50 mm : 2·atan(0,36) = 39,598°
    expect(horizontalFovDeg(36, 50)).toBeCloseTo(39.598, 3);
    // anamorphique 2x : comme une focale moitié
    expect(horizontalFovDeg(24, 50, 2)).toBeCloseTo(horizontalFovDeg(24, 25)!, 10);
    expect(horizontalFovDeg(null, 50)).toBeNull();
    expect(horizontalFovDeg(36, 0)).toBeNull();
    expect(horizontalFovDeg(36, -5)).toBeNull();
  });
});

describe('fichier projet', () => {
  it('un projet neuf est valide et survit à un aller-retour JSON', () => {
    const d = newProject('Agnus Dei');
    const r = validateProject(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
  });
  it('refuse un fichier d’une version future, avec un message clair', () => {
    const r = validateProject({ ...newProject(), schemaVersion: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version plus récente/);
  });
  it('refuse un fichier incohérent', () => {
    const d = newProject();
    const bad = structuredClone(d);
    bad.sequences[0]!.plans[0]!.repriseOf = 'inexistant';
    expect(validateProject(bad).ok).toBe(false);
    const bad2 = structuredClone(d);
    bad2.sequences[0]!.plans[0]!.cameras[0]!.cameraId = 'x';
    expect(validateProject(bad2).ok).toBe(false);
    const bad3 = structuredClone(d) as unknown as { sequences: { plans: { cameras: unknown[] }[] }[] };
    bad3.sequences[0]!.plans[0]!.cameras = [];
    expect(validateProject(bad3).ok).toBe(false);
  });
});
