import { useEffect, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectCursor } from '../state/store';
import { DecoupageTable } from './Table';
import { CardsView } from './Cards';
import { Inspector } from './Inspector';
import { SequenceIndex, StatusBar, Toolbar } from './Chrome';
import { DropChoice, Preview, SequenceDialog, Shortcuts } from './Overlays';
import { SettingsDialog } from './Settings';
import { focusGrid, isTypingTarget } from './focus';
import { isMenuShortcut, isTauri } from '../platform/menu';

/** Raccourcis valables partout dans la fenêtre (hors saisie de texte). */
function useGlobalShortcuts(settingsOpen: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useApp.getState();
      const meta = e.metaKey || e.ctrlKey;
      // Déjà traité par le tableau ou un champ : ne pas le traiter deux fois.
      if (e.isComposing || e.defaultPrevented) return;

      // Aperçu d'image : il capte les flèches et l'espace.
      if (st.preview) {
        const map: Record<string, () => void> = {
          ' ': () => st.closePreview(),
          Escape: () => st.closePreview(),
          ArrowRight: () => st.previewStep(1, 0),
          ArrowLeft: () => st.previewStep(-1, 0),
          ArrowDown: () => st.previewStep(0, 1),
          ArrowUp: () => st.previewStep(0, -1),
        };
        const fn = map[e.key];
        if (fn) {
          e.preventDefault();
          fn();
          if (e.key === ' ' || e.key === 'Escape') focusGrid();
        }
        return;
      }
      if (st.showShortcuts) {
        if (e.key === 'Escape' || e.key === '?') {
          e.preventDefault();
          st.setShowShortcuts(false);
          focusGrid();
        }
        return;
      }
      if (st.pendingDrop || st.editingSequenceId || settingsOpen) return;
      if (st.editing) return;
      // Dans l'application Mac, ces raccourcis appartiennent au menu natif : ne pas les traiter deux fois.
      if (isTauri() && meta && isMenuShortcut(e)) return;
      const typing = isTypingTarget(e.target);

      if (meta && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (meta && e.code === 'Digit1') {
        e.preventDefault();
        st.setView('table');
        return;
      }
      if (meta && e.code === 'Digit2') {
        e.preventDefault();
        st.setView('cards');
        return;
      }
      if (meta && e.key.toLowerCase() === 'i' && !e.shiftKey) {
        e.preventDefault();
        st.toggleInspector();
        return;
      }
      if (typing) return;
      if (meta && e.key === 'Enter') {
        e.preventDefault();
        if (st.view !== 'table') st.setView('table');
        st.newPlan(e.shiftKey);
        return;
      }
      if (meta && e.key === 'Backspace') {
        e.preventDefault();
        st.deletePlan();
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'c') {
        const c = selectCursor(st);
        if (c) {
          e.preventDefault();
          st.addCamera(c.planId);
        }
        return;
      }
      if (e.altKey && !meta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        st.movePlan(e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.key === '?' && !meta) {
        e.preventDefault();
        st.setShowShortcuts(true);
        return;
      }
      if (st.view === 'cards' && !meta) {
        if (e.key === ' ') {
          e.preventDefault();
          st.openPreview();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);
}

export function App() {
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const [settings, setSettings] = useState(false);
  useGlobalShortcuts(settings);

  // Empêche le navigateur d'ouvrir une image lâchée hors d'une zone prévue.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar onSettings={() => setSettings(true)} />
      <div className="app-body">
        <SequenceIndex />
        <main className="center">
          {view === 'table' ? <DecoupageTable /> : <CardsView />}
          <StatusBar />
        </main>
        {inspector && <Inspector />}
      </div>
      <Preview />
      <Shortcuts />
      <DropChoice />
      <SequenceDialog />
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
    </div>
  );
}
