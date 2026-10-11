/**
 * Notes datées des séquences et des plans : prendre, cocher, modifier, retirer ; les relire toutes ;
 * les écrire dans le tableau et les exports.
 */
import { produce, type Draft } from 'immer';
import type { Id, Note, ProjectDoc } from './types';
import { newId } from './defaults';

/** À qui appartient une note : une séquence ou un plan. */
export type NoteOwner = { seqId: Id } | { planId: Id };

function ownerNotes(d: Draft<ProjectDoc>, owner: NoteOwner): Draft<Note>[] | null {
  for (const s of d.sequences) {
    if ('seqId' in owner) {
      if (s.id === owner.seqId) return s.notes;
      continue;
    }
    const p = s.plans.find((x) => x.id === owner.planId);
    if (p) return p.notes;
  }
  return null;
}

export function notesOf(doc: ProjectDoc, owner: NoteOwner): Note[] {
  for (const s of doc.sequences) {
    if ('seqId' in owner) {
      if (s.id === owner.seqId) return s.notes;
    } else {
      const p = s.plans.find((x) => x.id === owner.planId);
      if (p) return p.notes;
    }
  }
  return [];
}

/** Ajoute une note (texte non vide) ; renvoie le document inchangé sinon. */
export function addNote(doc: ProjectDoc, owner: NoteOwner, text: string, now: number): { doc: ProjectDoc; id: Id | null } {
  const t = text.trim();
  if (!t) return { doc, id: null };
  const id = newId('nt');
  let found = false;
  const next = produce(doc, (d) => {
    const list = ownerNotes(d, owner);
    if (!list) return;
    list.push({ id, text: t, createdAt: Math.round(now), done: false });
    found = true;
  });
  return found ? { doc: next, id } : { doc, id: null };
}

export function updateNote(doc: ProjectDoc, owner: NoteOwner, noteId: Id, patch: { text?: string; done?: boolean }): ProjectDoc {
  return produce(doc, (d) => {
    const n = ownerNotes(d, owner)?.find((x) => x.id === noteId);
    if (!n) return;
    if (patch.text !== undefined) n.text = patch.text;
    if (patch.done !== undefined) n.done = patch.done;
  });
}

export function removeNote(doc: ProjectDoc, owner: NoteOwner, noteId: Id): ProjectDoc {
  return produce(doc, (d) => {
    const list = ownerNotes(d, owner);
    const i = list?.findIndex((x) => x.id === noteId) ?? -1;
    if (list && i >= 0) list.splice(i, 1);
  });
}

/** Texte des notes pour les exports et le tableau : une par ligne ; « ✓ » devant celles qui sont faites. */
export function notesText(notes: readonly Note[], onlyOpen = false): string {
  return notes
    .filter((n) => n.text.trim() && !(onlyOpen && n.done))
    .map((n) => (n.done ? `✓ ${n.text.trim()}` : n.text.trim()))
    .join('\n');
}

export function openCount(notes: readonly Note[]): number {
  return notes.filter((n) => !n.done && n.text.trim()).length;
}

/** Date d'une note, à la française (« 11 oct. 2026 ») ; null si inconnue (note d'avant la 0.13). */
export function noteDate(n: Note): string | null {
  if (n.createdAt === null) return null;
  return new Date(n.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
