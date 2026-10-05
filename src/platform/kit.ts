/**
 * Ancien « Mon matériel » (versions 0.8.0 à 0.8.2) : un fichier `materiel.json` gardé sur le Mac.
 * Le matériel appartient maintenant au projet ; ce fichier n'est plus que LU, pour reprendre son
 * contenu dans un projet (Réglages › Matériel). Il n'est jamais modifié.
 */
import { isTauri } from './env';
import { parseOldKit, sourceSize, type EquipmentSource } from '../model/equipment';
import { oldLocalPresets } from '../export/presets';

const LOCAL_KEY = 'prepvispro.kit';

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

/** Contenu de l'ancien « Mon matériel » (et des modèles d'export gardés à part avant lui) ; null s'il n'y a rien. */
export async function readOldEquipment(): Promise<{ source: EquipmentSource } | { error: string } | null> {
  let source: EquipmentSource = { cameras: [], lenses: [], fixtures: [], reflectors: [], shotPresets: [], exportPresets: [] };
  try {
    const raw = await readRaw();
    if (raw !== null) {
      const r = parseOldKit(JSON.parse(raw));
      if (!r.ok) return { error: `L’ancien « Mon matériel » est illisible (${r.error}).` };
      source = r.source;
    }
  } catch (e) {
    return { error: `L’ancien « Mon matériel » est illisible (${e instanceof Error ? e.message : String(e)}).` };
  }
  const known = new Set(source.exportPresets.map((p) => p.name));
  source = { ...source, exportPresets: [...source.exportPresets, ...oldLocalPresets().filter((p) => !known.has(p.name))] };
  return sourceSize(source) ? { source } : null;
}
