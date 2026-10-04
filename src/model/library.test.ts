import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addLibraryImagesToPlan, addToLibrary, knownHashes, libraryUsage, removeFromLibrary, setLibraryCaption, syncLibrary } from './library';
import { sampleProjectMultiCam } from './sample';
import { migrate } from './migrate';
import { validateProject } from './schema';
import { addFloorPlan, newFloorPlan } from './floorOps';
import { newProject } from './defaults';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

describe('bibliothèque d’images', () => {
  it('une image n’est importée qu’une fois (même empreinte ou même fichier)', () => {
    let d = sampleProjectMultiCam();
    const r1 = addToLibrary(d, [{ file: 'images/a.jpg', originalName: 'a.jpg', hash: H1 }]);
    d = r1.doc;
    expect(d.library).toHaveLength(1);
    const r2 = addToLibrary(d, [
      { file: 'images/a.jpg', originalName: 'a.jpg', hash: H1 },
      { file: 'images/copie.jpg', originalName: 'copie de a.jpg', hash: H1 },
      { file: 'images/b.jpg', originalName: 'b.jpg', hash: H2 },
    ]);
    expect(r2.doc.library.map((l) => l.file)).toEqual(['images/a.jpg', 'images/b.jpg']);
    expect(r2.reused).toBe(2);
    expect(r2.entries.map((e) => e.file)).toEqual(['images/a.jpg', 'images/b.jpg']);
    expect(knownHashes(r2.doc).get(H2)?.file).toBe('images/b.jpg');
    expect(addToLibrary(r2.doc, [{ file: 'images/b.jpg', originalName: 'b.jpg', hash: H2 }]).doc).toBe(r2.doc);
  });

  it('réutiliser dans plusieurs plans : même fichier, rien de copié ; pas deux fois dans un plan', () => {
    let d = addToLibrary(sampleProjectMultiCam(), [{ file: 'images/a.jpg', originalName: 'a.jpg', hash: H1 }]).doc;
    const lib = d.library[0]!.id;
    const p1 = d.sequences[0]!.plans[0]!.id;
    const p2 = d.sequences[1]!.plans[0]!.id;
    let r = addLibraryImagesToPlan(d, p1, [lib], 'scouting');
    expect(r.added).toBe(1);
    d = addLibraryImagesToPlan(r.doc, p2, [lib], 'reference').doc;
    r = addLibraryImagesToPlan(d, p1, [lib], 'scouting');
    expect(r.added).toBe(0);
    expect(r.doc).toBe(d);
    expect(d.sequences[0]!.plans[0]!.images[0]!.file).toBe('images/a.jpg');
    expect(d.sequences[1]!.plans[0]!.images[0]!.file).toBe('images/a.jpg');
    const u = libraryUsage(d).get('images/a.jpg')!;
    expect(u.plans.map((p) => [p.code, p.kind])).toEqual([
      ['1/1', 'scouting'],
      ['2/1', 'reference'],
    ]);
    // Utilisée : refus explicite, avec les plans concernés.
    const rm = removeFromLibrary(d, lib);
    expect(rm.ok).toBe(false);
    if (!rm.ok) expect(rm.error).toContain('1/1');
    d = setLibraryCaption(d, lib, 'Skyfall, Deakins');
    expect(d.library[0]!.caption).toBe('Skyfall, Deakins');
  });

  it('fond de plan au sol : compte comme une utilisation', () => {
    let d = addToLibrary(sampleProjectMultiCam(), [{ file: 'images/sat.png', originalName: 'sat.png', hash: null }]).doc;
    d = addFloorPlan(d, { ...newFloorPlan('Quai', []), background: { file: 'images/sat.png', width: 100, height: 50, opacity: 1, originalName: 'sat.png' } });
    expect(libraryUsage(d).get('images/sat.png')!.floorPlans.map((f) => f.name)).toEqual(['Quai']);
    expect(removeFromLibrary(d, d.library[0]!.id).ok).toBe(false);
  });

  it('non utilisée : retirée ; synchronisation : toute image utilisée figure dans la bibliothèque', () => {
    const d = addToLibrary(sampleProjectMultiCam(), [{ file: 'images/a.jpg', originalName: 'a.jpg', hash: null }]).doc;
    const r = removeFromLibrary(d, d.library[0]!.id);
    expect(r.ok && r.doc.library).toEqual([]);
    const withImg = produce(d, (x) => void x.sequences[0]!.plans[0]!.images.push({ id: 'i', kind: 'scouting', file: 'images/z.jpg', originalName: 'z.jpg', caption: '' }));
    expect(syncLibrary(withImg).library.map((l) => l.file)).toEqual(['images/a.jpg', 'images/z.jpg']);
    const synced = syncLibrary(withImg);
    expect(syncLibrary(synced)).toBe(synced);
  });

  it('format 14 → 15 : la bibliothèque reprend les images des plans et les fonds, sans doublon', () => {
    const cur = newProject('X');
    const { stamps: _s, library: _l, ...rest } = cur;
    const img = (file: string) => ({ id: file, kind: 'scouting', file, originalName: file.slice(7), caption: '' });
    const v14 = JSON.parse(
      JSON.stringify({
        ...rest,
        schemaVersion: 14,
        sequences: cur.sequences.map((s) => ({ ...s, plans: s.plans.map((p) => ({ ...p, images: [img('images/a.jpg'), { ...img('images/a.jpg'), id: 'x', kind: 'reference' }]})) })),
        floorPlans: [{ ...newFloorPlan('P', []), background: { file: 'images/f.png', width: 1, height: 1, opacity: 1, originalName: 'fond.png' } }],
      }),
    );
    const m = migrate(v14);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.library.map((l) => [l.file, l.originalName, l.hash])).toEqual([
      ['images/a.jpg', 'a.jpg', null],
      ['images/f.png', 'fond.png', null],
    ]);
    expect(r.doc.stamps).toEqual([]);
  });

  it('fichier incohérent : image en double dans la bibliothèque', () => {
    const d = produce(newProject('X'), (x) => {
      x.library.push({ id: 'a', file: 'images/a.jpg', originalName: '', caption: '', hash: null }, { id: 'b', file: 'images/a.jpg', originalName: '', caption: '', hash: null });
    });
    const r = validateProject(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(false);
  });
});
