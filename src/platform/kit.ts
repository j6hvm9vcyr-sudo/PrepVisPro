/**
 * Stockage de « Mon matériel » (model/kit.ts), commun à tous les projets de cet ordinateur.
 * - App Mac : `materiel.json` dans le dossier de données de l'application (src-tauri/src/kit.rs).
 * - Navigateur / tests : stockage local du navigateur.
 * Un fichier illisible n'est jamais écrasé : « Mon matériel » passe en lecture seule et le dit.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { isTauri } from './env';
import { emptyKit, parseKit, type Kit } from '../model/kit';

const LOCAL_KEY = 'prepvispro.kit';

interface KitState {
  kit: Kit;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

export const useKitStore = create<KitState>(() => ({ kit: emptyKit(), status: 'idle', error: null }));

async function readRaw(): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('kit_read');
  }
  try {
    return localStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

async function writeRaw(json: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('kit_write', { json });
    return;
  }
  localStorage.setItem(LOCAL_KEY, json);
}

let loading: Promise<Kit> | null = null;

/** Charge « Mon matériel » (une seule fois). */
export function loadKit(): Promise<Kit> {
  loading ??= (async () => {
    useKitStore.setState({ status: 'loading' });
    try {
      const raw = await readRaw();
      if (raw === null) {
        useKitStore.setState({ kit: emptyKit(), status: 'ready', error: null });
        return emptyKit();
      }
      const r = parseKit(JSON.parse(raw));
      if (!r.ok) throw new Error(r.error);
      useKitStore.setState({ kit: r.kit, status: 'ready', error: null });
      return r.kit;
    } catch (e) {
      const error = `« Mon matériel » est illisible (${e instanceof Error ? e.message : String(e)}). Il n’a pas été modifié ; la version précédente est dans materiel.json.bak.`;
      useKitStore.setState({ status: 'error', error });
      return emptyKit();
    }
  })();
  return loading;
}

/** Modifie « Mon matériel » et l'enregistre. Refusé tant que le fichier existant est illisible. */
export async function updateKit(fn: (k: Kit) => Kit): Promise<{ ok: true } | { ok: false; error: string }> {
  await loadKit();
  const s = useKitStore.getState();
  if (s.status === 'error') return { ok: false, error: s.error ?? '« Mon matériel » est illisible' };
  const prev = s.kit;
  const next = fn(prev);
  useKitStore.setState({ kit: next });
  try {
    await writeRaw(JSON.stringify(next, null, 2));
    return { ok: true };
  } catch (e) {
    useKitStore.setState({ kit: prev });
    return { ok: false, error: `Enregistrement de « Mon matériel » impossible : ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** « Mon matériel », chargé à la première utilisation. */
export function useKit(): KitState {
  const s = useKitStore();
  useEffect(() => {
    void loadKit();
  }, []);
  return s;
}
