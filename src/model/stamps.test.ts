import { describe, expect, it } from 'vitest';
import { addStamp, cleanupStamps, deleteSequenceInFlow, filmFlow, flowBounds, moveInFlow, removeStamp, updateStamp } from './stamps';
import { doc, plan, seq } from './testkit';
import { insertSequenceAfter } from './ops';
import { validateProject } from './schema';
import { migrate } from './migrate';
import { newProject } from './defaults';
import { produce } from 'immer';

const project = () => doc((cam) => ['1', '2', '3'].map((n) => seq(n, [plan(cam)])));
const order = (d: ReturnType<typeof project>) => filmFlow(d).map((x) => (x.kind === 'seq' ? x.seq.number : x.stamp.text));

describe('tampons entre séquences', () => {
  it('ajout avant, après, en fin de film', () => {
    let d = project();
    const [s1, s2] = d.sequences;
    d = addStamp(d, 'TITRE', { after: s1!.id }).doc;
    d = addStamp(d, 'GÉNÉRIQUE DE FIN', null).doc;
    d = addStamp(d, ' CARTON ', { before: s2!.id }).doc;
    expect(order(d)).toEqual(['1', 'TITRE', 'CARTON', '2', '3', 'GÉNÉRIQUE DE FIN']);
    expect(d.stamps.find((t) => t.text === 'GÉNÉRIQUE DE FIN')!.beforeSequenceId).toBeNull();
    expect(validateProject(JSON.parse(JSON.stringify(d))).ok).toBe(true);
  });

  it('une séquence ajoutée en fin de film reste avant le générique de fin', () => {
    let d = addStamp(project(), 'GÉNÉRIQUE DE FIN', null).doc;
    d = insertSequenceAfter(d, d.sequences[2]!.id, '4').doc;
    expect(order(d)).toEqual(['1', '2', '3', '4', 'GÉNÉRIQUE DE FIN']);
  });

  it('une séquence insérée juste avant un tampon se place avant lui', () => {
    const base = project();
    let d = addStamp(base, 'TITRE', { after: base.sequences[0]!.id }).doc;
    d = insertSequenceAfter(d, base.sequences[0]!.id, '1A').doc;
    expect(order(d)).toEqual(['1', '1A', 'TITRE', '2', '3']);
  });

  it('déplacer : un tampon et une séquence avancent d’un cran dans le film', () => {
    const base = project();
    let d = addStamp(base, 'TITRE', { after: base.sequences[0]!.id }).doc;
    const t = d.stamps[0]!.id;
    d = moveInFlow(d, t, 1);
    expect(order(d)).toEqual(['1', '2', 'TITRE', '3']);
    d = moveInFlow(d, base.sequences[2]!.id, -1);
    expect(order(d)).toEqual(['1', '2', '3', 'TITRE']);
    expect(d.stamps[0]!.beforeSequenceId).toBeNull();
    expect(moveInFlow(d, t, 1)).toBe(d);
    expect(flowBounds(d, t)).toEqual({ first: false, last: true });
    d = moveInFlow(moveInFlow(moveInFlow(d, t, -1), t, -1), t, -1);
    expect(order(d)).toEqual(['TITRE', '1', '2', '3']);
    expect(flowBounds(d, t).first).toBe(true);
  });

  it('supprimer la séquence qui suit un tampon : le tampon garde sa place', () => {
    const base = project();
    let d = addStamp(base, 'TITRE', { before: base.sequences[1]!.id }).doc;
    d = deleteSequenceInFlow(d, base.sequences[1]!.id);
    expect(order(d)).toEqual(['1', 'TITRE', '3']);
    expect(d.stamps[0]!.beforeSequenceId).toBe(base.sequences[2]!.id);
    d = deleteSequenceInFlow(d, base.sequences[2]!.id);
    expect(order(d)).toEqual(['1', 'TITRE']);
    expect(d.stamps[0]!.beforeSequenceId).toBeNull();
  });

  it('modifier, supprimer', () => {
    const base = project();
    let d = addStamp(base, 'TITRE', null).doc;
    const id = d.stamps[0]!.id;
    d = updateStamp(d, id, { note: 'Sur noir, 10 s' });
    expect(d.stamps[0]).toMatchObject({ text: 'TITRE', note: 'Sur noir, 10 s' });
    d = removeStamp(d, id);
    expect(d.stamps).toEqual([]);
    expect(removeStamp(d, id)).toBe(d);
  });

  it('les tampons ne changent pas la numérotation des plans', async () => {
    const { computeNumbers } = await import('./numbering');
    const base = project();
    const with_ = addStamp(base, 'TITRE', { before: base.sequences[1]!.id }).doc;
    expect([...computeNumbers(with_)]).toEqual([...computeNumbers(base)]);
  });

  it('rattachement perdu : renvoyé en fin de film ; fichier incohérent : refusé', () => {
    const base = project();
    const bad = produce(base, (x) => void x.stamps.push({ id: 't', text: 'TITRE', note: '', beforeSequenceId: 'absente' }));
    expect(cleanupStamps(bad).stamps[0]!.beforeSequenceId).toBeNull();
    expect(cleanupStamps(base)).toBe(base);
    const r = validateProject(JSON.parse(JSON.stringify(bad)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('tampon');
    const twice = produce(base, (x) => {
      x.stamps.push({ id: 't', text: 'A', note: '', beforeSequenceId: null }, { id: 't', text: 'B', note: '', beforeSequenceId: null });
    });
    expect(validateProject(JSON.parse(JSON.stringify(twice))).ok).toBe(false);
  });

  it('format 14 → 15 : aucun tampon', () => {
    const { stamps: _s, ...cur } = newProject('X');
    const m = migrate(JSON.parse(JSON.stringify({ ...cur, schemaVersion: 14 })));
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.stamps).toEqual([]);
  });
});
