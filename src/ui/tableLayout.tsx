/**
 * Largeur des colonnes et hauteur des rangées du tableau, ajustables à la souris (et au clavier).
 * Gardées dans les préférences de ce Mac ; elles ne changent ni le projet ni l'export.
 * Pendant un glissement, la valeur en cours est dans `useLive` ; elle n'est enregistrée qu'au relâchement.
 */
import { create } from 'zustand';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ROW_MAX_HEIGHT, ROW_MIN_HEIGHT, TABLE_MAX_WIDTH, TABLE_MIN_WIDTH, type TableColumn } from '../model/prefs';
import { updatePrefs, usePrefs } from '../state/prefs';

const clamp = (v: number, a: number, b: number) => Math.round(Math.min(b, Math.max(a, v)));

/** Valeurs en cours de glissement (non encore enregistrées). */
export const useLive = create<{ widths: Partial<Record<TableColumn, number>>; rowHeight: number | null }>(() => ({ widths: {}, rowHeight: null }));

/** Largeurs et hauteur effectives : préférences, remplacées par le glissement en cours. */
export function useTableLayout() {
  const saved = usePrefs((s) => s.prefs.table);
  const live = useLive();
  return { widths: { ...saved.widths, ...live.widths }, rowHeight: live.rowHeight ?? saved.rowHeight };
}

function saveWidth(col: TableColumn, w: number | null) {
  updatePrefs((d) => {
    if (w === null) delete d.table.widths[col];
    else d.table.widths[col] = w;
  });
}

function saveRowHeight(h: number | null) {
  updatePrefs((d) => void (d.table.rowHeight = h));
}

/** Poignée au bord droit d'un en-tête de colonne. Double-clic : largeur par défaut. */
export function ColResize({ col, label }: { col: TableColumn; label: string }) {
  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const cell = e.currentTarget.parentElement!;
    const start = cell.getBoundingClientRect().width;
    const x0 = e.clientX;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-col');
    const move = (ev: PointerEvent) => useLive.setState({ widths: { [col]: clamp(start + ev.clientX - x0, TABLE_MIN_WIDTH, TABLE_MAX_WIDTH) } });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-col');
      const w = useLive.getState().widths[col];
      useLive.setState({ widths: {} });
      if (w !== undefined) saveWidth(col, w);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const w = e.currentTarget.parentElement!.getBoundingClientRect().width;
    saveWidth(col, clamp(w + (e.key === 'ArrowRight' ? 8 : -8), TABLE_MIN_WIDTH, TABLE_MAX_WIDTH));
  };
  return (
    <span
      className="col-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Largeur de la colonne ${label}`}
      title="Glisser pour élargir · double-clic : largeur par défaut"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        saveWidth(col, null);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

/** Poignée au bas d'une rangée (dans la colonne N°) : règle la hauteur de toutes les rangées. */
export function RowResize() {
  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const row = e.currentTarget.closest('.line') as HTMLElement | null;
    const start = row?.getBoundingClientRect().height ?? 50;
    const y0 = e.clientY;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-row');
    const move = (ev: PointerEvent) => useLive.setState({ rowHeight: clamp(start + ev.clientY - y0, ROW_MIN_HEIGHT, ROW_MAX_HEIGHT) });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-row');
      const h = useLive.getState().rowHeight;
      useLive.setState({ rowHeight: null });
      if (h !== null) saveRowHeight(h);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <span
      className="row-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Hauteur des rangées"
      title="Glisser pour changer la hauteur des rangées · double-clic : hauteur par défaut"
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        saveRowHeight(null);
      }}
    />
  );
}
