import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { sampleProject } from './sample';
import { addFeedback, itemOwner, itemToNote, noteText, pendingCount, readRetours, setItemState } from './feedback';
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
    expect(readRetours(file({ topshotRetours: 2 }), doc, 0).ok).toBe(false);
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
