/**
 * Validation du fichier projet à l'ouverture.
 *
 * Un fichier invalide n'est JAMAIS ouvert partiellement : on refuse avec un message
 * précis, et le fichier d'origine n'est pas touché.
 */
import { z } from 'zod';
import type { ProjectDoc } from './types';
import { SCHEMA_VERSION } from './types';

const id = z.string().min(1);
const nullableNum = z.number().finite().nullable();

const framing = z.object({
  size: z.string(),
  axis: z.string(),
  angle: z.string(),
  tiltDeg: nullableNum,
  focalMm: z.number().finite().positive().nullable(),
});

const cameraSetup = z.object({
  id,
  cameraId: id,
  start: framing,
  end: framing.nullable(),
  movements: z.array(z.string()),
  grip: z.array(z.string()),
});

const image = z.object({
  id,
  kind: z.enum(['reference', 'scouting']),
  file: z.string().min(1),
  originalName: z.string(),
  caption: z.string(),
});

const plan = z.object({
  id,
  repriseOf: id.nullable(),
  action: z.string(),
  scriptExcerpt: z.string(),
  notes: z.string(),
  cameras: z.array(cameraSetup).min(1),
  images: z.array(image),
  coverImageId: id.nullable(),
});

const sequence = z.object({
  id,
  number: z.string(),
  intExt: z.enum(['INT', 'EXT', 'INT/EXT']),
  dayNight: z.enum(['JOUR', 'NUIT']),
  location: z.string(),
  address: z.string(),
  comments: z.string(),
  plans: z.array(plan).min(1),
});

const terms = z.object({
  size: z.array(z.string()),
  axis: z.array(z.string()),
  angle: z.array(z.string()),
  movement: z.array(z.string()),
  grip: z.array(z.string()),
});

const projectCamera = z.object({
  id,
  label: z.string().min(1),
  body: z.string(),
  mode: z.string(),
  sensorWidthMm: z.number().finite().positive().nullable(),
  squeeze: z.number().finite().positive(),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  meta: z.object({
    title: z.string(),
    director: z.string(),
    production: z.string(),
    aspectRatio: z.string(),
    crew: z.array(z.object({ id, role: z.string(), name: z.string() })),
  }),
  settings: z.object({
    terms,
    required: z.object({
      action: z.boolean(),
      size: z.boolean(),
      axis: z.boolean(),
      angle: z.boolean(),
      focal: z.boolean(),
      movement: z.boolean(),
      grip: z.boolean(),
    }),
    cameras: z.array(projectCamera).min(1),
  }),
  sequences: z.array(sequence),
});

export type LoadResult = { ok: true; doc: ProjectDoc } | { ok: false; error: string };

/** Vérifie aussi la cohérence interne (identifiants uniques, références valides). */
export function validateProject(raw: unknown): LoadResult {
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw) {
    const v = (raw as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && v > SCHEMA_VERSION) {
      return { ok: false, error: `Ce projet a été créé avec une version plus récente de PrepVisPro (format ${v}). Mettez l'application à jour.` };
    }
  }
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join(' › ') : '';
    return { ok: false, error: `Fichier projet invalide${where ? ` (${where})` : ''} : ${first?.message ?? 'format inconnu'}.` };
  }
  const doc = parsed.data as ProjectDoc;
  const problem = checkIntegrity(doc);
  if (problem) return { ok: false, error: `Fichier projet incohérent : ${problem}` };
  return { ok: true, doc };
}

export function checkIntegrity(doc: ProjectDoc): string | null {
  const ids = new Set<string>();
  const dup = (x: string) => {
    if (ids.has(x)) return true;
    ids.add(x);
    return false;
  };
  const camIds = new Set(doc.settings.cameras.map((c) => c.id));
  for (const c of doc.settings.cameras) if (dup(c.id)) return `identifiant de caméra en double (${c.id}).`;
  for (const s of doc.sequences) {
    if (dup(s.id)) return `identifiant de séquence en double (${s.id}).`;
    const planIds = new Set(s.plans.map((p) => p.id));
    for (const p of s.plans) {
      if (dup(p.id)) return `identifiant de plan en double (${p.id}).`;
      if (p.repriseOf && !planIds.has(p.repriseOf)) return `la reprise ${p.id} renvoie à un plan absent de sa séquence.`;
      const imgIds = new Set<string>();
      for (const i of p.images) {
        if (imgIds.has(i.id)) return `image en double dans le plan ${p.id}.`;
        imgIds.add(i.id);
      }
      if (p.coverImageId && !imgIds.has(p.coverImageId)) return `image principale introuvable dans le plan ${p.id}.`;
      for (const c of p.cameras) {
        if (!camIds.has(c.cameraId)) return `le plan ${p.id} utilise une caméra inconnue.`;
      }
    }
  }
  return null;
}
