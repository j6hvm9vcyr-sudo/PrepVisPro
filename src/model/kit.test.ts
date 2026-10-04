import { describe, expect, it } from 'vitest';
import { addFromKit, applyKitDefaults, cannotSave, emptyKit, inProject, nextCameraLabel, parseKit, removeFromKit, saveToKit } from './kit';
import { newProject, DEFAULT_TERMS } from './defaults';
import { validateProject } from './schema';
import type { Fixture, ProjectCamera } from './types';

const venice: ProjectCamera = { id: 'c1', label: 'A', body: 'Sony Venice 2', mode: '6K 3:2', sensorWidthMm: 35.9, sensorHeightMm: 24, squeeze: 1 };
const fresnel: Fixture = { id: 'f1', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [{ label: 'Spot', lux: 1000, distanceM: 5, beamDeg: 60 }] };

describe('Mon matériel', () => {
  it('enregistrer deux fois le même élément le met à jour, sans doublon', () => {
    let kit = saveToKit(emptyKit(), 'cameras', venice).kit;
    const r = saveToKit(kit, 'cameras', { ...venice, id: 'autre', label: 'B', sensorHeightMm: 18.9 });
    expect(r.updated).toBe(true);
    kit = r.kit;
    expect(kit.cameras).toHaveLength(1);
    expect(kit.cameras[0]!.sensorHeightMm).toBe(18.9);
    // Copie : modifier l'original ne change pas « Mon matériel ».
    const f = structuredClone(fresnel);
    kit = saveToKit(kit, 'fixtures', f).kit;
    f.modes[0]!.lux = 1;
    expect(kit.fixtures[0]!.modes[0]!.lux).toBe(1000);
    expect(removeFromKit(kit, 'fixtures', kit.fixtures[0]!.id).fixtures).toEqual([]);
  });

  it('un élément sans nom ne peut pas être enregistré', () => {
    expect(cannotSave('cameras', { ...venice, body: ' ' })).toMatch(/boîtier/);
    expect(cannotSave('fixtures', { ...fresnel, name: '' })).toBeTruthy();
    expect(cannotSave('reflectors', { id: 'r', name: '', type: 'diffuse', reflectance: null, presetId: 'poly' })).toBeNull();
  });

  it('caméra ajoutée au projet : remplit la caméra vierge d’un projet neuf (les plans la gardent), sinon nouvelle lettre', () => {
    const doc = newProject();
    const camA = doc.settings.cameras[0]!.id;
    const r1 = addFromKit(doc, 'cameras', venice);
    expect(r1.id).toBe(camA);
    expect(r1.doc.settings.cameras).toHaveLength(1);
    expect(r1.doc.settings.cameras[0]).toMatchObject({ label: 'A', body: 'Sony Venice 2', sensorWidthMm: 35.9 });
    // Déjà là à l'identique : rien n'est ajouté.
    expect(inProject(r1.doc, 'cameras', venice)).toBe(true);
    expect(addFromKit(r1.doc, 'cameras', venice).added).toBe(false);
    const r2 = addFromKit(r1.doc, 'cameras', { ...venice, mode: '8K 17:9', sensorHeightMm: 18.9 });
    expect(r2.doc.settings.cameras.map((c) => c.label)).toEqual(['A', 'B']);
    expect(nextCameraLabel(r2.doc)).toBe('C');
    expect(validateProject(r2.doc).ok).toBe(true);
  });

  it('projecteur ajouté au projet : copie avec un nouvel identifiant, projet valide', () => {
    const r = addFromKit(newProject(), 'fixtures', fresnel);
    expect(r.doc.settings.fixtures[0]).toMatchObject({ name: 'Fresnel 2K', watts: 2000 });
    expect(r.id).not.toBe('f1');
    expect(validateProject(r.doc).ok).toBe(true);
  });

  it('vocabulaire et exposition de départ appliqués aux nouveaux projets', () => {
    const kit = { ...emptyKit(), terms: { ...DEFAULT_TERMS, size: ['GP', 'Plan moyen'] }, exposure: { iso: 1280, fps: 25, shutterDeg: 172.8 } };
    const doc = applyKitDefaults(newProject(), kit);
    expect(doc.settings.terms.size).toEqual(['GP', 'Plan moyen']);
    expect(doc.settings.exposure).toEqual({ iso: 1280, fps: 25, shutterDeg: 172.8 });
    expect(applyKitDefaults(newProject(), emptyKit()).settings.terms).toEqual(DEFAULT_TERMS);
  });

  it('fichier illisible ou incomplet : refusé en bloc', () => {
    expect(parseKit(emptyKit()).ok).toBe(true);
    expect(parseKit({ ...emptyKit(), cameras: [{ ...venice, sensorWidthMm: -1 }] }).ok).toBe(false);
    expect(parseKit({ version: 2 }).ok).toBe(false);
    expect(parseKit(null).ok).toBe(false);
  });
});

describe('kitStatus', () => {
  it('absent, identique ou modifié depuis l’enregistrement', async () => {
    const { kitStatus } = await import('./kit');
    const kit = saveToKit(emptyKit(), 'fixtures', fresnel).kit;
    expect(kitStatus(emptyKit(), 'fixtures', fresnel)).toBe('absent');
    expect(kitStatus(kit, 'fixtures', { ...fresnel, id: 'x' })).toBe('same');
    expect(kitStatus(kit, 'fixtures', { ...fresnel, watts: 1000 })).toBe('differs');
    // Caméra : la lettre ne compte pas.
    const k2 = saveToKit(emptyKit(), 'cameras', venice).kit;
    expect(kitStatus(k2, 'cameras', { ...venice, label: 'C', id: 'z' })).toBe('same');
  });
});
