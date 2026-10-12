/**
 * Préférences de l'app : ce qui suit l'utilisateur d'un projet à l'autre, gardé sur ce Mac et
 * jamais dans un fichier projet (envoyer un projet ne transmet pas ces choix).
 *
 * - « Plan suivant » : champs qu'un nouveau plan reprend du précédent ;
 * - abréviations reconnues à la saisie, par terme (« stead » → Steadicam) ;
 * - largeur des colonnes et hauteur des rangées du tableau (à l'écran seulement, jamais dans l'export).
 *
 * Jusqu'au format 18, ces deux réglages étaient dans chaque projet : à l'ouverture d'un ancien
 * projet, ils sont repris ici (adoptLegacy) pour que rien ne soit perdu.
 */
import { z } from 'zod';
import { type CarryField } from './types';
import { DEFAULT_CARRY, TERM_ALIASES } from './defaults';
import { norm } from './text';

export const PREFS_VERSION = 1 as const;

/** Colonnes du tableau, dans l'ordre. */
export const TABLE_COLUMNS = ['code', 'image', 'cam', 'action', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'duration', 'notes'] as const;
export type TableColumn = (typeof TABLE_COLUMNS)[number];

/** Largeurs par défaut (px) ; null = la colonne partage la place qui reste (action, notes). */
export const TABLE_DEFAULT_WIDTHS: Record<TableColumn, number | null> = { code: 64, image: 52, cam: 40, action: null, size: 100, axis: 60, angle: 92, focal: 100, movement: 100, grip: 96, duration: 64, notes: null };
export const TABLE_MIN_WIDTH = 36;
export const TABLE_MAX_WIDTH = 640;
export const ROW_MIN_HEIGHT = 32;
export const ROW_MAX_HEIGHT = 200;
/** Largeur minimale de l'action quand elle prend la place qui reste. */
const ACTION_FLEX_MIN = 150;
const NOTES_FLEX_MIN = 140;

export interface TableLayout {
  /** Largeurs choisies à la main (px) ; une colonne absente garde sa largeur par défaut. */
  widths: Partial<Record<TableColumn, number>>;
  /** Hauteur minimale des rangées (px) ; null = hauteur par défaut. */
  rowHeight: number | null;
}

/**
 * Disposition des panneaux (0.18), gardée sur ce Mac : chaque page garde ses panneaux ouverts.
 * Découpage : Le film et Scénario à gauche, Images en bas, Notes à droite (à la place des Détails),
 * Tournage : Le film.
 */
export interface PanelLayout {
  film: boolean;
  scenario: boolean;
  images: boolean;
  notes: boolean;
  /** Hauteur du tiroir Images (px). */
  imagesHeight: number;
  tournageFilm: boolean;
  /** Plans au sol et Tournage (0.19) : leur liste à gauche, leurs détails à droite. */
  solFilm: boolean;
  solDetails: boolean;
  tournageDetails: boolean;
}

export const IMAGES_MIN_HEIGHT = 150;
export const IMAGES_MAX_HEIGHT = 600;

export function defaultLayout(): PanelLayout {
  return { film: true, scenario: false, images: false, notes: false, imagesHeight: 300, tournageFilm: true, solFilm: true, solDetails: true, tournageDetails: true };
}

export interface AppPrefs {
  version: typeof PREFS_VERSION;
  carryOver: Record<CarryField, boolean>;
  aliases: Record<string, string[]>;
  table: TableLayout;
  layout: PanelLayout;
}

/** Colonnes de la grille CSS et largeur minimale du tableau ; `shown` : colonnes facultatives affichées (projet). */
export function tableTemplate(widths: Partial<Record<TableColumn, number>>, shown: readonly string[] = ['image', 'size', 'axis', 'angle', 'focal', 'movement', 'grip']): { columns: string; minWidth: number } {
  let min = 0;
  const always: readonly TableColumn[] = ['code', 'cam', 'action'];
  const parts = TABLE_COLUMNS.filter((c) => always.includes(c) || shown.includes(c)).map((c) => {
    const w = widths[c] ?? TABLE_DEFAULT_WIDTHS[c];
    if (w === null) {
      const m = c === 'notes' ? NOTES_FLEX_MIN : ACTION_FLEX_MIN;
      min += m;
      return `minmax(${m}px, 1fr)`;
    }
    min += w;
    return `${w}px`;
  });
  return { columns: parts.join(' '), minWidth: min };
}

const carrySchema = z.object({ size: z.boolean(), axis: z.boolean(), angle: z.boolean(), focal: z.boolean(), movement: z.boolean(), grip: z.boolean() });
const aliasesSchema = z.record(z.string(), z.array(z.string()));
const tableSchema = z.object({
  widths: z.partialRecord(z.enum(TABLE_COLUMNS), z.number().min(TABLE_MIN_WIDTH).max(TABLE_MAX_WIDTH)),
  rowHeight: z.number().min(ROW_MIN_HEIGHT).max(ROW_MAX_HEIGHT).nullable(),
  // « showNotes » (0.13–0.14) : remplacé par les colonnes du projet (0.15), ignoré à la lecture.
});
const layoutSchema = z.object({
  film: z.boolean(),
  scenario: z.boolean(),
  images: z.boolean(),
  notes: z.boolean(),
  imagesHeight: z.number().min(IMAGES_MIN_HEIGHT).max(IMAGES_MAX_HEIGHT),
  tournageFilm: z.boolean(),
  // Apparus en 0.19 : absents d'un fichier de la 0.18, ils sont ouverts.
  solFilm: z.boolean().default(true),
  solDetails: z.boolean().default(true),
  tournageDetails: z.boolean().default(true),
});
// `table` (0.11.1) et `layout` (0.18) sont apparus après la première version des préférences : absents, ils prennent leur valeur par défaut.
const prefsSchema = z.object({ version: z.literal(PREFS_VERSION), carryOver: carrySchema, aliases: aliasesSchema, table: tableSchema.default({ widths: {}, rowHeight: null }), layout: layoutSchema.default(defaultLayout) });

export function defaultPrefs(): AppPrefs {
  return { version: PREFS_VERSION, carryOver: { ...DEFAULT_CARRY }, aliases: structuredClone(TERM_ALIASES), table: { widths: {}, rowHeight: null }, layout: defaultLayout() };
}

/** Relit le fichier de préférences : refusé en bloc s'il n'est pas valide (jamais à moitié). */
export function parsePrefs(raw: unknown): { ok: true; prefs: AppPrefs } | { ok: false; error: string } {
  const v = raw && typeof raw === 'object' ? (raw as { version?: unknown }).version : undefined;
  if (typeof v === 'number' && v > PREFS_VERSION) return { ok: false, error: 'préférences écrites par une version plus récente de Topshot' };
  const r = prefsSchema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: first ? `${first.path.join('.') || 'fichier'} : ${first.message}` : 'format inconnu' };
  }
  return { ok: true, prefs: r.data as AppPrefs };
}

/** Réglages d'un projet des formats 16 à 18, à reprendre dans les préférences. */
export interface LegacyPrefs {
  carryOver: Record<CarryField, boolean> | null;
  aliases: Record<string, string[]> | null;
}

/** Lit, dans un projet brut (avant migration), les réglages qui sont passés dans les préférences. */
export function legacyPrefsOf(raw: unknown): LegacyPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== 'number' || v < 16 || v > 18) return null;
  const s = (raw as { settings?: unknown }).settings;
  if (!s || typeof s !== 'object') return null;
  const c = carrySchema.safeParse((s as { carryOver?: unknown }).carryOver);
  const a = aliasesSchema.safeParse((s as { aliases?: unknown }).aliases);
  if (!c.success && !a.success) return null;
  return { carryOver: c.success ? c.data : null, aliases: a.success ? a.data : null };
}

/**
 * Ajoute les abréviations de `extra` à `base`, sans rendre la saisie ambiguë : une abréviation déjà
 * reconnue pour un autre terme (ou égale au nom d'un autre terme) n'est pas ajoutée.
 */
export function mergeAliases(base: Readonly<Record<string, readonly string[]>>, extra: Readonly<Record<string, readonly string[]>>): { aliases: Record<string, string[]>; added: number } {
  const out: Record<string, string[]> = {};
  for (const [t, list] of Object.entries(base)) out[t] = [...list];
  const owner = new Map<string, string>();
  const claim = (k: string, t: string) => {
    if (k && !owner.has(k)) owner.set(k, t);
  };
  for (const t of [...Object.keys(base), ...Object.keys(extra)]) claim(norm(t), t);
  for (const [t, list] of Object.entries(base)) for (const a of list) claim(norm(a), t);
  let added = 0;
  for (const [t, list] of Object.entries(extra)) {
    for (const raw of list) {
      const a = raw.trim();
      const k = norm(a);
      if (!k || owner.has(k)) continue;
      owner.set(k, t);
      (out[t] ??= []).push(a);
      added++;
    }
  }
  return { aliases: out, added };
}

/**
 * Reprend les réglages d'un ancien projet. Premières préférences (aucune encore enregistrée sur ce
 * Mac) : celles du projet, telles quelles. Ensuite : seules les abréviations qui manquent sont
 * ajoutées ; le « plan suivant » des préférences n'est plus changé par un projet.
 */
export function adoptLegacy(prefs: AppPrefs, legacy: LegacyPrefs, first: boolean): { prefs: AppPrefs; changed: boolean } {
  if (first) {
    const next: AppPrefs = {
      version: PREFS_VERSION,
      carryOver: legacy.carryOver ? { ...legacy.carryOver } : { ...prefs.carryOver },
      aliases: legacy.aliases ? structuredClone(legacy.aliases) : structuredClone(prefs.aliases),
      table: prefs.table,
      layout: prefs.layout,
    };
    return { prefs: next, changed: JSON.stringify(next) !== JSON.stringify(prefs) };
  }
  if (!legacy.aliases) return { prefs, changed: false };
  const m = mergeAliases(prefs.aliases, legacy.aliases);
  return m.added ? { prefs: { ...prefs, aliases: m.aliases }, changed: true } : { prefs, changed: false };
}
