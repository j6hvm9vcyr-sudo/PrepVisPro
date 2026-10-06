/**
 * Préférences de l'app en mémoire, et leur enregistrement sur le Mac.
 *
 * - Lues une fois au lancement (loadPrefs). Absentes : valeurs par défaut (« premières »).
 * - Fichier illisible : valeurs par défaut en mémoire, et le fichier n'est PAS écrasé tant que
 *   l'utilisateur ne l'a pas demandé (Préférences › « Repartir des préférences par défaut »).
 * - Chaque modification est enregistrée aussitôt, dans l'ordre (une écriture à la fois).
 * - Elles ne font pas partie de l'historique du projet (⌘Z ne les change pas).
 */
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { adoptLegacy, defaultPrefs, parsePrefs, type AppPrefs, type LegacyPrefs } from '../model/prefs';
import { readPrefsFile, writePrefsFile } from '../platform/prefs';

export type PrefsStatus =
  /** Pas encore lues (tests, tout début du lancement). */
  | 'default'
  /** Aucun fichier sur ce Mac : valeurs par défaut, qu'un ancien projet peut encore remplacer. */
  | 'fresh'
  | 'loaded'
  /** Fichier illisible : rien n'est écrit tant que l'utilisateur n'a pas choisi de repartir des valeurs par défaut. */
  | 'broken';

interface PrefsState {
  prefs: AppPrefs;
  status: PrefsStatus;
  error: string | null;
}

export const usePrefs = create<PrefsState>(() => ({ prefs: defaultPrefs(), status: 'default', error: null }));

export const getPrefs = (): AppPrefs => usePrefs.getState().prefs;

let queue: Promise<void> = Promise.resolve();
let onWriteError: (msg: string) => void = () => {};

/** Où signaler une écriture impossible (barre d'état). */
export function setPrefsErrorReporter(f: (msg: string) => void): void {
  onWriteError = f;
}

function persist(prefs: AppPrefs): Promise<void> {
  const json = JSON.stringify(prefs, null, 1) + '\n';
  queue = queue
    .then(() => writePrefsFile(json))
    .catch((e: unknown) => onWriteError(`Préférences non enregistrées : ${e instanceof Error ? e.message : String(e)}`));
  return queue;
}

/** Attend la fin des écritures en cours (avant de quitter, dans les tests). */
export function prefsWritten(): Promise<void> {
  return queue;
}

export async function loadPrefs(): Promise<void> {
  let raw: string | null;
  try {
    raw = await readPrefsFile();
  } catch (e) {
    usePrefs.setState({ prefs: defaultPrefs(), status: 'broken', error: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (raw === null) {
    // Un ancien projet ouvert pendant la lecture a pu remplir les préférences : on les garde.
    if (usePrefs.getState().status === 'default') usePrefs.setState({ status: 'fresh', error: null });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    usePrefs.setState({ prefs: defaultPrefs(), status: 'broken', error: 'JSON invalide' });
    return;
  }
  const r = parsePrefs(parsed);
  if (r.ok) usePrefs.setState({ prefs: r.prefs, status: 'loaded', error: null });
  else usePrefs.setState({ prefs: defaultPrefs(), status: 'broken', error: r.error });
}

/** Modifie les préférences et les enregistre. Refusé (false) si le fichier est illisible. */
export function updatePrefs(recipe: (d: Draft<AppPrefs>) => void): boolean {
  const s = usePrefs.getState();
  if (s.status === 'broken') return false;
  const next = produce(s.prefs, recipe);
  if (next === s.prefs) return true;
  usePrefs.setState({ prefs: next, status: 'loaded' });
  void persist(next);
  return true;
}

/** Remplace un fichier illisible par les valeurs par défaut (choix explicite de l'utilisateur). */
export function resetPrefs(): void {
  const prefs = defaultPrefs();
  usePrefs.setState({ prefs, status: 'loaded', error: null });
  void persist(prefs);
}

/**
 * Reprend les réglages d'un ancien projet (format 16 à 18). Renvoie true si les préférences ont
 * changé. Rien n'est fait si le fichier de préférences est illisible.
 */
export function adoptFromProject(legacy: LegacyPrefs): boolean {
  const s = usePrefs.getState();
  if (s.status === 'broken') return false;
  const r = adoptLegacy(s.prefs, legacy, s.status === 'fresh');
  if (s.status === 'fresh') {
    // Les premières préférences de ce Mac sont fixées par ce projet, même identiques aux valeurs par défaut.
    usePrefs.setState({ prefs: r.prefs, status: 'loaded' });
    void persist(r.prefs);
    return r.changed;
  }
  if (!r.changed) return false;
  usePrefs.setState({ prefs: r.prefs });
  if (s.status === 'loaded') void persist(r.prefs);
  return true;
}
