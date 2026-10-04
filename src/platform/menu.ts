/**
 * Menus natifs macOS (application Mac uniquement). Dans un navigateur, ne fait rien :
 * les mêmes commandes passent alors par les raccourcis clavier.
 */
import { useApp } from '../state/appStore';
import { anyOverlay, selectCursor } from '../state/store';
import { isTypingTarget } from '../ui/focus';
import { startScriptImport } from '../import/flow';

export { isTauri } from './env';
import { isTauri } from './env';
import { closeProject, newProjectDialog, openDialog, openPath, quitApp, revealProject, saveNow, useProject } from '../state/project';

/** Raccourcis portés par le menu natif (voir src-tauri/src/lib.rs). */
export function isMenuShortcut(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'altKey'>): boolean {
  if (e.altKey) return false;
  const k = e.key.toLowerCase();
  return k === 'z' || e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || k === 'i' || k === 'enter' || (e.shiftKey && (k === 'c' || k === 'i' || k === 's')) || k === 's' || k === 'o' || k === 'n' || k === ',' || k === 'q' || k === 'e';
}

/** Exécute une commande de menu. Exporté pour les tests. */
export function runMenuCommand(id: string) {
  // Commandes de fichier : valables partout, même sur l'écran d'accueil.
  switch (id) {
    case 'file_new':
      void newProjectDialog();
      return;
    case 'file_open':
      void openDialog();
      return;
    case 'file_save':
      void saveNow();
      return;
    case 'file_reveal':
      void revealProject();
      return;
    case 'file_close':
      void closeProject();
      return;
    case 'app_quit':
      void quitApp();
      return;
  }
  if (useProject.getState().mode === 'none') return;
  const st = useApp.getState();
  const typing = isTypingTarget(document.activeElement);
  const overlay = anyOverlay(st);
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
    case 'view_floor':
      st.setView('floor');
      return;
    case 'view_inspector':
      st.toggleInspector();
      return;
    case 'file_import_script':
      void startScriptImport();
      return;
    case 'file_export':
      st.setShowExport(true);
      return;
    case 'file_versions':
      st.setShowVersions(true);
      return;
    case 'view_settings':
      st.setShowSettings(true);
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
  // Commandes du découpage invisibles depuis les plans au sol : elles ne s'appliquent pas en aveugle.
  if (st.view === 'floor' && (id === 'plan_camera' || id === 'plan_up' || id === 'plan_down' || id === 'plan_delete')) {
    st.setMessage('Commande du découpage : passez en vue Tableau (⌘1)', 'warn');
    return;
  }
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
  // Fermeture de la fenêtre ou « Quitter » depuis le Dock : enregistrer d'abord.
  const { invoke } = await import('@tauri-apps/api/core');
  // Double-clic sur un projet dans le Finder pendant que l'application est ouverte.
  await listen<string>('open-path', (e) => {
    void invoke('take_pending_open');
    void openPath(e.payload);
  });
  await listen('quit-requested', () => {
    void invoke('quit_ack');
    void quitApp();
  });
}
