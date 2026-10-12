import { showInTournage, TournageBar, TournageDetails, TournageView } from './TournageView';
import { ScenePanel } from './ScenePanel';
import { NotesPanel } from './NotesPanel';
import { RetoursPanel } from './RetoursPanel';
import { scanRetours } from '../state/retours';
import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { anyOverlay, selectCursor } from '../state/store';
import { DecoupageTable } from './Table';
import { CardsView } from './Cards';
import { Inspector } from './Inspector';
import { FilmTree, InterfaceBar, PageBar, SpaceBar, StatusBar, VerifyPanel } from './Chrome';
import { isGridView, openSpace, SPACE_OF, useVerifyPanel } from './spaces';
import { openDecoupagePanel, togglePanel, usePanelOpen, useRetoursPanel } from './panels';
import { DropChoice, Preview, SequenceDialog, Shortcuts, StampDialog } from './Overlays';
import { SettingsDialog } from './Settings';
import { PrefsDialog } from './Preferences';
import { Welcome } from './Welcome';
import { ExportDialog } from './ExportDialog';
import { PublishDialog } from './PublishDialog';
import { ImportDialog } from './ImportDialog';
import { ContextMenu } from './ContextMenu';
import { FloorView } from '../floor/FloorView';
import { startScriptImport } from '../import/flow';
import { useProject, saveNow, newProjectDialog, openDialog } from '../state/project';
import { focusGrid, installFocusRescue, isTypingTarget } from './focus';
import { isMenuShortcut, isTauri } from '../platform/menu';
import { ErrorBoundary } from './ErrorBoundary';
import { VersionsDialog } from './VersionsDialog';
import { ImagesDrawer, LibraryPicker } from './Library';

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
        else if (st.showPublish) st.setShowPublish(false);
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
      // ⌘/ : aide et raccourcis, même pendant une saisie.
      if (meta && (e.key === '/' || e.code === 'Slash') && !e.altKey) {
        e.preventDefault();
        st.setShowShortcuts(true);
        return;
      }
      const typing = isTypingTarget(e.target);

      if (meta && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        st.setShowPublish(true);
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
      // ⌘1 ⌘2 ⌘3 : les pages ; ⌥⌘1 à ⌥⌘4 : les panneaux du Découpage ; ⌥⌘L : liste / fiches.
      if (meta && !e.altKey && !e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
        e.preventDefault();
        openSpace(e.code === 'Digit1' ? 'decoupage' : e.code === 'Digit2' ? 'sol' : 'tournage');
        return;
      }
      if (meta && e.altKey && !e.shiftKey && /^Digit[1-4]$/.test(e.code)) {
        e.preventDefault();
        const id = (['film', 'scenario', 'images', 'notes'] as const)[Number(e.code.slice(5)) - 1]!;
        if (id === 'film' && SPACE_OF[st.view] !== 'decoupage') togglePanel('film');
        else if (SPACE_OF[st.view] === 'decoupage') togglePanel(id);
        else openDecoupagePanel(id);
        return;
      }
      if (meta && e.altKey && e.code === 'KeyL') {
        e.preventDefault();
        st.setView(st.view === 'cards' ? 'table' : 'cards');
        return;
      }
      if (meta && e.key.toLowerCase() === 'i' && !e.shiftKey) {
        e.preventDefault();
        togglePanel('details');
        return;
      }
      if (typing) return;
      if (meta && e.key === 'Enter') {
        e.preventDefault();
        if (!isGridView(st.view)) st.setView('table');
        st.newPlan(e.shiftKey);
        return;
      }
      // En vue Plans au sol, ces touches agissent sur le plan au sol, jamais sur le découpage caché.
      if ((st.view === 'floor' || st.view === 'days') && (e.key === 'Backspace' || e.altKey || (meta && e.shiftKey))) return;
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

/** Retours déposés dans le dossier de diffusion : regardés à l'ouverture du projet et quand la fenêtre revient au premier plan. */
function useRetoursWatch() {
  const id = useApp((s) => s.hist.present.doc.id);
  useEffect(() => {
    void scanRetours();
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      void scanRetours();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id]);
}

/** Titre de la fenêtre : nom du projet. */
function useWindowTitle() {
  const title = useApp((s) => s.hist.present.doc.meta.title);
  const mode = useProject((s) => s.mode);
  useEffect(() => {
    const t = `${title || 'Sans titre'}${mode === 'unsaved' ? ' (non enregistré)' : ''} — Topshot`;
    document.title = t;
    if (isTauri()) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(t)).catch(() => {});
    }
  }, [title, mode]);
}

/** Tournage : un plan choisi dans l'arbre montre aussi les installations de sa séquence. */
function chooseInTournage(planId: string) {
  const st = useApp.getState();
  st.goToPlan(planId);
  const seq = st.hist.present.doc.sequences.find((s) => s.plans.some((p) => p.id === planId));
  if (seq) showInTournage({ kind: 'seq', id: seq.id });
}

const VIEW_LABEL = { floor: 'plans au sol', days: 'tournage', table: 'tableau', cards: 'fiches' } as const;

function Workspace() {
  useWindowTitle();
  const view = useApp((s) => s.view);
  const space = SPACE_OF[view];
  const verifying = useVerifyPanel((s) => s.open);
  const retoursOpen = useRetoursPanel((s) => s.open);
  useRetoursWatch();
  const film = usePanelOpen('film');
  const scenario = usePanelOpen('scenario');
  const images = usePanelOpen('images');
  const notes = usePanelOpen('notes');
  const details = usePanelOpen('details');
  const settings = useApp((s) => s.showSettings);
  const prefs = useApp((s) => s.showPrefs);
  const exporting = useApp((s) => s.showExport);
  const publishing = useApp((s) => s.showPublish);
  const versions = useApp((s) => s.showVersions);
  const importing = useApp((s) => !!s.importing);
  useGlobalShortcuts(settings || prefs || exporting || publishing || importing || versions);

  // Le clavier ne doit jamais « disparaître » après un clic sur un bouton (Safari).
  useEffect(
    () =>
      installFocusRescue(() => {
        const st = useApp.getState();
        return isGridView(st.view) && !st.editing && !anyOverlay(st);
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
      <InterfaceBar />
      <div className="app-body">
        {view === 'floor' ? (
          <ErrorBoundary label="plans au sol" key="floor">
            <FloorView />
          </ErrorBoundary>
        ) : space === 'decoupage' ? (
          <div className={`dec-layout ${images ? 'with-drawer' : ''}`}>
            <div className="dec-row">
              {film && <FilmTree />}
              {scenario && (
                <ErrorBoundary label="scénario">
                  <ScenePanel />
                </ErrorBoundary>
              )}
              <main className="center">
                <SpaceBar />
                <ErrorBoundary label={VIEW_LABEL[view]} key={view}>
                  {view === 'cards' ? <CardsView /> : <DecoupageTable />}
                </ErrorBoundary>
              </main>
              {notes && (
                <ErrorBoundary label="notes">
                  <NotesPanel />
                </ErrorBoundary>
              )}
              {details && (
                <ErrorBoundary label="détails">
                  <Inspector />
                </ErrorBoundary>
              )}
              {retoursOpen && !verifying && (
                <ErrorBoundary label="retours">
                  <RetoursPanel />
                </ErrorBoundary>
              )}
              {verifying && (
                <ErrorBoundary label="à vérifier">
                  <VerifyPanel />
                </ErrorBoundary>
              )}
            </div>
            {images && (
              <ErrorBoundary label="images">
                <ImagesDrawer />
              </ErrorBoundary>
            )}
          </div>
        ) : (
          <>
            {film && <FilmTree onPlan={chooseInTournage} />}
            <main className="center">
              <SpaceBar>
                <TournageBar />
              </SpaceBar>
              <ErrorBoundary label={VIEW_LABEL[view]} key={view}>
                <div className="space-main">
                  <TournageView />
                </div>
              </ErrorBoundary>
            </main>
            {details && (
              <ErrorBoundary label="détails">
                <TournageDetails />
              </ErrorBoundary>
            )}
          </>
        )}
        {verifying && space !== 'decoupage' && (
          <ErrorBoundary label="à vérifier">
            <VerifyPanel />
          </ErrorBoundary>
        )}
      </div>
      <PageBar />
      <StatusBar />
      <Preview />
      <Shortcuts />
      <DropChoice />
      <SequenceDialog />
      <StampDialog />
      <LibraryPicker />
      <ErrorBoundary label="fenêtre">
        {settings && <SettingsDialog onClose={() => useApp.getState().setShowSettings(false)} />}
        {exporting && <ExportDialog onClose={() => useApp.getState().setShowExport(false)} />}
        {publishing && <PublishDialog onClose={() => useApp.getState().setShowPublish(false)} />}
        <ImportDialog />
        <VersionsDialog />
      </ErrorBoundary>
      <ContextMenu />
    </div>
  );
}
