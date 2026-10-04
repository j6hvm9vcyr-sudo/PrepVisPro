/**
 * Section repliable d'un panneau (en-tête cliquable). L'état ouvert / fermé est gardé par
 * section pendant la session, même quand le panneau change de contenu.
 */
import { useState, type ReactNode } from 'react';
import { IconChevron } from './Icons';

const state = new Map<string, boolean>();

export function Fold({ id, title, label, count, defaultOpen = true, children }: { id: string; title: ReactNode; label?: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(state.get(id) ?? defaultOpen);
  return (
    <section className={`sec fold ${open ? 'open' : ''}`} aria-label={label}>
      <button
        type="button"
        className="sec-h fold-h"
        aria-expanded={open}
        onClick={() => {
          state.set(id, !open);
          setOpen(!open);
        }}
      >
        <span className="fold-t">
          <IconChevron open={open} />
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </span>
      </button>
      {open && children}
    </section>
  );
}
