/** Modèles d'export : intégrés + modèles du projet. */
import { useApp } from '../state/appStore';
import { newId } from '../model/defaults';
import { ALL_COLUMNS, BUILTIN_PRESETS, type ColumnId, type ExportOptions, type ExportPreset } from './model';

const KEY = 'prepvispro.exportPresets';
const LAST = 'prepvispro.exportLast';

function sanitize(o: Partial<ExportOptions> | undefined): ExportOptions | null {
  if (!o || !Array.isArray(o.columns)) return null;
  const columns = o.columns.filter((c): c is ColumnId => (ALL_COLUMNS as string[]).includes(c));
  if (!columns.length) return null;
  return {
    columns: [...new Set(columns)],
    sequenceIds: [],
    orientation: o.orientation === 'portrait' ? 'portrait' : 'landscape',
    imageSize: o.imageSize === 'small' || o.imageSize === 'large' ? o.imageSize : 'medium',
    coverPage: o.coverPage !== false,
    sequenceComments: o.sequenceComments !== false,
    markIncomplete: o.markIncomplete === true,
    breakdown: o.breakdown === true,
    floorPlans: o.floorPlans !== false,
    shootingOrder: o.shootingOrder !== false,
    days: o.days !== false,
    layout: o.layout === 'columns' ? 'columns' : 'dt',
    showCamera: o.showCamera !== false,
  };
}

/** Modèles d'export du projet (options vérifiées une à une : un modèle abîmé est ignoré). */
export function projectPresets(list: readonly { id: string; name: string; options: unknown }[]): ExportPreset[] {
  return list
    .map((p) => {
      const options = sanitize(p.options as Partial<ExportOptions>);
      return options ? { id: p.id, name: p.name, options } : null;
    })
    .filter((p): p is ExportPreset => p !== null);
}

/** Enregistre un modèle dans le projet (un modèle du même nom est remplacé ; ⌘Z annule). */
export function saveProjectPreset(name: string, options: ExportOptions): ExportPreset {
  const preset: ExportPreset = { id: newId('xp'), name: name.trim() || 'Mon modèle', options: { ...options, sequenceIds: [] } };
  useApp.getState().updateDoc((d) => void (d.settings.exportPresets = [...d.settings.exportPresets.filter((x) => x.name !== preset.name), preset]));
  return preset;
}

export function deleteProjectPreset(id: string) {
  useApp.getState().updateDoc((d) => void (d.settings.exportPresets = d.settings.exportPresets.filter((p) => p.id !== id)));
}

/** Modèles enregistrés avant la v0.8.3, hors du projet (navigateur interne, puis « Mon matériel »). */
export function oldLocalPresets(): ExportPreset[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return projectPresets(Array.isArray(raw) ? raw.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') : []);
  } catch {
    return [];
  }
}

export function rememberLast(presetId: string, options: ExportOptions) {
  try {
    localStorage.setItem(LAST, JSON.stringify({ presetId, options: { ...options, sequenceIds: [] } }));
  } catch {
    /* sans conséquence */
  }
}

export function lastUsed(): { presetId: string; options: ExportOptions } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? 'null');
    const options = sanitize(v?.options);
    if (options && typeof v.presetId === 'string') return { presetId: v.presetId, options };
  } catch {
    /* valeur par défaut */
  }
  return { presetId: BUILTIN_PRESETS[0]!.id, options: structuredClone(BUILTIN_PRESETS[0]!.options) };
}

export function sameOptions(a: ExportOptions, b: ExportOptions): boolean {
  return (
    a.columns.join() === b.columns.join() &&
    a.orientation === b.orientation &&
    a.imageSize === b.imageSize &&
    a.coverPage === b.coverPage &&
    a.sequenceComments === b.sequenceComments &&
    a.markIncomplete === b.markIncomplete &&
    a.breakdown === b.breakdown &&
    a.floorPlans === b.floorPlans &&
    a.shootingOrder === b.shootingOrder &&
    a.days === b.days &&
    a.layout === b.layout &&
    a.showCamera === b.showCamera
  );
}
