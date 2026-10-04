/** Modèles d'export : intégrés + modèles personnels (enregistrés sur cet ordinateur). */
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
  };
}

export function userPresets(): ExportPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p) => {
        const options = sanitize(p?.options);
        return options && typeof p.id === 'string' && typeof p.name === 'string' ? { id: p.id, name: p.name, options } : null;
      })
      .filter((p): p is ExportPreset => p !== null);
  } catch {
    return [];
  }
}

export function saveUserPreset(name: string, options: ExportOptions): ExportPreset {
  const p: ExportPreset = { id: `u-${Date.now().toString(36)}`, name: name.trim() || 'Mon modèle', options: { ...options, sequenceIds: [] } };
  const list = [...userPresets().filter((x) => x.name !== p.name), p];
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : le modèle reste valable pour cette session */
  }
  return p;
}

export function deleteUserPreset(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(userPresets().filter((p) => p.id !== id)));
  } catch {
    /* sans conséquence */
  }
}

export function allPresets(): ExportPreset[] {
  return [...BUILTIN_PRESETS, ...userPresets()];
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
    a.floorPlans === b.floorPlans
  );
}
