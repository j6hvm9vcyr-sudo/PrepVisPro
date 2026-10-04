/** Accès direct aux fonctions, pour piloter l'application réelle sans boîtes de dialogue natives. */
import { useApp } from './state/appStore';
import { closeProject, createVersion, flushSave, listVersions, newProjectAt, openPath, openSample, quitApp, readVersion, useProject } from './state/project';
import { selectDoc } from './state/store';
import { imageStore } from './platform/images';
import { coverImage } from './model/images';
import { getBackend } from './platform/backend';

export async function install() {
  // Les boîtes de dialogue natives bloqueraient le test : on les enregistre au lieu de les afficher.
  const alerts: string[] = [];
  const b = await getBackend();
  const mutable = b as unknown as { alert: (t: string, x: string) => Promise<void>; confirm: () => Promise<boolean> };
  mutable.alert = async (t, x) => void alerts.push(`${t} : ${x}`);
  mutable.confirm = async () => true;
  // Erreurs JavaScript non rattrapées : relevées par le test (WebKit ne les remonte pas au pilote).
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => errors.push(`rejet : ${String((e.reason as Error)?.message ?? e.reason)}`));
  const origError = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    errors.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ').slice(0, 400));
    origError(...a);
  };
  (window as unknown as Record<string, unknown>).__prepvis = {
    alerts,
    errors,
    openSample,
    async exportTo(path: string, format: 'pdf' | 'xlsx' | 'csv') {
      const { buildExport } = await import('./export/service');
      const { BUILTIN_PRESETS } = await import('./export/model');
      const built = await buildExport(selectDoc(useApp.getState()), format, BUILTIN_PRESETS[0]!.options);
      await b.writeExport(path, built.bytes);
      return built.failedImages;
    },
    async readScript(path: string) {
      const { invoke } = await import('@tauri-apps/api/core');
      return new TextDecoder().decode(new Uint8Array(await invoke<ArrayBuffer>('script_read', { path })));
    },
    /** Importe un dossier d'icônes sans boîte de dialogue ; renvoie la bibliothèque et l'URL de la 1re icône. */
    async importIconsFrom(path: string) {
      const lib = await import('./platform/iconLibrary');
      const b = lib.iconBackend() as unknown as { scan(p: string): Promise<unknown> };
      const picked = await b.scan(path);
      const r = await lib.useIcons.getState().importFolder(picked as never);
      const items = lib.useIcons.getState().items;
      return { r, items, url: items[0] ? lib.useIcons.getState().url(items[0]) : null };
    },
    newProjectAt,
    createVersion,
    listVersions,
    readVersion,
    openPath,
    closeProject,
    quitApp,
    async closeWindow() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    },
    flushSave,
    project: () => useProject.getState(),
    doc: () => selectDoc(useApp.getState()),
    app: () => useApp.getState(),
    async addTestImage(kind: 'scouting' | 'reference') {
      // Petite image PNG 16×9 générée sur place.
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 9;
      const g = c.getContext('2d')!;
      g.fillStyle = '#2457c5';
      g.fillRect(0, 0, 16, 9);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const file = new File([blob], 'test.png', { type: 'image/png' });
      const st = useApp.getState();
      const planId = st.cursor!.planId;
      await st.addImages(planId, kind, [file]);
      const plan = selectDoc(useApp.getState()).sequences.flatMap((s) => s.plans).find((p) => p.id === planId)!;
      const cov = coverImage(plan)!;
      return { file: cov.file, url: imageStore.url(cov.file) };
    },
  };
}
