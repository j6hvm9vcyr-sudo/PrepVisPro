import { describe, expect, it } from 'vitest';
import { applyPreset, matchingPreset, presetLabel, removePreset, savePreset } from './shotPresets';
import { doc, fr, plan, seq, setup } from './testkit';
import { validateProject } from './schema';

describe('plans types', () => {
  const s = setup('c', { start: fr({ size: 'Poitrine', axis: '3/4', focalMm: 50 }), movements: ['Fixe'], grip: ['Branches'] });
  it('enregistré une fois, nommé par son résumé, appliqué à une autre caméra sans changer la caméra', () => {
    const d = doc((c) => [seq('1', [plan(c)])]);
    const r = savePreset(d, s);
    expect(r.added).toBe(true);
    expect(savePreset(r.doc, { ...s, id: 'autre' }).added).toBe(false); // pas de doublon
    const p = r.doc.settings.shotPresets[0]!;
    expect(presetLabel(p)).toBe('Poitrine · 3/4 · 50 mm · Fixe · Branches');
    expect(validateProject(r.doc).ok).toBe(true);
    const target = setup('B', { start: fr({ size: 'GP' }), end: fr({ size: 'TGP' }) });
    const applied = applyPreset(target, p);
    expect(applied).toMatchObject({ id: target.id, cameraId: 'B', start: s.start, end: null, movements: ['Fixe'], grip: ['Branches'] });
    expect(matchingPreset(r.doc, applied)?.id).toBe(p.id);
    expect(removePreset(r.doc, p.id).settings.shotPresets).toEqual([]);
  });
  it('un réglage vide ne devient pas un plan type', () => {
    const d = doc((c) => [seq('1', [plan(c)])]);
    expect(savePreset(d, setup('c')).added).toBe(false);
  });
});
