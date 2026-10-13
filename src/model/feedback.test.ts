import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { sampleProject } from './sample';
import { addFeedback, createPlanFromItem, fieldValue, itemOwner, itemToNote, noteText, pendingCount, readRetours, setItemState } from './feedback';
import { addNote } from './notes';
import { validateProject } from './schema';

const doc = sampleProject();
const p12 = doc.sequences[0]!.plans[1]!;
const file = (over: object = {}) =>
  JSON.stringify({
    topshotRetours: 1,
    id: 'rt_1',
    projectId: doc.id,
    publication: 2,
    author: ' Margaux ',
    role: 'Réalisation',
    sentAt: Date.UTC(2026, 9, 12, 16, 40),
    items: [
      { id: 'a', planId: p12.id, seqId: doc.sequences[0]!.id, code: '1/2', verdict: 'revoir', text: ' Plutôt un 50 ', proposal: { setupId: p12.cameras[0]!.id, field: 'focal', text: '50', before: '75 mm' } },
      { id: 'b', planId: null, seqId: doc.sequences[2]!.id, code: 'Séq. 3', verdict: null, text: 'Lampe déjà allumée ?', proposal: null },
      { id: 'c', planId: 'pl_disparu', seqId: 'sq_disparue', code: '9/9', verdict: 'ok', text: '', proposal: null },
      { id: 'vide', planId: p12.id, seqId: null, code: '1/2', verdict: null, text: '  ', proposal: null },
    ],
    ...over,
  });

describe('retours', () => {
  it('lit un fichier de retours de ce projet (les retours vides sont ignorés)', () => {
    const r = readRetours(file(), doc, 1000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feedback.author).toBe('Margaux');
    expect(r.feedback.receivedAt).toBe(1000);
    expect(r.feedback.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(r.feedback.items.every((i) => i.state === 'new')).toBe(true);
    expect(r.feedback.items[0]!.text).toBe('Plutôt un 50');
  });

  it('refuse un autre projet, un fichier abîmé, une autre version', () => {
    expect(readRetours(file({ projectId: 'prj_autre' }), doc, 0)).toEqual({ ok: false, error: 'Ces retours concernent un autre projet.' });
    expect(readRetours('pas du json', doc, 0).ok).toBe(false);
    expect(readRetours(file({ topshotRetours: 3 }), doc, 0).ok).toBe(false);
    expect(readRetours(file({ items: [{ id: 'x' }] }), doc, 0).ok).toBe(false);
  });

  it('rangés une seule fois avec le projet ; en note datée du jour d’envoi ; le projet reste valide', () => {
    const r = readRetours(file(), doc, 1000);
    if (!r.ok) throw new Error(r.error);
    const a = addFeedback(doc, r.feedback);
    expect(a.added).toBe(true);
    expect(addFeedback(a.doc, r.feedback).added).toBe(false);
    expect(pendingCount(a.doc)).toBe(3);
    const n = itemToNote(a.doc, 'rt_1', 'a')!;
    const note = n.sequences[0]!.plans[1]!.notes.at(-1)!;
    expect(note.text).toBe('Margaux (réalisation) · à revoir · Plutôt un 50 · propose Focale : 50');
    expect(note.createdAt).toBe(Date.UTC(2026, 9, 12, 16, 40));
    expect(pendingCount(n)).toBe(2);
    // Retour sur une séquence ; plan et séquence disparus : pas de note possible.
    expect(itemOwner(n, r.feedback.items[1]!)).toEqual({ seqId: doc.sequences[2]!.id });
    expect(itemToNote(n, 'rt_1', 'c')).toBeNull();
    const ig = setItemState(n, 'rt_1', 'c', 'ignored');
    expect(pendingCount(ig)).toBe(1);
    expect(validateProject(JSON.parse(JSON.stringify(ig))).ok).toBe(true);
    expect(noteText(r.feedback, r.feedback.items[2]!)).toBe('Margaux (réalisation) · validé');
  });

  it('un même fichier en double dans le projet est refusé à la relecture', () => {
    const r = readRetours(file(), doc, 1000);
    if (!r.ok) throw new Error(r.error);
    const twice = produce(doc, (d) => void d.feedback.push(r.feedback, r.feedback));
    expect(validateProject(JSON.parse(JSON.stringify(twice))).ok).toBe(false);
  });
});

describe('retours 2 (0.25) : notes de réunion rangées', () => {
  const seq = doc.sequences[1]!;
  const withNote = addNote(doc, { seqId: seq.id }, 'En 2 plans. Puis un plan plus serré.', 1);
  const noteId = withNote.id!;
  const base = withNote.doc;
  const v2 = (items: object[], over: object = {}) =>
    JSON.stringify({ topshotRetours: 2, id: 'rt_n', projectId: base.id, publication: null, author: 'Claude', role: 'Notes de réunion', sentAt: 5, items, ...over });
  const items = [
    { id: 'c', planId: 'pl_neuf', seqId: seq.id, code: '2/9', verdict: null, text: 'Plan plus serré', proposal: null, create: { afterPlanId: seq.plans[0]!.id }, noteIds: [noteId], quote: 'En 2 plans.' },
    { id: 'a', planId: 'pl_neuf', seqId: seq.id, code: '2/9', verdict: null, text: '', proposal: { setupId: null, field: 'action', text: 'Plus serré, proche d’Anaïs', before: '' }, noteIds: [noteId, 'nt_inconnue'], quote: 'Puis un plan plus serré.' },
    { id: 'd', planId: seq.plans[0]!.id, seqId: seq.id, code: '2/1', verdict: null, text: '', proposal: { setupId: null, field: 'duration', text: '12', before: '' } },
  ];

  it('lit un fichier sans publication ; garde seulement les notes du projet ; crée le plan au bon endroit', () => {
    const r = readRetours(v2(items), base, 9);
    if (!r.ok) throw new Error(r.error);
    expect(r.feedback.publication).toBeNull();
    expect(r.feedback.items[1]!.noteIds).toEqual([noteId]);
    expect(r.feedback.items[2]!.create).toBeNull();
    const a = addFeedback(base, r.feedback).doc;
    const c = createPlanFromItem(a, 'rt_n', 'c')!;
    expect(c.sequences[1]!.plans.map((p) => p.id).indexOf('pl_neuf')).toBe(1);
    expect(c.sequences[1]!.plans[1]!.cameras[0]!.cameraId).toBe(seq.plans[0]!.cameras[0]!.cameraId);
    expect(pendingCount(c)).toBe(2);
    // Créer deux fois : rien de plus.
    expect(createPlanFromItem(c, 'rt_n', 'c')!.sequences[1]!.plans).toHaveLength(seq.plans.length + 1);
    expect(fieldValue(c, 'pl_neuf', null, 'action')).toBe('');
    expect(fieldValue(c, seq.plans[0]!.id, null, 'duration')).toBe('');
    expect(noteText(r.feedback, r.feedback.items[0]!)).toBe('Claude (notes de réunion) · nouveau plan 2/9 · Plan plus serré');
    // La note d'origine est cochée quand ses deux retours sont traités.
    const n1 = c.sequences[1]!.notes.find((n) => n.id === noteId)!;
    expect(n1.done).toBe(false);
    const done = setItemState(c, 'rt_n', 'a', 'ignored');
    expect(done.sequences[1]!.notes.find((n) => n.id === noteId)!.done).toBe(true);
    expect(validateProject(JSON.parse(JSON.stringify(done))).ok).toBe(true);
  });

  it('en fin de séquence si le plan d’avant a disparu ; séquence retirée : rien', () => {
    const r = readRetours(v2([{ ...items[0]!, create: { afterPlanId: 'pl_parti' } }]), base, 9);
    if (!r.ok) throw new Error(r.error);
    const a = addFeedback(base, r.feedback).doc;
    expect(createPlanFromItem(a, 'rt_n', 'c')!.sequences[1]!.plans.at(-1)!.id).toBe('pl_neuf');
    const gone = produce(a, (d) => void d.sequences.splice(1, 1));
    expect(createPlanFromItem(gone, 'rt_n', 'c')).toBeNull();
  });

  it('refuse un plan à créer sans séquence, déjà pris ailleurs ou créé deux fois', () => {
    expect(readRetours(v2([{ ...items[0]!, seqId: null }]), base, 0).ok).toBe(false);
    expect(readRetours(v2([{ ...items[0]!, planId: doc.sequences[0]!.plans[0]!.id }]), base, 0).ok).toBe(false);
    expect(readRetours(v2([{ ...items[0]!, planId: 'pl neuf' }]), base, 0).ok).toBe(false);
    expect(readRetours(v2([items[0]!, { ...items[0]!, id: 'c2' }]), base, 0).ok).toBe(false);
    // Le plan existe déjà dans la même séquence (fichier rangé une seconde fois) : accepté.
    expect(readRetours(v2([{ ...items[0]!, planId: seq.plans[0]!.id }]), base, 0).ok).toBe(true);
  });
});
