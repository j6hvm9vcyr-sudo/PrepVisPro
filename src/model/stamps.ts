/**
 * Tampons : mentions placées entre les séquences du découpage (TITRE, GÉNÉRIQUE DE FIN, CARTON…).
 *
 * Un tampon n'a ni plan ni numéro ; il ne change jamais la numérotation des plans.
 * Il est rattaché à la séquence qui le suit (`beforeSequenceId`), ou à la fin du film (null) :
 * ajouter une séquence en fin de film la place donc avant le GÉNÉRIQUE DE FIN.
 *
 * Toutes les opérations passent par le « déroulé » (séquences et tampons dans l'ordre du film),
 * puis le recomposent : la position d'un tampon ne peut ainsi jamais devenir incohérente.
 */
import { produce } from 'immer';
import type { Id, ProjectDoc, Sequence, Stamp } from './types';
import { newId } from './defaults';

/** Mentions proposées à la saisie (le texte reste libre). */
export const STAMP_SUGGESTIONS = ['TITRE', 'GÉNÉRIQUE DE DÉBUT', 'GÉNÉRIQUE DE FIN', 'CARTON', 'FONDU AU NOIR', 'ENTRACTE'] as const;

export type FlowItem = { kind: 'seq'; seq: Sequence } | { kind: 'stamp'; stamp: Stamp };

/** Séquences et tampons, dans l'ordre du film. */
export function filmFlow(doc: Pick<ProjectDoc, 'sequences' | 'stamps'>): FlowItem[] {
  const before = new Map<Id | null, Stamp[]>();
  const known = new Set(doc.sequences.map((s) => s.id));
  for (const t of doc.stamps) {
    // Rattachement inconnu (ne devrait pas arriver : refusé à l'ouverture) : en fin de film.
    const k = t.beforeSequenceId && known.has(t.beforeSequenceId) ? t.beforeSequenceId : null;
    before.set(k, [...(before.get(k) ?? []), t]);
  }
  const out: FlowItem[] = [];
  for (const s of doc.sequences) {
    for (const t of before.get(s.id) ?? []) out.push({ kind: 'stamp', stamp: t });
    out.push({ kind: 'seq', seq: s });
  }
  for (const t of before.get(null) ?? []) out.push({ kind: 'stamp', stamp: t });
  return out;
}

/** Recompose séquences et tampons à partir d'un déroulé. */
function fromFlow(items: FlowItem[]): { sequences: Sequence[]; stamps: Stamp[] } {
  const sequences: Sequence[] = [];
  const stamps: Stamp[] = [];
  items.forEach((it, i) => {
    if (it.kind === 'seq') {
      sequences.push(it.seq);
      return;
    }
    const next = items.slice(i + 1).find((x): x is Extract<FlowItem, { kind: 'seq' }> => x.kind === 'seq');
    const anchor = next ? next.seq.id : null;
    stamps.push(it.stamp.beforeSequenceId === anchor ? it.stamp : { ...it.stamp, beforeSequenceId: anchor });
  });
  return { sequences, stamps };
}

function withFlow(doc: ProjectDoc, items: FlowItem[]): ProjectDoc {
  const r = fromFlow(items);
  return produce(doc, (d) => {
    d.sequences = r.sequences as typeof d.sequences;
    d.stamps = r.stamps;
  });
}

const indexOf = (items: FlowItem[], id: Id) => items.findIndex((x) => (x.kind === 'seq' ? x.seq.id : x.stamp.id) === id);

/**
 * Ajoute un tampon. `where` : avant ou après une séquence ; sans séquence, en fin de film.
 */
export function addStamp(doc: ProjectDoc, text: string, where: { before: Id } | { after: Id } | null): { doc: ProjectDoc; id: Id } {
  const stamp: Stamp = { id: newId('tp'), text: text.trim(), note: '', beforeSequenceId: null };
  const items = filmFlow(doc);
  let at = items.length;
  if (where && 'before' in where) {
    const i = indexOf(items, where.before);
    if (i >= 0) at = i;
  } else if (where && 'after' in where) {
    const i = indexOf(items, where.after);
    if (i >= 0) at = i + 1;
  }
  items.splice(at, 0, { kind: 'stamp', stamp });
  return { doc: withFlow(doc, items), id: stamp.id };
}

export function updateStamp(doc: ProjectDoc, id: Id, patch: Partial<Pick<Stamp, 'text' | 'note'>>): ProjectDoc {
  return produce(doc, (d) => {
    const t = d.stamps.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  });
}

export function removeStamp(doc: ProjectDoc, id: Id): ProjectDoc {
  if (!doc.stamps.some((x) => x.id === id)) return doc;
  return produce(doc, (d) => void (d.stamps = d.stamps.filter((x) => x.id !== id)));
}

/**
 * Déplace d'un cran dans le déroulé un tampon ou une séquence (-1 vers le début, +1 vers la fin).
 * Une séquence passe un tampon comme elle passerait une autre séquence.
 */
export function moveInFlow(doc: ProjectDoc, id: Id, delta: -1 | 1): ProjectDoc {
  const items = filmFlow(doc);
  const i = indexOf(items, id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return doc;
  [items[i], items[j]] = [items[j]!, items[i]!];
  return withFlow(doc, items);
}

/** Position dans le déroulé : premier, dernier (pour griser Monter / Descendre). */
export function flowBounds(doc: ProjectDoc, id: Id): { first: boolean; last: boolean } {
  const items = filmFlow(doc);
  const i = indexOf(items, id);
  return { first: i <= 0, last: i < 0 || i === items.length - 1 };
}

/**
 * Supprime une séquence en gardant les tampons à leur place dans le film
 * (un tampon placé juste avant elle passe avant la séquence suivante).
 */
export function deleteSequenceInFlow(doc: ProjectDoc, seqId: Id): ProjectDoc {
  const items = filmFlow(doc).filter((x) => x.kind !== 'seq' || x.seq.id !== seqId);
  return withFlow(doc, items);
}

/** Tampons rattachés à une séquence disparue : envoyés en fin de film (filet de sécurité). */
export function cleanupStamps(doc: ProjectDoc): ProjectDoc {
  const ids = new Set(doc.sequences.map((s) => s.id));
  if (!doc.stamps.some((t) => t.beforeSequenceId && !ids.has(t.beforeSequenceId))) return doc;
  return withFlow(doc, filmFlow(doc));
}
