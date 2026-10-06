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
  // Appels à Rust en cours (commande, depuis quand) : en cas de blocage, le test dit lequel.
  const inflight = new Map<number, { cmd: string; t0: number }>();
  let seq = 0;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (cmd: string, ...rest: unknown[]) => Promise<unknown> } }).__TAURI_INTERNALS__;
  if (internals) {
    const orig = internals.invoke.bind(internals);
    const wrapped = (cmd: string, ...rest: unknown[]) => {
      const id = ++seq;
      inflight.set(id, { cmd, t0: performance.now() });
      return Promise.resolve(orig(cmd, ...rest)).finally(() => inflight.delete(id));
    };
    // La propriété peut être protégée : sans suivi, le test marche quand même (il dit seulement moins de choses).
    try {
      Object.defineProperty(internals, 'invoke', { value: wrapped, configurable: true, writable: true });
    } catch (e) {
      console.warn('Suivi des appels à Rust indisponible', e);
    }
  }
  (window as unknown as Record<string, unknown>).__prepvis = {
    alerts,
    /** Appels à Rust pas encore revenus, avec leur durée (ms). */
    pending: () => [...inflight.values()].map((x) => `${x.cmd} (${Math.round(performance.now() - x.t0)} ms)`),
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
    /** Abréviations d'un terme (préférences de l'app) ; renvoie le fichier relu sur le disque après écriture. */
    async setAliases(term: string, list: string[]) {
      const { updatePrefs, prefsWritten } = await import('./state/prefs');
      const { readPrefsFile } = await import('./platform/prefs');
      if (!updatePrefs((p) => void (p.aliases[term] = list))) throw new Error('préférences verrouillées (fichier illisible)');
      await prefsWritten();
      return readPrefsFile();
    },
    /** Ancien « Mon matériel » (lecture seule) : ce qu'il propose de reprendre. */
    async oldEquipment() {
      const { readOldEquipment } = await import('./platform/kit');
      const r = await readOldEquipment();
      return r && 'source' in r ? { cameras: r.source.cameras.map((c) => c.body), exportPresets: r.source.exportPresets.map((p) => p.name) } : r;
    },
    /** Lit un autre projet sans l'ouvrir (reprise du matériel). */
    async otherProject(path: string) {
      const { readProjectAt } = await import('./state/project');
      const r = await readProjectAt(path);
      return 'doc' in r ? { name: r.name, cameras: r.doc.settings.cameras.length } : r;
    },
    /** Ajoute des séquences (décors accentués), pour les listes à recherche. */
    async addSequences(names: string[]) {
      const { insertSequenceAfter, updateSequence } = await import('./model/ops');
      let d = selectDoc(useApp.getState());
      for (const name of names) {
        const r = insertSequenceAfter(d, d.sequences[d.sequences.length - 1]!.id, String(d.sequences.length + 1));
        d = updateSequence(r.doc, r.seqId, (s) => void (s.location = name));
      }
      useApp.getState().applyDoc(d);
      return selectDoc(useApp.getState()).sequences.length;
    },
    /** Importe un dossier d'icônes sans boîte de dialogue ; renvoie la bibliothèque et l'URL de la 1re icône. */
    async importIconsFrom(path: string) {
      const lib = await import('./platform/iconLibrary');
      const b = lib.iconBackend() as unknown as { scan(p: string): Promise<unknown> };
      const picked = await b.scan(path);
      const r = await lib.useIcons.getState().importFolder(picked as never);
      const all = lib.useIcons.getState().items;
      // Icônes importées d'un côté, icônes livrées avec l'app de l'autre.
      const items = all.filter((i) => !i.builtin);
      const builtin = all.filter((i) => i.builtin);
      const url = lib.useIcons.getState().url;
      return { r, items, url: items[0] ? url(items[0]) : null, builtinCount: builtin.length, builtinUrl: builtin[0] ? url(builtin[0]) : null };
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
