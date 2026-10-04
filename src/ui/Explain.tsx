/**
 * Explication repliée : les formules et modes d'emploi restent accessibles sans encombrer
 * l'écran. Repliée par défaut ; l'état est mémorisé par sujet pendant la session.
 */
import { useState, type ReactNode } from 'react';
import { IconChevron, IconInfo } from './Icons';

const opened = new Set<string>();

export function Explain({ id, label = 'Comment c’est calculé', children }: { id: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(opened.has(id));
  return (
    <div className={`explain ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="explain-toggle"
        aria-expanded={open}
        onClick={() => {
          if (open) opened.delete(id);
          else opened.add(id);
          setOpen(!open);
        }}
      >
        <IconInfo size={13} />
        <span>{label}</span>
        <IconChevron open={open} />
      </button>
      {open && <div className="explain-body">{children}</div>}
    </div>
  );
}
