/**
 * Fichier des préférences de l'app (`preferences.json`, dossier de données de PrepVisPro sur ce
 * Mac). Dans le navigateur (développement, tests) : le stockage local.
 */
import { isTauri } from './env';

const LOCAL_KEY = 'prepvispro.prefs';

/** Contenu du fichier, ou null s'il n'existe pas encore. */
export async function readPrefsFile(): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('prefs_read');
  }
  return localStorage.getItem(LOCAL_KEY);
}

/** Remplace le fichier (écriture atomique côté Mac : jamais à moitié écrit). */
export async function writePrefsFile(json: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('prefs_write', { json });
    return;
  }
  localStorage.setItem(LOCAL_KEY, json);
}
