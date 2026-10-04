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
  it('refuse ce qui n’est pas un projet', () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate({}).ok).toBe(false);
    expect(migrate({ schemaVersion: 99 }).ok).toBe(false);
  });
});
