/**
 * Règle d'interface 0.9 : une explication = un ⓘ à droite d'un titre.
 * Au clic : un titre et deux lignes, dans une bulle ; jamais de phrase posée dans la page.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function Info({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Bulle alignée à droite quand le ⓘ est près du bord droit de la fenêtre.
  const [right, setRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span className="info" ref={ref}>
      <button type="button" className={`info-i ${open ? 'on' : ''}`} aria-label={`À propos : ${title}`} aria-expanded={open} aria-controls={id} onClick={() => {
          const r = ref.current?.getBoundingClientRect();
          setRight(!!r && r.left > window.innerWidth - 280);
          setOpen(!open);
        }}>
        i
      </button>
      {open && (
        <span className={`info-pop ${right ? 'right' : ''}`} id={id} role="note">
          <strong>{title}</strong>
          {children}
        </span>
      )}
    </span>
  );
}
