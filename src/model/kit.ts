/**
 * « Mon matériel » : le matériel et les réglages habituels d'Adrien, gardés sur son Mac et
 * communs à tous ses projets (caméras et leurs modes, séries d'optiques, projecteurs, matières
 * de réflecteurs, vocabulaire et exposition de départ).
 *
 * Un élément est toujours COPIÉ dans le projet, jamais lié : le projet reste complet et
 * s'ouvre à l'identique sur un autre Mac ; le modifier ne change pas « Mon matériel ».
 * Les valeurs sont celles qu'Adrien a saisies (fiches fabricants, mesures) : rien n'est ajouté.
 */
import { z } from 'zod';
import { produce } from 'immer';
import { settingsSchemas } from './schema';
import { newId } from './defaults';
import { norm } from './text';
import type { Exposure, Fixture, Id, LensSeries, ProjectCamera, ProjectDoc, ReflectorMaterial, TermCategory } from './types';

export const KIT_VERSION = 1 as const;

export interface Kit {
  version: typeof KIT_VERSION;
  cameras: ProjectCamera[];
  lenses: LensSeries[];
  fixtures: Fixture[];
  reflectors: ReflectorMaterial[];
  /** Vocabulaire de départ des nouveaux projets ; null : celui de l'application. */
  terms: Record<TermCategory, string[]> | null;
  /** Exposition de départ des nouveaux projets ; null : celle de l'application. */
  exposure: Exposure | null;
}

export type KitKind = 'cameras' | 'lenses' | 'fixtures' | 'reflectors';
type ItemOf<K extends KitKind> = Kit[K][number];

export function emptyKit(): Kit {
  return { version: KIT_VERSION, cameras: [], lenses: [], fixtures: [], reflectors: [], terms: null, exposure: null };
}

const kitSchema = z.object({
  version: z.literal(KIT_VERSION),
  cameras: z.array(settingsSchemas.projectCamera),
  lenses: z.array(settingsSchemas.lensSeries),
  fixtures: z.array(settingsSchemas.fixture),
  reflectors: z.array(settingsSchemas.reflector),
  terms: settingsSchemas.terms.nullable(),
  exposure: settingsSchemas.exposure.nullable(),
});

/** Lecture du fichier « Mon matériel » : refusé en bloc s'il n'est pas valide (jamais à moitié). */
export function parseKit(raw: unknown): { ok: true; kit: Kit } | { ok: false; error: string } {
  const r = kitSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues[0] ? `${r.error.issues[0].path.join('.')} : ${r.error.issues[0].message}` : 'format inconnu' };
  return { ok: true, kit: r.data as Kit };
}

const n = (v: number | null) => (v === null ? '' : String(v));

/** Ce qui identifie un élément : enregistrer à nouveau le même élément le met à jour au lieu de le dupliquer. */
function identity<K extends KitKind>(kind: K, item: ItemOf<K>): string {
  switch (kind) {
    case 'cameras': {
      const c = item as ProjectCamera;
      return `${norm(c.body)}|${norm(c.mode)}`;
    }
    case 'lenses': {
      const l = item as LensSeries;
      return `${norm(l.name)}|${l.kind}`;
    }
    case 'fixtures':
      return norm((item as Fixture).name);
    default: {
      const r = item as ReflectorMaterial;
      return r.presetId ? `preset:${r.presetId}` : norm(r.name);
    }
  }
}

/** Contenu comparable (sans identifiant ni lettre de caméra) : « déjà dans le projet, à l'identique ». */
function content<K extends KitKind>(kind: K, item: ItemOf<K>): string {
  if (kind === 'cameras') {
    const c = item as ProjectCamera;
    return `${identity(kind, item)}|${n(c.sensorWidthMm)}|${n(c.sensorHeightMm)}|${c.squeeze}`;
  }
  const { id: _id, ...rest } = item as { id: Id };
  void _id;
  return JSON.stringify(rest);
}

/** Libellé d'un élément dans les listes. */
export function kitLabel<K extends KitKind>(kind: K, item: ItemOf<K>): string {
  switch (kind) {
    case 'cameras': {
      const c = item as ProjectCamera;
      return [c.body, c.mode].filter((x) => x.trim()).join(' · ') || 'Caméra sans nom';
    }
    case 'lenses':
      return (item as LensSeries).name || 'Série sans nom';
    case 'fixtures':
      return (item as Fixture).name || 'Projecteur sans nom';
    default:
      return (item as ReflectorMaterial).name || 'Matière sans nom';
  }
}

/** Pourquoi un élément ne peut pas être enregistré (sans nom, il serait impossible à retrouver). */
export function cannotSave<K extends KitKind>(kind: K, item: ItemOf<K>): string | null {
  if (kind === 'cameras') return (item as ProjectCamera).body.trim() ? null : 'Indiquez d’abord le boîtier';
  if (kind === 'reflectors') return (item as ReflectorMaterial).presetId || (item as ReflectorMaterial).name.trim() ? null : 'Nommez d’abord la matière';
  return (item as LensSeries | Fixture).name.trim() ? null : 'Nommez-le d’abord';
}

/** Enregistre (ou met à jour) un élément du projet dans « Mon matériel ». */
export function saveToKit<K extends KitKind>(kit: Kit, kind: K, item: ItemOf<K>): { kit: Kit; updated: boolean } {
  const key = identity(kind, item);
  const list = kit[kind] as ItemOf<K>[];
  const at = list.findIndex((x) => identity(kind, x) === key);
  const copy = { ...structuredClone(item), id: at >= 0 ? list[at]!.id : newId('kit') } as ItemOf<K>;
  const next = at >= 0 ? list.map((x, i) => (i === at ? copy : x)) : [...list, copy];
  return { kit: { ...kit, [kind]: next }, updated: at >= 0 };
}

export function removeFromKit(kit: Kit, kind: KitKind, id: Id): Kit {
  return { ...kit, [kind]: (kit[kind] as { id: Id }[]).filter((x) => x.id !== id) };
}

/** L'élément est-il déjà dans le projet, à l'identique ? */
export function inProject<K extends KitKind>(doc: ProjectDoc, kind: K, item: ItemOf<K>): boolean {
  const c = content(kind, item);
  return (doc.settings[kind] as ItemOf<K>[]).some((x) => content(kind, x) === c);
}

/** Élément du projet qui porte la même identité (même boîtier et mode, même nom…), s'il y en a un. */
export function projectTwin<K extends KitKind>(doc: ProjectDoc, kind: K, item: ItemOf<K>): ItemOf<K> | null {
  const key = identity(kind, item);
  return (doc.settings[kind] as ItemOf<K>[]).find((x) => identity(kind, x) === key) ?? null;
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

/**
 * Copie un élément de « Mon matériel » dans le projet et renvoie son identifiant dans le projet.
 * Déjà présent à l'identique : rien n'est ajouté. Caméra : la première caméra encore vierge
 * (celle d'un projet neuf) est remplie plutôt que d'en ajouter une, pour que les plans la gardent.
 */
export function addFromKit<K extends KitKind>(doc: ProjectDoc, kind: K, item: ItemOf<K>): { doc: ProjectDoc; id: Id; added: boolean } {
  const c = content(kind, item);
  const same = (doc.settings[kind] as ItemOf<K>[]).find((x) => content(kind, x) === c);
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
    const label = nextCameraLabel(doc);
    return { doc: produce(doc, (d) => void d.settings.cameras.push({ ...structuredClone(cam), id, label })), id, added: true };
  }
  const id = newId({ lenses: 'lens', fixtures: 'fx', reflectors: 'rm' }[kind as Exclude<KitKind, 'cameras'>]);
  const next = produce(doc, (d) => void (d.settings[kind] as ItemOf<K>[]).push({ ...structuredClone(item), id } as ItemOf<K>));
  return { doc: next, id, added: true };
}

/** Réglages de départ d'un nouveau projet : vocabulaire et exposition de « Mon matériel », s'ils sont enregistrés. */
export function applyKitDefaults(doc: ProjectDoc, kit: Kit): ProjectDoc {
  if (!kit.terms && !kit.exposure) return doc;
  return produce(doc, (d) => {
    if (kit.terms) d.settings.terms = structuredClone(kit.terms);
    if (kit.exposure) d.settings.exposure = { ...kit.exposure };
  });
}

/** Nombre total d'éléments (pour l'affichage). */
export function kitSize(kit: Kit): number {
  return kit.cameras.length + kit.lenses.length + kit.fixtures.length + kit.reflectors.length;
}

/** Où en est cet élément du projet par rapport à « Mon matériel » ? */
export function kitStatus<K extends KitKind>(kit: Kit, kind: K, item: ItemOf<K>): 'absent' | 'same' | 'differs' {
  const key = identity(kind, item);
  const twin = (kit[kind] as ItemOf<K>[]).find((x) => identity(kind, x) === key);
  if (!twin) return 'absent';
  return content(kind, twin) === content(kind, item) ? 'same' : 'differs';
}
