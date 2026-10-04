import { useEffect, useRef } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { locatePlan } from '../model/ops';
import { focusGrid } from './focus';

interface Item {
  label: string;
  keys?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

/** Menu contextuel (clic droit) sur un plan. */
export function ContextMenu() {
  const menu = useApp((s) => s.contextMenu);
  const doc = useApp(selectDoc);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) useApp.getState().setContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  if (!menu) return null;
  const loc = locatePlan(doc, menu.planId);
  if (!loc) return null;
  const st = useApp.getState;
  const setupIndex = loc.plan.cameras.findIndex((c) => c.id === menu.setupId);
  const groups: Item[][] = [
    [
      { label: 'Nouveau plan après', keys: '⌘↩', run: () => st().newPlan(false) },
      { label: 'Reprise de ce plan', keys: '⇧⌘↩', run: () => st().newPlan(true) },
      { label: 'Ajouter une caméra', keys: '⇧⌘C', run: () => st().addCamera(loc.plan.id) },
    ],
    [
      { label: 'Monter', keys: '⌥↑', disabled: loc.planIndex === 0, run: () => st().movePlan(-1) },
      { label: 'Descendre', keys: '⌥↓', disabled: loc.planIndex === loc.seq.plans.length - 1, run: () => st().movePlan(1) },
    ],
    [
      { label: 'Copier la cellule', keys: '⌘C', run: () => copyText(st().copyCell() ?? '') },
      { label: 'Recopier vers le bas', keys: '⌘D', run: () => st().fillDown() },
      { label: 'Aperçu de l’image', keys: 'espace', disabled: loc.plan.images.length === 0, run: () => st().openPreview(loc.plan.id) },
    ],
    [
      { label: `Modifier la séquence ${loc.seq.number || ''}`.trim() + '…', run: () => st().setEditingSequence(loc.seq.id) },
      { label: 'Insérer un tampon après la séquence…', run: () => st().addStamp('', { after: loc.seq.id }) },
    ],
    [
      ...(setupIndex > 0 ? [{ label: 'Retirer cette caméra', danger: true, run: () => st().removeCamera(loc.plan.id, menu.setupId) }] : []),
      { label: 'Supprimer le plan', keys: '⌘⌫', danger: true, disabled: loc.seq.plans.length <= 1, run: () => st().deletePlan() },
    ],
  ];
  const close = () => {
    st().setContextMenu(null);
    focusGrid();
  };
  // Le menu reste dans la fenêtre.
  const x = Math.min(menu.x, window.innerWidth - 250);
  const y = Math.min(menu.y, window.innerHeight - 400);
  return (
    <div
      ref={ref}
      className="ctx"
      role="menu"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        e.stopPropagation();
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(i + 1) % items.length]?.focus();
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(i - 1 + items.length) % items.length]?.focus();
        }
      }}
    >
      {groups
        .filter((g) => g.length)
        .map((g, gi) => (
          <div key={gi} className="ctx-group">
            {g.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? 'danger' : ''}
                disabled={it.disabled}
                onClick={() => {
                  close();
                  it.run();
                }}
              >
                <span>{it.label}</span>
                {it.keys && <span className="ctx-keys">{it.keys}</span>}
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

/** Copie un texte ; le résultat est toujours signalé (le presse-papiers peut être refusé). */
function copyText(t: string) {
  const ok = () => useApp.getState().setMessage('Copié');
  const fallback = () => {
    // Repli : sélection d'un champ caché + commande de copie du système.
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand('copy');
    ta.remove();
    if (done) ok();
    else useApp.getState().setMessage('Copie impossible : utilisez ⌘C', 'warn');
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok, fallback);
  else fallback();
}
