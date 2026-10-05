/** Ligne réordonnable par glisser-déposer (voir dragList.ts) ; `children` reçoit la poignée à placer. */
import type { ReactNode } from 'react';
import { useRowDrag } from './dragList';

export function DragRow({ list, index, move, className, label, as: Tag = 'div', children }: { list: string; index: number; move: (from: number, to: number) => void; className: string; label?: string; as?: 'div' | 'section'; children: (handle: ReactNode) => ReactNode }) {
  const { handle, row } = useRowDrag(list, index, move);
  const grip = (
    <span className="drag-handle" aria-hidden="true" title="Glisser pour déplacer (ou ⌥↑↓)" {...handle}>
      ⋮⋮
    </span>
  );
  return (
    <Tag {...row} className={`${className} ${row.className}`} aria-label={label}>
      {children(grip)}
    </Tag>
  );
}
