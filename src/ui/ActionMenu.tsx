/**
 * Menu d'actions d'un objet (0.24) : « ··· » d'un bandeau de séquence, « + Nouveau ▾ » de la barre
 * du tableau, pied des Détails. Ouvert dans un portail (jamais coupé par un panneau qui défile),
 * fermé au clic ailleurs, à Échap ou au défilement.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { focusGrid } from './focus';

export interface MenuAction {
  label: string;
  key?: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}
/** `null` dans la liste : un séparateur. */
export type MenuItems = (MenuAction | null)[];

export function ActionMenu({ label, items, className = 'btn', children, align = 'left', tabIndex }: { label: string; items: MenuItems; className?: string; children: ReactNode; align?: 'left' | 'right'; tabIndex?: number }) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  /** Place du bouton à l'ouverture : le menu se ferme seulement si un défilement le déplace. */
  const at = useRef({ top: 0, left: 0 });
  const close = (refocus: boolean) => {
    setPos(null);
    if (refocus) btn.current?.focus();
  };
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    at.current = { top: r.top, left: r.left };
    const width = 270;
    const left = Math.max(8, Math.min(align === 'right' ? r.right - width : r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    setPos(below > 300 || below > r.top ? { left, top: r.bottom + 4 } : { left, bottom: window.innerHeight - r.top + 4 });
  };
  useLayoutEffect(() => {
    if (!pos) return;
    pop.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return;
      const r = btn.current?.getBoundingClientRect();
      if (!r || Math.abs(r.top - at.current.top) > 1 || Math.abs(r.left - at.current.left) > 1) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [pos]);
  const buttons = () => [...(pop.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
  return (
    <>
      <button ref={btn} type="button" className={className} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!pos} tabIndex={tabIndex} onClick={(e) => (e.stopPropagation(), pos ? close(true) : open())}>
        {children}
      </button>
      {pos &&
        createPortal(
          <div
            ref={pop}
            className="action-pop"
            role="menu"
            aria-label={label}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') close(true);
              else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const all = buttons();
                const i = all.indexOf(document.activeElement as HTMLButtonElement);
                all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
              }
            }}
          >
            {items.map((it, i) =>
              it === null ? (
                <hr key={`s${i}`} />
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={it.danger ? 'danger' : ''}
                  disabled={it.disabled}
                  onClick={() => {
                    close(false);
                    it.run();
                    // Menu d'un bandeau du tableau (hors du parcours ⇥) : le clavier revient au tableau.
                    if (tabIndex === -1 && !document.querySelector('.overlay')) focusGrid();
                  }}
                >
                  <span>{it.label}</span>
                  {it.key && <span className="k">{it.key}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
