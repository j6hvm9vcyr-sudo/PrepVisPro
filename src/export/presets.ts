/** Modèles d'export : intégrés + modèles personnels (dans « Mon matériel », sur cet ordinateur). */
import { updateKit } from '../platform/kit';
import type { Kit } from '../model/kit';
import { ALL_COLUMNS, BUILTIN_PRESETS, type ColumnId, type ExportOptions, type ExportPreset } from './model';

const KEY = 'prepvispro.exportPresets';
const LAST = 'prepvispro.exportLast';
const MIGRATED = 'prepvispro.exportPresets.dansMonMateriel';

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

/** Modèles personnels gardés dans « Mon matériel » (options vérifiées une à une). */
export function userPresetsOf(kit: Kit): ExportPreset[] {
  return kit.exportPresets
    .map((p) => {
      const options = sanitize(p.options as Partial<ExportOptions>);
      return options ? { id: p.id, name: p.name, options } : null;
    })
    .filter((p): p is ExportPreset => p !== null);
}

export async function saveUserPreset(name: string, options: ExportOptions): Promise<{ ok: true; preset: ExportPreset } | { ok: false; error: string }> {
  const preset: ExportPreset = { id: `u-${Date.now().toString(36)}`, name: name.trim() || 'Mon modèle', options: { ...options, sequenceIds: [] } };
  const r = await updateKit((k) => ({ ...k, exportPresets: [...k.exportPresets.filter((x) => x.name !== preset.name), preset] }));
  return r.ok ? { ok: true, preset } : r;
}

export async function deleteUserPreset(id: string) {
  return updateKit((k) => ({ ...k, exportPresets: k.exportPresets.filter((p) => p.id !== id) }));
}

/**
 * Les modèles d'avant la v0.8.2 étaient gardés à part (stockage du navigateur interne) :
 * ils passent une fois dans « Mon matériel », sans écraser un modèle du même nom.
 */
export async function importOldPresets(): Promise<void> {
  let raw: unknown;
  try {
    if (localStorage.getItem(MIGRATED)) return;
    raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return;
  }
  const old = (Array.isArray(raw) ? raw : [])
    .map((p) => (p && typeof p.id === 'string' && typeof p.name === 'string' && sanitize(p.options) ? { id: p.id as string, name: p.name as string, options: sanitize(p.options) } : null))
    .filter((p): p is { id: string; name: string; options: ExportOptions } => p !== null);
  const r = old.length ? await updateKit((k) => ({ ...k, exportPresets: [...k.exportPresets, ...old.filter((o) => !k.exportPresets.some((x) => x.name === o.name))] })) : { ok: true };
  if (r.ok)
    try {
      localStorage.setItem(MIGRATED, '1');
    } catch {
      /* on réessaiera : sans doublon, grâce au nom */
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
