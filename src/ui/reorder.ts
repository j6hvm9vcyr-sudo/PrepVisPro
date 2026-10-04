/**
 * Réordonner une liste au clavier : ⌥↑ / ⌥↓ sur une ligne (ou un champ qu'elle contient)
 * la monte ou la descend — comme ⌥↑↓ sur les plans du tableau. Les flèches à l'écran
 * n'apparaissent qu'au survol de la ligne (classe `reorder`, voir styles.css).
 */
import type { KeyboardEvent } from 'react';

export function reorderKeys(move: (delta: -1 | 1) => void, can: { up: boolean; down: boolean }) {
  return (e: KeyboardEvent) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    // Dans un champ de texte, ⌥↑↓ déplace le curseur : on le laisse faire.
    const t = e.target as HTMLElement;
    if ((t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)) || t.tagName === 'TEXTAREA') return;
    e.preventDefault();
    e.stopPropagation();
    const d = e.key === 'ArrowUp' ? -1 : 1;
    if ((d === -1 && can.up) || (d === 1 && can.down)) move(d);
  };
}
