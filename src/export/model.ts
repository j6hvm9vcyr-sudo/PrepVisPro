/**
 * Préparation des exports : une seule mise à plat du document, partagée par le PDF,
 * l'Excel et le CSV. Ainsi, les trois formats disent exactement la même chose.
 */
import type { Id, Plan, ProjectDoc, Sequence } from '../model/types';
import { computeNumbers } from '../model/numbering';
import { displayText } from '../model/entry';
import { coverImage } from '../model/images';
import { missingFields } from '../model/completeness';
import { sequenceTitle, stripColors } from '../ui/strip';
import { summarizeSequence } from '../model/summary';
import { effectiveShooting } from '../model/shooting';

export type ColumnId = 'global' | 'code' | 'image' | 'action' | 'script' | 'size' | 'axis' | 'angle' | 'focal' | 'movement' | 'grip' | 'notes';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  /** Largeur relative dans le PDF. */
  weight: number;
  /** Largeur Excel (en caractères). */
  xlsWidth: number;
  /** Colonne propre à chaque caméra (une ligne par caméra). */
  perCamera: boolean;
}

export const COLUMN_DEFS: Record<ColumnId, ColumnDef> = {
  global: { id: 'global', label: 'N°', weight: 0.45, xlsWidth: 5, perCamera: false },
  code: { id: 'code', label: 'Plan', weight: 0.75, xlsWidth: 8, perCamera: false },
  image: { id: 'image', label: 'Image', weight: 1.9, xlsWidth: 30, perCamera: false },
  action: { id: 'action', label: 'Action', weight: 2.6, xlsWidth: 36, perCamera: false },
  script: { id: 'script', label: 'Scénario', weight: 2.6, xlsWidth: 44, perCamera: false },
  size: { id: 'size', label: 'Valeur', weight: 1.55, xlsWidth: 14, perCamera: true },
  axis: { id: 'axis', label: 'Axe', weight: 0.85, xlsWidth: 10, perCamera: true },
  angle: { id: 'angle', label: 'Angle', weight: 1.25, xlsWidth: 14, perCamera: true },
  focal: { id: 'focal', label: 'Focale', weight: 0.95, xlsWidth: 12, perCamera: true },
  movement: { id: 'movement', label: 'Mouvement', weight: 1.25, xlsWidth: 18, perCamera: true },
  grip: { id: 'grip', label: 'Machinerie', weight: 1.15, xlsWidth: 16, perCamera: true },
  notes: { id: 'notes', label: 'Divers', weight: 1.6, xlsWidth: 26, perCamera: false },
};

export const ALL_COLUMNS: ColumnId[] = ['global', 'code', 'image', 'action', 'script', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'notes'];

export interface ExportOptions {
  columns: ColumnId[];
  /** Séquences à inclure (vide = toutes). */
  sequenceIds: Id[];
  orientation: 'landscape' | 'portrait';
  /** Taille des vignettes dans le PDF. */
  imageSize: 'small' | 'medium' | 'large';
  coverPage: boolean;
  /** Inclure les commentaires de séquence. */
  sequenceComments: boolean;
  /** Marquer les plans incomplets (utile en prépa, pas pour un document final). */
  markIncomplete: boolean;
  /** Ajouter le dépouillement image (une ligne par séquence : caméra, machinerie, lumière, autre). */
  breakdown: boolean;
  /** Ajouter les plans au sol des séquences exportées (PDF). */
  floorPlans: boolean;
  /** Ajouter l'ordre de tournage (installations) des séquences où il est établi. */
  shootingOrder: boolean;
  /**
   * Mise en page : « dt » = comme un découpage technique habituel (valeur, axe, angle, focale,
   * mouvement, machinerie regroupés dans une case Description) ; « colonnes » = une colonne par réglage.
   */
  layout: 'dt' | 'columns';
  /** Afficher la caméra (A, B…) des plans tournés à plusieurs caméras. */
  showCamera: boolean;
}

export interface ExportPreset {
  id: string;
  name: string;
  options: ExportOptions;
}

const base: Omit<ExportOptions, 'columns'> = {
  sequenceIds: [],
  orientation: 'landscape',
  imageSize: 'medium',
  coverPage: true,
  sequenceComments: true,
  markIncomplete: false,
  breakdown: false,
  floorPlans: true,
  shootingOrder: true,
  layout: 'dt',
  showCamera: true,
};

/** Ordre des colonnes d'un découpage technique habituel. */
const DT_ORDER: ColumnId[] = ['global', 'code', 'action', 'script', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'image', 'notes'];

export const BUILTIN_PRESETS: ExportPreset[] = [
  { id: 'complet', name: 'Découpage complet', options: { ...base, breakdown: true, columns: DT_ORDER } },
  { id: 'realisation', name: 'Version réalisation', options: { ...base, columns: ['code', 'action', 'script', 'size', 'axis', 'angle', 'focal', 'movement', 'image'] } },
  { id: 'technique', name: 'Version électro / machino', options: { ...base, imageSize: 'small', breakdown: true, columns: ['code', 'action', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'image', 'notes'] } },
  { id: 'liste', name: 'Liste des plans (une colonne par réglage)', options: { ...base, layout: 'columns', coverPage: false, sequenceComments: false, floorPlans: false, columns: ['global', 'code', 'action', 'size', 'axis', 'angle', 'focal', 'movement', 'grip'] } },
];

export interface ExportCameraRow {
  label: string;
  values: Partial<Record<ColumnId, string>>;
}

export interface ExportPlan {
  id: Id;
  global: number;
  code: string;
  isReprise: boolean;
  action: string;
  script: string;
  notes: string;
  imageFile: string | null;
  missing: string[];
  cameras: ExportCameraRow[];
}

export interface ExportInstallation {
  name: string;
  note: string;
  plans: { order: number; plan: ExportPlan }[];
}

export interface ExportSequence {
  id: Id;
  number: string;
  title: string;
  location: string;
  address: string;
  comments: string;
  strip: { fill: string; edge: string };
  /** Couleur pâle de la séquence selon l'effet (fond des lignes, style découpage technique). */
  tint: string;
  /** « SÉQUENCE 4 - INT. CHAMBRE D'AXEL - NUIT. » */
  heading: string;
  breakdown: { camera: string; grip: string; lighting: string; other: string };
  summary: { focals: string; grip: string; movements: string };
  plans: ExportPlan[];
  /** Ordre de tournage, s'il est établi : installations dans l'ordre, puis plans « à ranger ». */
  shooting: { installations: ExportInstallation[]; loose: ExportPlan[] } | null;
}

export interface ExportModel {
  title: string;
  director: string;
  production: string;
  aspectRatio: string;
  crew: { role: string; name: string }[];
  multiCamera: boolean;
  /** Version du projet exportée (« V2 envoyée à Victor », « V2 + modifications »), si des versions existent. */
  version: string | null;
  totalPlans: number;
  sequences: ExportSequence[];
}

function planRow(p: Plan, doc: ProjectDoc, n: { global: number; code: string; repriseLetter: string }): ExportPlan {
  const cover = coverImage(p);
  return {
    id: p.id,
    global: n.global,
    code: n.code,
    isReprise: n.repriseLetter !== '',
    action: p.action,
    script: p.scriptExcerpt,
    notes: p.notes,
    imageFile: cover?.file ?? null,
    missing: missingFields(p, doc.settings),
    cameras: p.cameras.map((c) => ({
      label: doc.settings.cameras.find((k) => k.id === c.cameraId)?.label ?? '?',
      values: {
        size: displayText('size', c),
        axis: displayText('axis', c),
        angle: displayText('angle', c),
        focal: displayText('focal', c),
        movement: displayText('movement', c),
        grip: displayText('grip', c),
      },
    })),
  };
}

export function buildExportModel(doc: ProjectDoc, opts: Pick<ExportOptions, 'sequenceIds'>): ExportModel {
  const numbers = computeNumbers(doc);
  const pick = new Set(opts.sequenceIds);
  const seqs = doc.sequences.filter((s) => pick.size === 0 || pick.has(s.id));
  const sequences = seqs.map(
    (s: Sequence): ExportSequence => ({
      id: s.id,
      number: s.number,
      title: sequenceTitle(s),
      location: s.location,
      address: s.address,
      comments: s.comments,
      strip: stripColors(s),
      tint: effectTint(s),
      heading: `SÉQUENCE ${s.number || '?'} - ${s.intExt}. ${(s.location || 'Décor à préciser').toUpperCase()} - ${s.dayNight}.`,
      breakdown: { ...s.breakdown },
      summary: summarizeSequence(s),
      plans: s.plans.map((p) => planRow(p, doc, numbers.get(p.id)!)),
      shooting: shootingOf(s, doc, numbers),
    }),
  );
  return {
    title: doc.meta.title,
    director: doc.meta.director,
    production: doc.meta.production,
    aspectRatio: doc.meta.aspectRatio,
    crew: doc.meta.crew.filter((c) => c.role.trim() || c.name.trim()).map(({ role, name }) => ({ role, name })),
    multiCamera: doc.sequences.some((s) => s.plans.some((p) => p.cameras.length > 1)),
    version: null,
    totalPlans: sequences.reduce((n, s) => n + s.plans.length, 0),
    sequences,
  };
}

/**
 * Teinte pâle d'une séquence selon l'effet, dans l'esprit du plan de travail :
 * INT jour gris très clair (« blanc »), EXT jour jaune, INT nuit bleu, EXT nuit vert.
 */
export function effectTint(s: Pick<Sequence, 'intExt' | 'dayNight'>): string {
  const ext = s.intExt !== 'INT';
  if (s.dayNight === 'JOUR') return ext ? '#FFF2CC' : '#F3F3F3';
  return ext ? '#D9EAD3' : '#CFE2F3';
}

const DESC_LABEL: Partial<Record<ColumnId, string>> = { size: 'VALEUR', axis: 'AXE', angle: 'ANGLE', focal: 'FOCALE', movement: 'MV', grip: 'MACH' };

/** Réglages techniques retenus pour la case Description, dans l'ordre choisi. */
export function descriptionFields(columns: ColumnId[]): ColumnId[] {
  return columns.filter((c) => COLUMN_DEFS[c].perCamera);
}

/**
 * Case « Description » d'un plan : « VALEUR: Poitrine », « AXE: 3/4 »… une ligne par réglage
 * renseigné ; un bloc par caméra pour un plan multicaméra.
 */
export function describePlan(p: ExportPlan, fields: ColumnId[], opts: { showCamera: boolean; gap?: string }): { camera: string | null; lines: { label: string; value: string }[] }[] {
  const multi = p.cameras.length > 1;
  return p.cameras.map((cam) => ({
    camera: multi && opts.showCamera ? cam.label : null,
    lines: fields.map((f) => ({ label: DESC_LABEL[f] ?? COLUMN_DEFS[f].label.toUpperCase(), value: cam.values[f] ?? '' })).filter((l) => l.value),
  }));
}

/** Description en texte brut (Excel, CSV) : lignes séparées par `gap`. */
export function descriptionText(p: ExportPlan, fields: ColumnId[], showCamera: boolean, gap = '\n'): string {
  return describePlan(p, fields, { showCamera })
    .map((b) => [...(b.camera ? [`CAM ${b.camera}`] : []), ...b.lines.map((l) => `${l.label}: ${l.value}`)].join(gap))
    .filter(Boolean)
    .join(gap + gap);
}

const DT_IMG_WIDTH = { small: 30, medium: 40, large: 48 } as const;

export type DtCol = { id: 'global' | 'code' | 'camera' | 'action' | 'script' | 'description' | 'image' | 'notes'; label: string; width: number };

/** Colonnes du découpage technique, dans l'ordre choisi ; les réglages techniques forment la Description. */
export function dtColumns(opts: ExportOptions, multiCamera: boolean): DtCol[] {
  const out: DtCol[] = [];
  let desc = false;
  for (const c of opts.columns) {
    if (COLUMN_DEFS[c].perCamera) {
      if (!desc) {
        out.push({ id: 'description', label: 'DESCRIPTION', width: 24 });
        desc = true;
      }
      continue;
    }
    if (c === 'global') out.push({ id: 'global', label: 'N°', width: 4.5 });
    else if (c === 'code') {
      out.push({ id: 'code', label: 'PLAN', width: 7 });
      if (multiCamera && opts.showCamera) out.push({ id: 'camera', label: 'CAM', width: 5 });
    } else if (c === 'action') out.push({ id: 'action', label: 'ACTION', width: 32 });
    else if (c === 'script') out.push({ id: 'script', label: 'SCÉNARIO', width: 50 });
    else if (c === 'image') out.push({ id: 'image', label: 'RÉFÉRENCE', width: DT_IMG_WIDTH[opts.imageSize] });
    else if (c === 'notes') out.push({ id: 'notes', label: 'DIVERS', width: 24 });
  }
  return out;
}


function shootingOf(s: Sequence, doc: ProjectDoc, numbers: ReturnType<typeof computeNumbers>): ExportSequence['shooting'] {
  const e = effectiveShooting(s);
  if (!e) return null;
  let order = 0;
  return {
    installations: e.installations.filter((i) => i.plans.length).map((i) => ({ name: i.name, note: i.note, plans: i.plans.map((p) => ({ order: ++order, plan: planRow(p, doc, numbers.get(p.id)!) })) })),
    loose: e.loose.map((p) => planRow(p, doc, numbers.get(p.id)!)),
  };
}

/** Valeur texte d'une cellule non liée à une caméra. */
export function planValue(p: ExportPlan, col: ColumnId): string {
  switch (col) {
    case 'global':
      return String(p.global);
    case 'code':
      return p.code;
    case 'action':
      return p.action;
    case 'script':
      return p.script;
    case 'notes':
      return p.notes;
    default:
      return '';
  }
}

/** Nom de fichier sûr, à partir du titre du projet. */
export function exportFileName(title: string, suffix: string, ext: string): string {
  const clean = (title || 'Projet').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${clean} — ${suffix} — ${date}.${ext}`;
}

// ------------------------------------------------------------------ CSV

function csvCell(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV au format français (séparateur « ; », UTF-8 avec BOM : s'ouvre correctement dans Excel). */
export function buildCsv(m: ExportModel, columns: ColumnId[], showCamera = true): string {
  const cols = columns.filter((c) => c !== 'image');
  const withCam = m.multiCamera && showCamera;
  const header = ['Séquence', ...(withCam ? ['Caméra'] : []), ...cols.map((c) => COLUMN_DEFS[c].label)];
  const lines = [header];
  for (const s of m.sequences)
    for (const p of s.plans)
      p.cameras.forEach((cam, i) => {
        lines.push([
          s.number,
          ...(withCam ? [cam.label] : []),
          ...cols.map((c) => (COLUMN_DEFS[c].perCamera ? (cam.values[c] ?? '') : i === 0 ? planValue(p, c) : '')),
        ]);
      });
  return '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
