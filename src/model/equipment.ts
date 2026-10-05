/**
 * Matériel du projet : caméras, optiques, projecteurs, matières de réflecteurs, plans types et
 * modèles d'export. Il appartient au projet (rien n'est gardé ailleurs) ; pour le réutiliser, on
 * le reprend d'un autre projet — ou de l'ancien « Mon matériel » (v0.8.0 à 0.8.2), gardé sur le Mac.
 *
 * Un élément repris est COPIÉ : le modifier ensuite ne change pas sa source.
 */
import { z } from 'zod';
import { produce } from 'immer';
import { settingsSchemas } from './schema';
import { newId } from './defaults';
import { presetLabel } from './shotPresets';
import type { Fixture, Id, LensSeries, ProjectCamera, ProjectDoc, ProjectSettings, ReflectorMaterial, ShotPreset } from './types';

export type EquipmentKind = 'cameras' | 'lenses' | 'fixtures' | 'reflectors' | 'shotPresets' | 'exportPresets';
type ItemOf<K extends EquipmentKind> = ProjectSettings[K][number];
export type EquipmentItem = ItemOf<EquipmentKind>;

/** Ce qu'on peut reprendre : le matériel d'un projet, ou l'ancien « Mon matériel ». */
export type EquipmentSource = { [K in EquipmentKind]: ProjectSettings[K] };

export const EQUIPMENT_KINDS: [EquipmentKind, string][] = [
  ['cameras', 'Caméras'],
  ['lenses', 'Optiques'],
  ['fixtures', 'Projecteurs'],
  ['reflectors', 'Matières de réflecteurs'],
  ['shotPresets', 'Plans types'],
  ['exportPresets', 'Modèles d’export'],
];

export function sourceOfProject(doc: ProjectDoc): EquipmentSource {
  const s = doc.settings;
  return { cameras: s.cameras, lenses: s.lenses, fixtures: s.fixtures, reflectors: s.reflectors, shotPresets: s.shotPresets, exportPresets: s.exportPresets };
}

// ------------------------------------------------------------ ancien « Mon matériel » (lecture seule)

const oldKitSchema = z.object({
  version: z.literal(1),
  cameras: z.array(settingsSchemas.projectCamera),
  lenses: z.array(settingsSchemas.lensSeries),
  fixtures: z.array(settingsSchemas.fixture),
  reflectors: z.array(settingsSchemas.reflector),
  exportPresets: z.array(z.object({ id: z.string().min(1), name: z.string(), options: z.unknown() })).default([]),
});

/** Lecture du fichier « Mon matériel » des versions 0.8.0 à 0.8.2 : refusé en bloc s'il n'est pas valide. */
export function parseOldKit(raw: unknown): { ok: true; source: EquipmentSource } | { ok: false; error: string } {
  const r = oldKitSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues[0] ? `${r.error.issues[0].path.join('.')} : ${r.error.issues[0].message}` : 'format inconnu' };
  const k = r.data;
  return { ok: true, source: { cameras: k.cameras as ProjectCamera[], lenses: k.lenses as LensSeries[], fixtures: k.fixtures as Fixture[], reflectors: k.reflectors as ReflectorMaterial[], shotPresets: [], exportPresets: k.exportPresets } };
}

export function sourceSize(s: EquipmentSource): number {
  return EQUIPMENT_KINDS.reduce((n, [k]) => n + s[k].length, 0);
}

// ------------------------------------------------------------ comparaison et reprise

/** Contenu comparable (sans identifiant ni lettre de caméra) : « déjà dans le projet, à l'identique ». */
function content(kind: EquipmentKind, item: EquipmentItem): string {
  if (kind === 'cameras') {
    const { id: _i, label: _l, ...rest } = item as ProjectCamera;
    return JSON.stringify(rest);
  }
  const { id: _id, ...rest } = item as { id: Id };
  return JSON.stringify(rest);
}

/** Libellé d'un élément dans les listes. */
export function equipmentLabel(kind: EquipmentKind, item: EquipmentItem): string {
  switch (kind) {
    case 'cameras': {
      const c = item as ProjectCamera;
      return [c.body, c.mode].filter((x) => x.trim()).join(' · ') || `Caméra ${c.label}`;
    }
    case 'lenses':
      return (item as LensSeries).name || 'Série sans nom';
    case 'fixtures':
      return (item as Fixture).name || 'Projecteur sans nom';
    case 'reflectors':
      return (item as ReflectorMaterial).name || 'Matière sans nom';
    case 'shotPresets':
      return presetLabel(item as ShotPreset);
    default:
      return (item as { name: string }).name || 'Modèle sans nom';
  }
}

/** L'élément est-il déjà dans le projet, à l'identique ? */
export function inProject(doc: ProjectDoc, kind: EquipmentKind, item: EquipmentItem): boolean {
  const c = content(kind, item);
  return (doc.settings[kind] as EquipmentItem[]).some((x) => content(kind, x) === c);
}

/** La caméra n'a encore rien de renseigné (celle d'un projet neuf). */
function blankCamera(c: ProjectCamera): boolean {
  return !c.body.trim() && !c.mode.trim() && c.sensorWidthMm === null && c.sensorHeightMm === null && c.squeeze === 1;
}

/** Prochaine lettre de caméra libre (A, B, C…). */
export function nextCameraLabel(doc: ProjectDoc): string {
  const used = new Set(doc.settings.cameras.map((c) => c.label));
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!used.has(l)) return l;
  }
  return String(doc.settings.cameras.length + 1);
}

const PREFIX: Record<EquipmentKind, string> = { cameras: 'cam', lenses: 'lens', fixtures: 'fx', reflectors: 'rm', shotPresets: 'pt', exportPresets: 'xp' };

/**
 * Copie un élément dans le projet. Déjà présent à l'identique : rien n'est ajouté. Caméra : la
 * première caméra encore vierge (celle d'un projet neuf) est remplie plutôt que d'en ajouter une,
 * pour que les plans la gardent.
 */
export function addEquipment(doc: ProjectDoc, kind: EquipmentKind, item: EquipmentItem): { doc: ProjectDoc; id: Id; added: boolean } {
  const c = content(kind, item);
  const same = (doc.settings[kind] as EquipmentItem[]).find((x) => content(kind, x) === c);
  if (same) return { doc, id: same.id, added: false };
  if (kind === 'cameras') {
    const cam = item as ProjectCamera;
    const blank = doc.settings.cameras.find(blankCamera);
    if (blank) {
      const next = produce(doc, (d) => {
        const b = d.settings.cameras.find((x) => x.id === blank.id)!;
        Object.assign(b, { body: cam.body, mode: cam.mode, sensorWidthMm: cam.sensorWidthMm, sensorHeightMm: cam.sensorHeightMm, squeeze: cam.squeeze });
      });
      return { doc: next, id: blank.id, added: true };
    }
    const id = newId('cam');
    return { doc: produce(doc, (d) => void d.settings.cameras.push({ ...structuredClone(cam), id, label: nextCameraLabel(doc) })), id, added: true };
  }
  const id = newId(PREFIX[kind]);
  const next = produce(doc, (d) => void (d.settings[kind] as EquipmentItem[]).push({ ...structuredClone(item), id } as EquipmentItem));
  return { doc: next, id, added: true };
}

/** Reprend plusieurs éléments d'un coup (une seule étape d'annulation). Renvoie le nombre ajouté. */
export function addEquipmentMany(doc: ProjectDoc, picks: { kind: EquipmentKind; item: EquipmentItem }[]): { doc: ProjectDoc; added: number } {
  let d = doc;
  let added = 0;
  for (const p of picks) {
    const r = addEquipment(d, p.kind, p.item);
    d = r.doc;
    if (r.added) added++;
  }
  return { doc: d, added };
}
