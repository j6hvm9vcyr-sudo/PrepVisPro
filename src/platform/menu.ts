/**
 * Menus natifs macOS (application Mac uniquement). Dans un navigateur, ne fait rien :
 * les mêmes commandes passent alors par les raccourcis clavier.
 */
import { useApp } from '../state/appStore';
import { selectCursor } from '../state/store';
import { isTypingTarget } from '../ui/focus';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Raccourcis portés par le menu natif (voir src-tauri/src/lib.rs). */
export function isMenuShortcut(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'altKey'>): boolean {
  if (e.altKey) return false;
  const k = e.key.toLowerCase();
  return k === 'z' || e.code === 'Digit1' || e.code === 'Digit2' || k === 'i' || k === 'enter' || (e.shiftKey && k === 'c');
}

/** Exécute une commande de menu. Exporté pour les tests. */
export function runMenuCommand(id: string) {
  const st = useApp.getState();
  const typing = isTypingTarget(document.activeElement);
  const overlay = !!(st.preview || st.showShortcuts || st.pendingDrop || st.editingSequenceId);
  switch (id) {
    case 'undo':
      // Dans un champ de texte, ⌘Z annule la frappe ; ailleurs, la dernière action du projet.
      if (typing) document.execCommand('undo');
      else st.undo();
      return;
    case 'redo':
      if (typing) document.execCommand('redo');
      else st.redo();
      return;
    case 'view_table':
      st.setView('table');
      return;
    case 'view_cards':
      st.setView('cards');
      return;
    case 'view_inspector':
      st.toggleInspector();
      return;
    case 'help_shortcuts':
      st.setShowShortcuts(true);
      return;
  }
  // ⌘↩ pendant une saisie dans une cellule : on valide la saisie, puis on crée le plan.
  if (st.editing && (id === 'plan_new' || id === 'plan_reprise')) {
    if (!st.commitEdit('stay')) return;
    st.newPlan(id === 'plan_reprise');
    return;
  }
  if (typing || overlay || st.editing) return;
  const c = selectCursor(st);
  switch (id) {
    case 'plan_new':
      st.setView('table');
      st.newPlan(false);
      return;
    case 'plan_reprise':
      st.setView('table');
      st.newPlan(true);
      return;
    case 'plan_camera':
      if (c) st.addCamera(c.planId);
      return;
    case 'plan_up':
      st.movePlan(-1);
      return;
    case 'plan_down':
      st.movePlan(1);
      return;
    case 'plan_delete':
      st.deletePlan();
      return;
  }
}

export async function installMenuBridge(): Promise<void> {
  if (!isTauri()) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen<string>('menu', (e) => runMenuCommand(e.payload));
}
