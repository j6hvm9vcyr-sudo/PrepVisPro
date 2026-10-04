import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { validateProject } from './schema';
import { newProject } from './defaults';

describe('mise à niveau des fichiers', () => {
  it('format 1 → 3 : ajoute texte de scène et dépouillement, le reste est intact', () => {
    const v2 = newProject('X');
    const { floorPlans: _f, ...noFloor } = v2;
    const v1 = JSON.parse(JSON.stringify({ ...noFloor, schemaVersion: 1, sequences: v2.sequences.map(({ scriptText: _s, breakdown: _b, ...rest }) => rest) }));
    const m = migrate(v1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(v2);
  });
  it('format 9 → 10 : projecteurs sans gélatine, aucune matière de réflecteur', () => {
    const cur = newProject('X');
    const { reflectors: _r, ...settings9 } = cur.settings;
    const v9 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 9,
        settings: settings9,
        floorPlans: [{ id: 'fp', name: 'P', sequenceIds: [], background: null, scale: null, fovLengthM: 6, elements: [{ id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 0, fixtureId: null, mode: 0, dimmer: 1, lossStops: 0.5, circuit: '', label: '', icon: null, size: 40 }] }],
      }),
    );
    const m = migrate(v9);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.reflectors).toEqual([]);
    expect(r.doc.floorPlans[0]!.elements[0]).toMatchObject({ gels: [], lossStops: 0.5 });
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
        floorPlans: [{ id: 'fp', name: 'P', sequenceIds: [], background: null, scale: null, fovLengthM: 6, elements: [] }],
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
  it('refuse ce qui n’est pas un projet', () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate({}).ok).toBe(false);
    expect(migrate({ schemaVersion: 99 }).ok).toBe(false);
  });
});
