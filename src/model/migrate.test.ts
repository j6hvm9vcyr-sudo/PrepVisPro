import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { validateProject } from './schema';
import { newProject } from './defaults';
import { produce } from 'immer';
import { addElements, addFloorPlan, newFloorPlan } from './floorOps';
import { sampleProjectMultiCam } from './sample';

describe('mise à niveau des fichiers', () => {
  it('format 1 → 3 : ajoute texte de scène et dépouillement, le reste est intact', () => {
    const v2 = newProject('X');
    const { floorPlans: _f, ...noFloor } = v2;
    const v1 = JSON.parse(
      JSON.stringify({
        ...noFloor,
        schemaVersion: 1,
        sequences: v2.sequences.map(({ scriptText: _s, breakdown: _b, ...rest }) => rest),
      }),
    );
    const m = migrate(v1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(v2);
  });
  it('format 15 → 19 : réglages complétés, clés dans l’ordre du format', () => {
    const cur = newProject('X');
    const { shotPresets: _s, exportPresets: _e, floorIcons: _f, ...oldSettings } = cur.settings;
    const v15 = JSON.parse(JSON.stringify({ ...cur, schemaVersion: 15, settings: oldSettings }));
    const m = migrate(v15);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc).toEqual(cur);
    expect(Object.keys(r.doc.settings)).toEqual(Object.keys(cur.settings));
  });
  it('format 18 → 19 : « plan suivant » et abréviations quittent le projet (repris dans les préférences, voir prefs.test.ts)', () => {
    const cur = newProject('X');
    const { timeZone, ...rest } = cur.settings;
    const carryOver = { size: true, axis: false, angle: false, focal: true, movement: false, grip: true };
    const v18 = JSON.parse(JSON.stringify({ ...cur, schemaVersion: 18, settings: { ...rest, carryOver, aliases: { Dolly: ['grué'] }, timeZone } }));
    const m = migrate(v18);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok && r.doc).toEqual(cur);
    expect(r.ok && Object.keys(r.doc.settings)).toEqual(Object.keys(cur.settings));
    // Le projet d'origine n'est pas modifié.
    expect(v18.settings.carryOver).toEqual(carryOver);
  });
  it('format 16 → 17 : modèles d’export et icônes des figures dans le projet (aucun)', () => {
    const cur = newProject('X');
    const { exportPresets: _e, floorIcons: _f, ...old } = cur.settings;
    const m = migrate(JSON.parse(JSON.stringify({ ...cur, schemaVersion: 16, settings: old })));
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok && r.doc.settings.exportPresets).toEqual([]);
    expect(r.ok && r.doc.settings.floorIcons).toEqual({ camera: null, actor: null, light: null });
    expect(r.ok && Object.keys(r.doc.settings)).toEqual(Object.keys(cur.settings));
  });
  it('format 17 → 18 : icônes des figures avec leur sens (les icônes déjà posées regardaient vers le haut)', () => {
    const m = migrate({
      schemaVersion: 17,
      settings: { fixtures: [{ id: 'f', name: 'F' }] },
      floorPlans: [{ id: 'p', elements: [{ id: 'c', kind: 'camera' }, { id: 'a', kind: 'actor', icon: 'images/a.png' }, { id: 'l', kind: 'light', icon: null }, { id: 'i', kind: 'icon', icon: 'images/i.png' }] }],
    });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const d = m.raw as { settings: { fixtures: { icon: unknown }[] }; floorPlans: { elements: { icon: unknown }[] }[] };
    expect(d.settings.fixtures[0]!.icon).toBeNull();
    expect(d.floorPlans[0]!.elements.map((e) => e.icon)).toEqual([null, { file: 'images/a.png', name: '', turn: 0 }, null, 'images/i.png']);
  });
  it('format 9 → 10 : projecteurs sans gélatine, aucune matière de réflecteur', () => {
    const cur = newProject('X');
    const { reflectors: _r, ...settings9 } = cur.settings;
    const v9 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 9,
        settings: settings9,
        floorPlans: [
          {
            id: 'fp',
            name: 'P',
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            elements: [
              {
                id: 'l',
                kind: 'light',
                at: { x: 0, y: 0 },
                rotation: 0,
                fixtureId: null,
                mode: 0,
                dimmer: 1,
                lossStops: 0.5,
                circuit: '',
                label: '',
                icon: null,
                size: 40,
              },
            ],
          },
        ],
      }),
    );
    const m = migrate(v9);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.reflectors).toEqual([]);
    expect(r.doc.floorPlans[0]!.elements[0]).toMatchObject({
      gels: [],
      lossStops: 0.5,
    });
  });
  it('format 10 → 11 : soleil (aucune position, aucun nord, aucune heure, fuseau de l’ordinateur)', () => {
    const cur = newProject('X');
    const { timeZone: _t, ...settings10 } = cur.settings;
    const v10 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 10,
        settings: settings10,
        sequences: cur.sequences.map(({ gps: _g, ...rest }) => rest),
        floorPlans: [
          {
            id: 'fp',
            name: 'P',
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            elements: [],
          },
        ],
      }),
    );
    const m = migrate(v10);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.timeZone).toBeNull();
    expect(r.doc.sequences.every((s) => s.gps === null)).toBe(true);
    expect(r.doc.floorPlans[0]).toMatchObject({ northDeg: null, sunAt: null });
  });
  it('relecture à l’identique (projet avec plan au sol et tous les éléments)', () => {
    let d = addFloorPlan(sampleProjectMultiCam(), {
      ...newFloorPlan('P', []),
      northDeg: 12,
      sunAt: { date: '2026-06-21', time: '14:00' },
    });
    d = produce(d, (x) => {
      x.settings.fixtures.push({
        id: 'f',
        name: 'F',
        watts: null,
        kind: 'led',
        modes: [{ label: '', lux: null, distanceM: null, beamDeg: null }],
        icon: null,
      });
      x.settings.reflectors.push({
        id: 'r',
        name: 'Poly',
        type: 'diffuse',
        reflectance: 0.8,
        presetId: null,
      });
      x.settings.timeZone = 'Europe/Paris';
      x.sequences[0]!.gps = { lat: 48.85, lon: 2.35 };
    });
    d = addElements(d, d.floorPlans[0]!.id, [
      {
        id: 'a',
        kind: 'actor',
        at: { x: 1, y: 2 },
        rotation: 0,
        name: 'A',
        color: '#000000',
        positions: [],
        icon: null,
        size: 40,
      },
      {
        id: 'c',
        kind: 'camera',
        at: { x: 1, y: 2 },
        rotation: 0,
        planId: null,
        setupId: null,
        showFov: true,
        positions: [],
        icon: null,
      },
      {
        id: 'i',
        kind: 'icon',
        at: { x: 1, y: 2 },
        rotation: 0,
        icon: 'icons/x.png',
        label: '',
        size: 40,
      },
      {
        id: 't',
        kind: 'text',
        at: { x: 1, y: 2 },
        rotation: 0,
        text: 'T',
        size: 14,
      },
      {
        id: 'l',
        kind: 'light',
        at: { x: 1, y: 2 },
        rotation: 0,
        fixtureId: 'f',
        mode: 0,
        dimmer: 1,
        gels: ['lee-216'],
        lossStops: 0,
        circuit: '',
        label: '',
        icon: null,
        size: 40,
        positions: [],
      },
      {
        id: 'b',
        kind: 'reflector',
        at: { x: 1, y: 2 },
        rotation: 0,
        materialId: 'r',
        widthM: 1.22,
        heightM: 1.22,
        label: '',
        icon: null,
        size: 40,
      },
    ]);
    const r = validateProject(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toStrictEqual(d);
  });
  it('format 12 → 13 : icônes des personnages et réflecteurs (aucune), matières sans preset', () => {
    const cur = newProject('X');
    const v12 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 12,
        settings: {
          ...cur.settings,
          reflectors: [{ id: 'm', name: 'Poly', type: 'diffuse', reflectance: 0.8 }],
        },
        floorPlans: [
          {
            id: 'fp',
            name: 'P',
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            northDeg: null,
            sunAt: null,
            elements: [
              {
                id: 'a',
                kind: 'actor',
                at: { x: 0, y: 0 },
                rotation: 0,
                name: 'A',
                color: '#000',
                path: [],
              },
              {
                id: 'r',
                kind: 'reflector',
                at: { x: 0, y: 0 },
                rotation: 0,
                materialId: 'm',
                widthM: 1,
                heightM: 1,
                label: '',
              },
            ],
          },
        ],
      }),
    );
    const m = migrate(v12);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.reflectors[0]).toMatchObject({
      reflectance: 0.8,
      presetId: null,
    });
    expect(r.doc.floorPlans[0]!.elements.map((e) => ('icon' in e ? e.icon : 'x'))).toEqual([null, null]);
  });
  it('format 13 → 14 : les trajets deviennent des positions (personnage tourné dans le sens de la marche)', () => {
    const cur = newProject('X');
    const v13 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 13,
        floorPlans: [
          {
            id: 'fp',
            name: 'P',
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            northDeg: null,
            sunAt: null,
            elements: [
              { id: 'a', kind: 'actor', at: { x: 0, y: 0 }, rotation: 180, name: 'A', color: '#000', path: [{ x: 100, y: 0 }, { x: 100, y: 100 }], icon: null, size: 40 },
              { id: 'c', kind: 'camera', at: { x: 0, y: 0 }, rotation: 45, planId: null, setupId: null, showFov: true, path: [{ x: 0, y: -50 }] },
              { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 0, fixtureId: null, mode: 0, dimmer: 1, gels: [], lossStops: 0, circuit: '', label: '', icon: null, size: 40 },
            ],
          },
        ],
      }),
    );
    const m = migrate(v13);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, c, l] = r.doc.floorPlans[0]!.elements as unknown as { positions: { at: { x: number; y: number }; rotation: number }[] }[];
    // Vers la droite (90°), puis vers le bas (180°).
    expect(a!.positions).toEqual([
      { at: { x: 100, y: 0 }, rotation: 90 },
      { at: { x: 100, y: 100 }, rotation: 180 },
    ]);
    // Travelling : la caméra garde son orientation.
    expect(c!.positions).toEqual([{ at: { x: 0, y: -50 }, rotation: 45 }]);
    expect(l!.positions).toEqual([]);
    expect('path' in a!).toBe(false);
  });
  it('refuse ce qui n’est pas un projet', () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate({}).ok).toBe(false);
    expect(migrate({ schemaVersion: 99 }).ok).toBe(false);
  });
});
