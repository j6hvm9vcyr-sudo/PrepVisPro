/**
 * Projet ouvert et enregistrement automatique.
 *
 * Règles :
 * - chaque modification est enregistrée automatiquement, peu après (regroupement des frappes) ;
 * - un seul enregistrement à la fois, dans l'ordre ;
 * - le document est validé AVANT écriture : un document incohérent n'écrase jamais le fichier ;
 * - en cas d'échec, l'état « erreur » reste affiché et un nouvel essai a lieu à la modification
 *   suivante ou sur demande (⌘S) ; rien n'est perdu tant que l'application est ouverte.
 */
import { create } from 'zustand';
import type { ProjectDoc } from '../model/types';
import { validateProject } from '../model/schema';
import { migrate } from '../model/migrate';
import { newProject } from '../model/defaults';
import { sampleProject } from '../model/sample';
import { getBackend, baseName, type Backend } from '../platform/backend';
import { imageStore } from '../platform/images';
import { useApp } from './appStore';
import { selectDoc } from './store';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export interface ProjectState {
  /** none : écran d'accueil ; unsaved : projet en mémoire (exemple) ; file : projet enregistré. */
  mode: 'none' | 'unsaved' | 'file';
  dir: string | null;
  status: SaveStatus;
  savedAt: number | null;
  error: string | null;
  /** Message d'erreur d'ouverture à afficher sur l'écran d'accueil. */
  openError: string | null;
}

export const useProject = create<ProjectState>()(() => ({
  mode: 'none',
  dir: null,
  status: 'saved',
  savedAt: null,
  error: null,
  openError: null,
}));

export const SAVE_DELAY_MS = 700;
const RECENT_KEY = 'prepvispro.recent';
const RECENT_MAX = 8;

export function serializeProject(doc: ProjectDoc): string {
  return JSON.stringify(doc, null, 1) + '\n';
}

/** Lit et valide un fichier projet. Ne lève jamais : renvoie une erreur lisible. */
export function parseProject(json: string): { ok: true; doc: ProjectDoc } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Le fichier project.json est illisible (JSON invalide). Une copie de sauvegarde se trouve dans le dossier backups du projet.' };
  }
  const m = migrate(raw);
  if (!m.ok) return m;
  return validateProject(m.raw);
}

// ------------------------------------------------------------------ récents

export function recentProjects(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(dir: string) {
  try {
    const list = [dir, ...recentProjects().filter((d) => d !== dir)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* sans conséquence */
  }
}

export function forgetRecent(dir: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentProjects().filter((d) => d !== dir)));
  } catch {
    /* sans conséquence */
  }
}

// ------------------------------------------------------------------ enregistrement

let backend: Backend | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();
let lastWritten: ProjectDoc | null = null;
let lastBackupForced = false;

function setStatus(p: Partial<ProjectState>) {
  useProject.setState(p);
}

async function writeNow(forceBackup = false): Promise<void> {
  const { mode, dir } = useProject.getState();
  if (mode !== 'file' || !dir || !backend) return;
  const doc = selectDoc(useApp.getState());
  if (doc === lastWritten && !forceBackup) {
    setStatus({ status: 'saved' });
    return;
  }
  const check = validateProject(JSON.parse(JSON.stringify(doc)));
  if (!check.ok) {
    // Ne doit jamais arriver : c'est un défaut du logiciel. On n'écrase pas le fichier.
    setStatus({ status: 'error', error: `Enregistrement bloqué pour protéger le fichier : ${check.error}` });
    return;
  }
  setStatus({ status: 'saving' });
  try {
    await backend.save(dir, serializeProject(doc), forceBackup);
    lastWritten = doc;
    const still = selectDoc(useApp.getState()) === doc;
    setStatus({ status: still ? 'saved' : 'pending', savedAt: Date.now(), error: null });
  } catch (e) {
    setStatus({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Planifie un enregistrement (regroupe les modifications rapprochées). */
function schedule() {
  if (useProject.getState().mode !== 'file') return;
  setStatus({ status: useProject.getState().status === 'error' ? 'error' : 'pending' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    chain = chain.then(() => writeNow());
  }, SAVE_DELAY_MS);
}

/** Enregistre immédiatement tout ce qui est en attente. */
export async function flushSave(forceBackup = false): Promise<boolean> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  chain = chain.then(() => writeNow(forceBackup));
  await chain;
  return useProject.getState().status !== 'error';
}

let unsubscribe: (() => void) | null = null;
function watchDoc() {
  unsubscribe?.();
  let prev = selectDoc(useApp.getState());
  unsubscribe = useApp.subscribe((s) => {
    const d = selectDoc(s);
    if (d !== prev) {
      prev = d;
      schedule();
    }
  });
}

// ------------------------------------------------------------------ ouvrir, créer, fermer

function openDoc(doc: ProjectDoc, mode: ProjectState['mode'], dir: string | null) {
  imageStore.attach(backend, mode === 'file' ? dir : null);
  useApp.getState().load(doc);
  lastWritten = mode === 'file' ? doc : null;
  lastBackupForced = false;
  setStatus({ mode, dir, status: 'saved', savedAt: mode === 'file' ? Date.now() : null, error: null, openError: null });
  watchDoc();
}

export async function openPath(path: string): Promise<boolean> {
  backend ??= await getBackend();
  try {
    // On lit et valide d'abord : le projet courant n'est fermé que si l'ouverture peut réussir.
    const { dir, json } = await backend.load(path);
    const r = parseProject(json);
    if (!r.ok) {
      const msg = `Impossible d’ouvrir « ${baseName(dir)} ». ${r.error}`;
      setStatus({ openError: msg });
      if (useProject.getState().mode !== 'none') await backend.alert('Ouverture impossible', msg);
      return false;
    }
    if (useProject.getState().dir === dir) return true;
    if (!(await closeProject())) return false;
    openDoc(r.doc, 'file', dir);
    rememberRecent(dir);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus({ openError: msg });
    if (useProject.getState().mode !== 'none') await backend.alert('Ouverture impossible', msg);
    return false;
  }
}

export async function openDialog(): Promise<boolean> {
  backend ??= await getBackend();
  const p = await backend.pickOpen();
  return p ? openPath(p) : false;
}

/** Nouveau projet vide : choisit l'emplacement puis crée le dossier. */
export async function newProjectDialog(): Promise<boolean> {
  backend ??= await getBackend();
  const dir = await backend.pickNew('Nouveau projet');
  if (!dir) return false;
  return newProjectAt(dir);
}

/** Crée un projet vide dans `dir` (dossier .prepvis) et l'ouvre. */
export async function newProjectAt(dir: string): Promise<boolean> {
  backend ??= await getBackend();
  const doc = newProject(baseName(dir));
  try {
    // Créé d'abord sur disque : en cas d'échec, le projet en cours reste ouvert.
    const real = await backend.create(dir, serializeProject(doc));
    if (!(await closeProject())) return false;
    openDoc(doc, 'file', real);
    rememberRecent(real);
    return true;
  } catch (e) {
    await backend.alert('Création impossible', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Enregistre sur disque le projet en mémoire (exemple) : il devient un vrai projet. */
export async function saveAsDialog(): Promise<boolean> {
  backend ??= await getBackend();
  const doc = selectDoc(useApp.getState());
  const dir = await backend.pickNew(doc.meta.title || 'Nouveau projet');
  if (!dir) return false;
  try {
    const real = await backend.create(dir, serializeProject(doc));
    const used = new Set(doc.sequences.flatMap((s) => s.plans.flatMap((p) => p.images.map((i) => i.file))));
    await imageStore.flushPendingTo(backend, real, used);
    // On garde l'historique d'annulation : seul l'emplacement change.
    imageStore.attach(backend, real);
    lastWritten = doc;
    setStatus({ mode: 'file', dir: real, status: 'saved', savedAt: Date.now(), error: null, openError: null });
    watchDoc();
    rememberRecent(real);
    return true;
  } catch (e) {
    await backend.alert('Enregistrement impossible', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function openSample(): Promise<void> {
  backend ??= await getBackend();
  if (!(await closeProject())) return;
  openDoc(sampleProject(), 'unsaved', null);
}

export async function openBlankUnsaved(): Promise<void> {
  backend ??= await getBackend();
  if (!(await closeProject())) return;
  openDoc(newProject('Sans titre'), 'unsaved', null);
}

/**
 * Ferme le projet courant après l'avoir enregistré. Renvoie false si l'utilisateur
 * préfère ne pas fermer (enregistrement en échec, ou projet non enregistré).
 */
export async function closeProject(): Promise<boolean> {
  backend ??= await getBackend();
  const st = useProject.getState();
  if (st.mode === 'file') {
    const ok = await flushSave();
    if (!ok) {
      const go = await backend.confirm(
        'Enregistrement impossible',
        `${useProject.getState().error ?? ''}\n\nFermer quand même ? Les dernières modifications seront perdues.`,
        'Fermer sans enregistrer',
        'Annuler',
      );
      if (!go) return false;
    }
  } else if (st.mode === 'unsaved' && useApp.getState().hist.past.length > 0) {
    const go = await backend.confirm('Projet non enregistré', 'Ce projet n’a jamais été enregistré. Le fermer quand même ?', 'Fermer', 'Annuler');
    if (!go) return false;
  }
  unsubscribe?.();
  unsubscribe = null;
  setStatus({ mode: 'none', dir: null, status: 'saved', savedAt: null, error: null });
  imageStore.attach(backend, null);
  return true;
}

/** ⌘S : enregistre maintenant, avec une copie de sauvegarde horodatée (une fois par session). */
export async function saveNow(): Promise<void> {
  backend ??= await getBackend();
  const st = useProject.getState();
  if (st.mode === 'unsaved') {
    await saveAsDialog();
    return;
  }
  if (st.mode !== 'file') return;
  const force = !lastBackupForced;
  lastBackupForced = true;
  await flushSave(force);
}

export async function revealProject(): Promise<void> {
  backend ??= await getBackend();
  const { dir } = useProject.getState();
  if (dir) await backend.reveal(dir);
}

/** Quitter : tout enregistrer, puis fermer l'application. */
export async function quitApp(): Promise<void> {
  backend ??= await getBackend();
  const st = useProject.getState();
  if (st.mode === 'file') {
    const ok = await flushSave();
    if (!ok) {
      const go = await backend.confirm('Enregistrement impossible', `${useProject.getState().error ?? ''}\n\nQuitter quand même ?`, 'Quitter sans enregistrer', 'Annuler');
      if (!go) return;
    }
  } else if (st.mode === 'unsaved' && useApp.getState().hist.past.length > 0) {
    const go = await backend.confirm('Projet non enregistré', 'Ce projet n’a jamais été enregistré. Quitter quand même ?', 'Quitter', 'Annuler');
    if (!go) return;
  }
  await backend.quitNow();
}

/** Au lancement : rouvre le dernier projet, s'il existe encore. */
export async function startup(opts: { sample?: boolean } = {}): Promise<void> {
  backend ??= await getBackend();
  if (opts.sample) {
    await openSample();
    return;
  }
  if (backend.kind !== 'tauri') return;
  // Projet ouvert par double-clic dans le Finder : prioritaire sur le dernier projet.
  const { invoke } = await import('@tauri-apps/api/core');
  const requested = await invoke<string[]>('take_pending_open').catch(() => []);
  if (requested[0]) {
    await openPath(requested[0]);
    return;
  }
  const last = recentProjects()[0];
  if (last && !(await openPath(last))) {
    // Le projet a été déplacé ou supprimé : on le retire des récents, l'accueil explique pourquoi.
    forgetRecent(last);
  }
}

/** Pour les tests. */
export function resetForTests(b: Backend) {
  backend = b;
  if (timer) clearTimeout(timer);
  timer = null;
  chain = Promise.resolve();
  lastWritten = null;
  unsubscribe?.();
  unsubscribe = null;
  useProject.setState({ mode: 'none', dir: null, status: 'saved', savedAt: null, error: null, openError: null });
}
