/**
 * Règle d'interface 0.9 : une explication = un ⓘ à droite d'un titre.
 * Au clic : un titre et deux lignes, dans une bulle ; jamais de phrase posée dans la page.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Info({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Bulle posée sous le ⓘ (au-dessus près du bas de la fenêtre), alignée à droite près du bord droit.
  // Rendue au niveau de la page : un panneau qui défile ou en verre ne la coupe pas.
  const [pos, setPos] = useState<CSSProperties>({});
  const ref = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (ref.current?.contains(e.target as Node) || pop.current?.contains(e.target as Node))) return;
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
          if (r) {
            const left = Math.max(8, Math.min(r.left > window.innerWidth - 280 ? r.right - 248 : r.left - 12, window.innerWidth - 268));
            setPos(r.bottom > window.innerHeight - 220 ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
          }
          setOpen(!open);
        }}>
        i
      </button>
      {open &&
        createPortal(
          <span ref={pop} className="info-pop" style={{ position: 'fixed', ...pos }} id={id} role="note">
            <strong>{title}</strong>
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
