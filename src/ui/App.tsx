import { DaysView } from './DaysView';
import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { anyOverlay, selectCursor } from '../state/store';
import { DecoupageTable } from './Table';
import { CardsView } from './Cards';
import { Inspector } from './Inspector';
import { SequenceIndex, StatusBar, Toolbar } from './Chrome';
import { DropChoice, Preview, SequenceDialog, Shortcuts, StampDialog } from './Overlays';
import { SettingsDialog } from './Settings';
import { PrefsDialog } from './Preferences';
import { Welcome } from './Welcome';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { ContextMenu } from './ContextMenu';
import { FloorView } from '../floor/FloorView';
import { startScriptImport } from '../import/flow';
import { useProject, saveNow, newProjectDialog, openDialog } from '../state/project';
import { focusGrid, installFocusRescue, isTypingTarget } from './focus';
import { isMenuShortcut, isTauri } from '../platform/menu';
import { ErrorBoundary } from './ErrorBoundary';
import { VersionsDialog } from './VersionsDialog';
import { ShootingView } from './ShootingView';
import { LibraryPicker, LibraryView } from './Library';

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
      // Fenêtre ouverte mais touche reçue hors d'elle (focus perdu) : Esc la ferme quand même.
      if (settingsOpen && e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('.overlay'))) {
        e.preventDefault();
        if (st.showExport) st.setShowExport(false);
        else if (st.showVersions) st.setShowVersions(false);
        else if (st.showSettings) st.setShowSettings(false);
        else if (st.showPrefs) st.setShowPrefs(false);
        else if (st.importing) st.setImporting(null);
        focusGrid();
        return;
      }
      if (st.pendingDrop || st.editingSequenceId || st.editingStampId || st.libraryPick || settingsOpen) return;
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
      if (meta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        st.setShowVersions(true);
        return;
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openDialog();
        return;
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void newProjectDialog();
        return;
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        st.setShowExport(true);
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        void startScriptImport();
        return;
      }
      if (meta && (e.key === ',' || e.key === '<' || e.code === 'Comma')) {
        e.preventDefault();
        // ⌘, : préférences de l'app ; ⇧⌘, : réglages du projet.
        if (e.shiftKey) st.setShowSettings(true);
        else st.setShowPrefs(true);
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
      if (meta && e.code === 'Digit3') {
        e.preventDefault();
        st.setView('floor');
        return;
      }
      if (meta && e.code === 'Digit4') {
        e.preventDefault();
        st.setView('shooting');
        return;
      }
      if (meta && e.code === 'Digit5') {
        e.preventDefault();
        st.setView('days');
        return;
      }
      if (meta && e.code === 'Digit6') {
        e.preventDefault();
        st.setView('library');
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
      // En vue Plans au sol, ces touches agissent sur le plan au sol, jamais sur le découpage caché.
      if ((st.view === 'floor' || st.view === 'shooting' || st.view === 'days' || st.view === 'library') && (e.key === 'Backspace' || e.altKey || (meta && e.shiftKey))) return;
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
  const mode = useProject((s) => s.mode);
  const prefs = useApp((s) => s.showPrefs);
  return (
    <>
      {mode === 'none' ? <Welcome /> : <Workspace />}
      {prefs && (
        <ErrorBoundary label="fenêtre">
          <PrefsDialog onClose={() => useApp.getState().setShowPrefs(false)} />
        </ErrorBoundary>
      )}
    </>
  );
}

/** Titre de la fenêtre : nom du projet. */
function useWindowTitle() {
  const title = useApp((s) => s.hist.present.doc.meta.title);
  const mode = useProject((s) => s.mode);
  useEffect(() => {
    const t = `${title || 'Sans titre'}${mode === 'unsaved' ? ' (non enregistré)' : ''} — PrepVisPro`;
    document.title = t;
    if (isTauri()) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(t)).catch(() => {});
    }
  }, [title, mode]);
}

function Workspace() {
  useWindowTitle();
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const settings = useApp((s) => s.showSettings);
  const prefs = useApp((s) => s.showPrefs);
  const exporting = useApp((s) => s.showExport);
  const versions = useApp((s) => s.showVersions);
  const importing = useApp((s) => !!s.importing);
  useGlobalShortcuts(settings || prefs || exporting || importing || versions);

  // Le clavier ne doit jamais « disparaître » après un clic sur un bouton (Safari).
  useEffect(
    () =>
      installFocusRescue(() => {
        const st = useApp.getState();
        return st.view === 'table' && !st.editing && !anyOverlay(st);
      }),
    [],
  );

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
      <Toolbar />
      <div className="app-body">
        {view === 'floor' ? (
          <div className="center">
            <ErrorBoundary label="plans au sol" key="floor">
              <FloorView />
            </ErrorBoundary>
            <StatusBar />
          </div>
        ) : view === 'days' ? (
          <div className="center">
            <ErrorBoundary label="jours de tournage" key="days">
              <DaysView />
            </ErrorBoundary>
            <StatusBar />
          </div>
        ) : view === 'library' ? (
          <div className="center">
            <ErrorBoundary label="bibliothèque d’images" key="library">
              <LibraryView />
            </ErrorBoundary>
            <StatusBar />
          </div>
        ) : view === 'shooting' ? (
          <div className="center">
            <ErrorBoundary label="tournage" key="shooting">
              <ShootingView />
            </ErrorBoundary>
            <StatusBar />
          </div>
        ) : (
          <>
            <SequenceIndex />
            <main className="center">
              <ErrorBoundary label={view === 'table' ? 'tableau' : 'fiches'} key={view}>
                {view === 'table' ? <DecoupageTable /> : <CardsView />}
              </ErrorBoundary>
              <StatusBar />
            </main>
            {inspector && (
              <ErrorBoundary label="détails">
                <Inspector />
              </ErrorBoundary>
            )}
          </>
        )}
      </div>
      <Preview />
      <Shortcuts />
      <DropChoice />
      <SequenceDialog />
      <StampDialog />
      <LibraryPicker />
      <ErrorBoundary label="fenêtre">
        {settings && <SettingsDialog onClose={() => useApp.getState().setShowSettings(false)} />}
        {exporting && <ExportDialog onClose={() => useApp.getState().setShowExport(false)} />}
        <ImportDialog />
        <VersionsDialog />
      </ErrorBoundary>
      <ContextMenu />
    </div>
  );
}
