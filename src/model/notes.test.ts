import { describe, expect, it } from 'vitest';
import { newProject } from './defaults';
import { addNote, noteDate, notesOf, notesText, openCount, removeNote, updateNote } from './notes';
import { validateProject } from './schema';

describe('notes', () => {
  it('prend, coche, modifie et retire une note de séquence ou de plan', () => {
    const doc0 = newProject();
    const seqId = doc0.sequences[0]!.id;
    const planId = doc0.sequences[0]!.plans[0]!.id;
    const t = Date.UTC(2026, 9, 11, 10, 0);
    const a = addNote(doc0, { seqId }, '  Horaires des trains  ', t);
    expect(a.id).not.toBeNull();
    expect(notesOf(a.doc, { seqId })).toEqual([{ id: a.id, text: 'Horaires des trains', createdAt: t, done: false }]);
    const b = addNote(a.doc, { planId }, 'Zoom au moteur', t + 1);
    expect(notesOf(b.doc, { planId })).toHaveLength(1);
    // Texte vide : rien n'est ajouté.
    expect(addNote(b.doc, { planId }, '   ', t).doc).toBe(b.doc);
    // Propriétaire inconnu : rien n'est ajouté.
    expect(addNote(b.doc, { planId: 'inconnu' }, 'x', t)).toEqual({ doc: b.doc, id: null });
    const c = updateNote(b.doc, { planId }, b.id!, { done: true, text: 'Zoom au moteur essayé' });
    expect(notesOf(c, { planId })[0]).toMatchObject({ done: true, text: 'Zoom au moteur essayé' });
    expect(validateProject(JSON.parse(JSON.stringify(c))).ok).toBe(true);
    const d = removeNote(c, { seqId }, a.id!);
    expect(notesOf(d, { seqId })).toEqual([]);
    expect(notesOf(d, { planId })).toHaveLength(1);
  });

  it('texte pour le tableau et les exports : une note par ligne, ✓ devant celles qui sont faites', () => {
    const notes = [
      { id: '1', text: 'A', createdAt: null, done: false },
      { id: '2', text: 'B', createdAt: 0, done: true },
      { id: '3', text: '  ', createdAt: 0, done: false },
    ];
    expect(notesText(notes)).toBe('A\n✓ B');
    expect(notesText(notes, true)).toBe('A');
    expect(openCount(notes)).toBe(1);
  });

  it('date à la française ; inconnue pour une note reprise d’avant la 0.13', () => {
    expect(noteDate({ id: 'x', text: 'a', createdAt: null, done: false })).toBeNull();
    expect(noteDate({ id: 'x', text: 'a', createdAt: Date.UTC(2026, 9, 11, 12), done: false })).toMatch(/11 oct\.? 2026/);
  });

  it('refuse deux notes de même identifiant dans un même plan', () => {
    const doc = newProject();
    const n = { id: 'n', text: 'a', createdAt: null, done: false };
    doc.sequences[0]!.plans[0]!.notes = [n, { ...n }];
    expect(validateProject(JSON.parse(JSON.stringify(doc))).ok).toBe(false);
  });
});
