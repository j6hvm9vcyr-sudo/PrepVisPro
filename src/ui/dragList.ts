/**
 * Réordonner une liste en glissant une ligne par sa poignée (⋮⋮). La ligne survolée montre où
 * l'élément va tomber (trait avant ou après). Une liste ne reçoit que ses propres lignes.
 * Le clavier fait la même chose (⌥↑↓, voir reorder.ts).
 */
import { useState, type DragEvent } from 'react';

let active: { list: string; index: number } | null = null;

export type DropPos = 'before' | 'after';

/** Position finale d'un élément `from` lâché avant ou après la ligne `index`. */
export function dropTarget(from: number, index: number, pos: DropPos): number {
  const to = pos === 'before' ? index : index + 1;
  return to > from ? to - 1 : to;
}

/**
 * Glisser-déposer d'une ligne : `handle` va sur la poignée, `row` sur la ligne entière.
 * `move(from, to)` n'est appelé que si la place change.
 */
export function useRowDrag(list: string, index: number, move: (from: number, to: number) => void) {
  const [over, setOver] = useState<DropPos | null>(null);
  const handle = {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      active = { list, index };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      const row = e.currentTarget.closest('[data-drag-row]');
      if (row instanceof HTMLElement) e.dataTransfer.setDragImage(row, 12, 12);
    },
    onDragEnd: () => {
      active = null;
    },
  };
  const row = {
    'data-drag-row': true,
    className: over ? `drop-${over}` : '',
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!active || active.list !== list) return;
      e.preventDefault();
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const pos: DropPos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
      if (pos !== over) setOver(pos);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      const a = active;
      const pos = over;
      setOver(null);
      if (!a || a.list !== list || !pos) return;
      e.preventDefault();
      e.stopPropagation();
      active = null;
      const to = dropTarget(a.index, index, pos);
      if (to !== a.index) move(a.index, to);
    },
  };
  return { handle, row };
}
