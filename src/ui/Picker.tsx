/**
 * Liste de choix à recherche : remplace les menus déroulants qui servaient de boutons
 * (« + Ajouter… », « Choisir… »). Même comportement que la saisie du tableau : on tape pour
 * filtrer (sans tenir compte des accents), ↑↓ pour choisir, ↩ pour valider, esc pour fermer.
 * Les actions (« + Nouveau projecteur… », « Autre… ») restent en bas de la liste.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface PickItem {
  id: string;
  label: string;
  /** Précision affichée sous le libellé (source, plage, séquence…). */
  detail?: string;
  /** Valeur alignée à droite (taux, transmission, puissance…). */
  meta?: string;
  disabled?: boolean;
}

export interface PickGroup {
  label?: string;
  items: PickItem[];
}

interface Props {
  /** Nom accessible du bouton et de la liste. */
  label: string;
  groups: PickGroup[];
  /** Actions en bas de liste, toujours visibles (non filtrées). */
  actions?: PickItem[];
  onPick: (id: string) => void;
  /** Texte du bouton : valeur actuelle, ou invitation (« + Ajouter… »). */
  children: ReactNode;
  /** `field` : ressemble à un champ (valeur actuelle) ; `add` : bouton d'ajout. */
  variant?: 'field' | 'add';
  /** Identifiant de l'élément actuellement choisi (coché dans la liste). */
  value?: string | null;
  disabled?: boolean;
  /** Message quand il n'y a rien à choisir. */
  empty?: string;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Groupes filtrés : chaque mot tapé doit se trouver dans le libellé, la précision ou le groupe. */
export function filterGroups(groups: PickGroup[], query: string): PickGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return groups.filter((g) => g.items.length);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => words.every((w) => fold(`${it.label} ${it.detail ?? ''} ${it.meta ?? ''} ${g.label ?? ''}`).includes(w))) }))
    .filter((g) => g.items.length);
}

const SEARCH_FROM = 8;

export function Picker({ label, groups, actions = [], onPick, children, variant = 'field', value = null, disabled, empty }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const searchable = total >= SEARCH_FROM;
  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  const flat = useMemo(() => [...shown.flatMap((g) => g.items), ...actions].filter((it) => !it.disabled), [shown, actions]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) btn.current?.focus();
  };
  const choose = (it: PickItem | undefined) => {
    if (!it || it.disabled) return;
    close();
    onPick(it.id);
  };
  const openList = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const width = Math.max(r.width, 320);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos(below >= 220 || below >= above ? { left, top: r.bottom + 3, width, maxHeight: Math.min(380, below) } : { left, bottom: window.innerHeight - r.top + 3, width, maxHeight: Math.min(380, above) });
    const cur = value ? [...groups.flatMap((g) => g.items), ...actions].filter((it) => !it.disabled).findIndex((it) => it.id === value) : -1;
    setPick(Math.max(0, cur));
    setOpen(true);
  };

  // Fermeture au clic ailleurs, au défilement d'un parent ou au redimensionnement.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close(false);
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
  }, [open]);

  useLayoutEffect(() => {
    if (open) list.current?.querySelector('.pick-opt.on')?.scrollIntoView({ block: 'nearest' });
  }, [open, pick]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = flat.length;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'ArrowDown') {
      stop();
      if (n) setPick((p) => (p + 1) % n);
    } else if (e.key === 'ArrowUp') {
      stop();
      if (n) setPick((p) => (p - 1 + n) % n);
    } else if (e.key === 'Enter') {
      stop();
      choose(flat[pick]);
    } else if (e.key === 'Escape') {
      stop();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else e.stopPropagation();
  };

  let i = -1;
  const option = (it: PickItem) => {
    const idx = it.disabled ? -1 : ++i;
    return (
      <button
        key={it.id}
        type="button"
        role="option"
        aria-selected={idx === pick}
        aria-disabled={it.disabled || undefined}
        tabIndex={-1}
        className={`pick-opt ${idx === pick ? 'on' : ''} ${it.id === value ? 'cur' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => idx >= 0 && idx !== pick && setPick(idx)}
        onClick={() => choose(it)}
      >
        <span className="pick-l">
          {it.label}
          {it.detail && <small>{it.detail}</small>}
        </span>
        {it.meta && <span className="pick-m">{it.meta}</span>}
      </button>
    );
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`picker pk-${variant}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          } else if (open) onKeyDown(e);
        }}
      >
        <span className="picker-v">{children}</span>
        {variant === 'field' && <span className="picker-chev" aria-hidden="true" />}
      </button>
      {open && pos && (
        <div ref={list} className="pick-pop" style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }} onKeyDown={onKeyDown}>
          {searchable && (
            <input
              autoFocus
              className="pick-search"
              aria-label={`Rechercher : ${label}`}
              placeholder="Rechercher…"
              value={query}
              spellCheck={false}
              autoComplete="off"
              {...{ writingsuggestions: 'false' }}
              onChange={(e) => {
                setQuery(e.target.value);
                setPick(0);
              }}
            />
          )}
          <div className="pick-list" role="listbox" aria-label={label} tabIndex={searchable ? -1 : 0} ref={(el) => void (!searchable && el?.focus({ preventScroll: true }))}>
            {shown.map((g, gi) => (
              <div key={g.label ?? gi} role="group" aria-label={g.label}>
                {g.label && <div className="pick-g">{g.label}</div>}
                {g.items.map(option)}
              </div>
            ))}
            {!shown.length && <div className="pick-none">{query ? 'Aucun résultat' : (empty ?? 'Rien à choisir')}</div>}
            {actions.length > 0 && <div className="pick-actions">{actions.map(option)}</div>}
          </div>
        </div>
      )}
    </>
  );
}
