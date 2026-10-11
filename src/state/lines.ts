/** Lignes visibles du tableau (une par caméra de chaque plan), dans l'ordre du film. */
import type { Id, ProjectDoc, ProjectSettings } from '../model/types';
import { missingFields } from '../model/completeness';

export type Column = 'image' | 'action' | 'size' | 'axis' | 'angle' | 'focal' | 'movement' | 'grip' | 'duration';
/** Toutes les colonnes où le curseur peut aller, dans l'ordre du tableau (la colonne Notes n'en est pas : elle se modifie dans les détails). */
export const COLUMNS: readonly Column[] = ['image', 'action', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'duration'];

/** Colonnes affichées (Réglages › colonnes du tableau) : l'action est toujours là. */
export function visibleColumns(settings: Pick<ProjectSettings, 'tableColumns'>): Column[] {
  return COLUMNS.filter((c) => c === 'action' || (settings.tableColumns as readonly string[]).includes(c));
}

export interface Cursor {
  planId: Id;
  setupId: Id;
  col: Column;
}

export interface Line {
  seqId: Id;
  planId: Id;
  setupId: Id;
  setupIndex: number;
}

export interface LineFilter {
  collapsed: Record<Id, boolean>;
  onlyIncomplete: boolean;
}

export function visibleLines(doc: ProjectDoc, f: LineFilter): Line[] {
  const out: Line[] = [];
  for (const s of doc.sequences) {
    if (f.collapsed[s.id]) continue;
    for (const p of s.plans) {
      if (f.onlyIncomplete && missingFields(p, doc.settings).length === 0) continue;
      p.cameras.forEach((c, i) => out.push({ seqId: s.id, planId: p.id, setupId: c.id, setupIndex: i }));
    }
  }
  return out;
}

/** Toutes les lignes, sans filtre (pour retrouver un plan masqué). */
export function allLines(doc: ProjectDoc): Line[] {
  return visibleLines(doc, { collapsed: {}, onlyIncomplete: false });
}

function lineIndex(lines: Line[], c: Cursor | null): number {
  if (!c) return -1;
  return lines.findIndex((l) => l.planId === c.planId && l.setupId === c.setupId);
}

/**
 * Déplace le curseur. `wrap` : en fin de ligne, passe à la ligne suivante (Tab).
 * Si le curseur n'est plus visible, il se place sur la première ligne visible.
 */
export function moveCursor(lines: Line[], c: Cursor | null, dRow: number, dCol: number, wrap = false, cols: readonly Column[] = COLUMNS): Cursor | null {
  if (!lines.length) return c;
  let i = lineIndex(lines, c);
  const action = cols.indexOf('action');
  // Colonne masquée entre-temps : on repart de l'action.
  let col = c && cols.includes(c.col) ? cols.indexOf(c.col) : Math.min(action + 1, cols.length - 1);
  if (i < 0) {
    const first = lines[0]!;
    return { planId: first.planId, setupId: first.setupId, col: cols[col]! };
  }
  col += dCol;
  if (wrap && col >= cols.length) {
    if (i < lines.length - 1) {
      i += 1;
      col = action;
    } else col = cols.length - 1;
  }
  if (wrap && col < 0) {
    if (i > 0) {
      i -= 1;
      col = cols.length - 1;
    } else col = 0;
  }
  col = Math.max(0, Math.min(cols.length - 1, col));
  i = Math.max(0, Math.min(lines.length - 1, i + dRow));
  const l = lines[i]!;
  return { planId: l.planId, setupId: l.setupId, col: cols[col]! };
}
