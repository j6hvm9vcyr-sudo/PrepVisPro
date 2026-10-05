import { describe, expect, it } from 'vitest';
import { addEquipment, addEquipmentMany, equipmentLabel, inProject, nextCameraLabel, parseOldKit, sourceOfProject, sourceSize } from './equipment';
import { newProject } from './defaults';
import { sampleProject } from './sample';
import { savePreset } from './shotPresets';
import { validateProject } from './schema';
import { setup, fr } from './testkit';
import type { Fixture, ProjectCamera } from './types';

const venice: ProjectCamera = { id: 'c1', label: 'A', body: 'Sony Venice 2', mode: '6K 3:2', sensorWidthMm: 35.9, sensorHeightMm: 24, squeeze: 1 };
const fresnel: Fixture = { id: 'f1', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [{ label: 'Spot', lux: 1000, distanceM: 5, beamDeg: 60 }] };

describe('matériel du projet', () => {
  it('caméra reprise : remplit la caméra vierge d’un projet neuf (les plans la gardent), sinon nouvelle lettre ; jamais en double', () => {
    const doc = newProject();
    const camA = doc.settings.cameras[0]!.id;
    const r1 = addEquipment(doc, 'cameras', venice);
    expect(r1.id).toBe(camA);
    expect(r1.doc.settings.cameras[0]).toMatchObject({ label: 'A', body: 'Sony Venice 2', sensorWidthMm: 35.9 });
    expect(inProject(r1.doc, 'cameras', { ...venice, label: 'Z', id: 'x' })).toBe(true);
    expect(addEquipment(r1.doc, 'cameras', venice).added).toBe(false);
    const r2 = addEquipment(r1.doc, 'cameras', { ...venice, mode: '8K 17:9', sensorHeightMm: 18.9 });
    expect(r2.doc.settings.cameras.map((c) => c.label)).toEqual(['A', 'B']);
    expect(nextCameraLabel(r2.doc)).toBe('C');
    expect(validateProject(r2.doc).ok).toBe(true);
  });

  it('reprise depuis un autre projet : projecteurs, plans types, modèles d’export copiés en une étape', () => {
    let src = sampleProject();
    src = savePreset(src, setup('c', { start: fr({ size: 'GP', focalMm: 50 }) })).doc;
    src = { ...src, settings: { ...src.settings, fixtures: [fresnel], exportPresets: [{ id: 'x1', name: 'Réal', options: { columns: ['plan'] } }] } };
    const from = sourceOfProject(src);
    expect(sourceSize(from)).toBe(src.settings.cameras.length + 3);
    const target = newProject();
    const r = addEquipmentMany(target, [
      { kind: 'fixtures', item: from.fixtures[0]! },
      { kind: 'shotPresets', item: from.shotPresets[0]! },
      { kind: 'exportPresets', item: from.exportPresets[0]! },
    ]);
    expect(r.added).toBe(3);
    expect(r.doc.settings.fixtures[0]).toMatchObject({ name: 'Fresnel 2K', watts: 2000 });
    expect(r.doc.settings.fixtures[0]!.id).not.toBe('f1');
    expect(equipmentLabel('shotPresets', r.doc.settings.shotPresets[0]!)).toBe('GP · 50 mm');
    expect(equipmentLabel('exportPresets', r.doc.settings.exportPresets[0]!)).toBe('Réal');
    expect(validateProject(r.doc).ok).toBe(true);
    // Copie : la source n'est pas touchée.
    expect(src.settings.fixtures[0]!.id).toBe('f1');
    expect(addEquipmentMany(r.doc, [{ kind: 'fixtures', item: fresnel }]).added).toBe(0);
  });

  it('ancien « Mon matériel » : lu tel quel, refusé en bloc s’il est abîmé', () => {
    const r = parseOldKit({ version: 1, cameras: [venice], lenses: [], fixtures: [fresnel], reflectors: [], terms: null, exposure: null });
    expect(r.ok && r.source.cameras[0]!.body).toBe('Sony Venice 2');
    expect(r.ok && r.source.exportPresets).toEqual([]);
    expect(parseOldKit({ version: 1, cameras: [{ ...venice, sensorWidthMm: -1 }], lenses: [], fixtures: [], reflectors: [] }).ok).toBe(false);
    expect(parseOldKit(null).ok).toBe(false);
  });
});
