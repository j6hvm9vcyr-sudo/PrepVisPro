/** Accès direct aux fonctions, pour piloter l'application réelle sans boîtes de dialogue natives. */
import { useApp } from './state/appStore';
import { closeProject, flushSave, newProjectAt, openPath, quitApp, useProject } from './state/project';
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
  (window as unknown as Record<string, unknown>).__prepvis = {
    alerts,
    async exportTo(path: string, format: 'pdf' | 'xlsx' | 'csv') {
      const { buildExport } = await import('./export/service');
      const { BUILTIN_PRESETS } = await import('./export/model');
      const built = await buildExport(selectDoc(useApp.getState()), format, BUILTIN_PRESETS[0]!.options);
      await b.writeExport(path, built.bytes);
      return built.failedImages;
    },
    async readScript(path: string) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<string>('script_read', { path });
    },
    newProjectAt,
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
