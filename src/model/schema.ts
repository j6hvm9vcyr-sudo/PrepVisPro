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
  gps: z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) }).nullable(),
  comments: z.string(),
  scriptText: z.string(),
  breakdown: z.object({ camera: z.string(), grip: z.string(), lighting: z.string(), other: z.string() }),
  plans: z.array(plan).min(1),
  shooting: z.object({ installations: z.array(z.object({ id, name: z.string(), planIds: z.array(id), note: z.string() })) }).nullable(),
});

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const waypoints = z.array(z.object({ at: z.object({ x: z.number().finite(), y: z.number().finite() }), rotation: z.number().finite() })).max(100);
const elemBase = { id, at: point, rotation: z.number().finite() };
const floorElement = z.discriminatedUnion('kind', [
  z.object({ ...elemBase, kind: z.literal('camera'), planId: id.nullable(), setupId: id.nullable(), showFov: z.boolean(), positions: waypoints }),
  z.object({ ...elemBase, kind: z.literal('actor'), name: z.string(), color: z.string(), positions: waypoints, icon: z.string().min(1).nullable(), size: z.number().finite().positive() }),
  z.object({ ...elemBase, kind: z.literal('icon'), icon: z.string().min(1), label: z.string(), size: z.number().finite().positive() }),
  z.object({ ...elemBase, kind: z.literal('text'), text: z.string(), size: z.number().finite().positive() }),
  z.object({
    ...elemBase,
    kind: z.literal('light'),
    fixtureId: id.nullable(),
    mode: z.number().int().min(0),
    dimmer: z.number().min(0).max(1),
    gels: z.array(z.string().min(1)).max(20),
    lossStops: z.number().min(0).max(20),
    circuit: z.string(),
    positions: waypoints,
    label: z.string(),
    icon: z.string().min(1).nullable(),
    size: z.number().finite().positive(),
  }),
  z.object({
    ...elemBase,
    kind: z.literal('reflector'),
    materialId: id.nullable(),
    widthM: z.number().finite().positive().max(100),
    heightM: z.number().finite().positive().max(100),
    label: z.string(),
    icon: z.string().min(1).nullable(),
    size: z.number().finite().positive(),
  }),
]);
const floorPlan = z.object({
  id,
  name: z.string(),
  sequenceIds: z.array(id),
  background: z
    .object({ file: z.string().min(1), width: z.number().positive(), height: z.number().positive(), opacity: z.number().min(0).max(1), originalName: z.string() })
    .nullable(),
  scale: z.object({ metersPerUnit: z.number().finite().positive(), a: point, b: point, meters: z.number().finite().positive() }).nullable(),
  elements: z.array(floorElement),
  fovLengthM: z.number().finite().positive(),
  northDeg: z.number().finite().min(0).max(360).nullable(),
  sunAt: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).nullable(),
});

const terms = z.object({
  size: z.array(z.string()),
  axis: z.array(z.string()),
  angle: z.array(z.string()),
  movement: z.array(z.string()),
  grip: z.array(z.string()),
});

const lensSeries = z.object({
  id,
  name: z.string(),
  kind: z.enum(['primes', 'zoom']),
  focals: z.array(z.number().finite().positive().max(2000)),
  min: z.number().finite().positive().max(2000).nullable(),
  max: z.number().finite().positive().max(2000).nullable(),
});

const projectCamera = z.object({
  id,
  label: z.string().min(1),
  body: z.string(),
  mode: z.string(),
  sensorWidthMm: z.number().finite().positive().nullable(),
  sensorHeightMm: z.number().finite().positive().nullable(),
  squeeze: z.number().finite().positive(),
});

const projectSchema = z.object({
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
    lenses: z.array(lensSeries),
    fixtures: z.array(
      z.object({
        id,
        name: z.string(),
        watts: z.number().finite().min(0).max(100000).nullable(),
        kind: z.enum(['led', 'tungsten', 'hmi', 'other']),
        modes: z.array(z.object({ label: z.string(), lux: z.number().finite().positive().nullable(), distanceM: z.number().finite().positive().nullable(), beamDeg: z.number().finite().positive().max(180).nullable() })),
      }),
    ),
    exposure: z.object({ iso: z.number().finite().positive(), fps: z.number().finite().positive(), shutterDeg: z.number().finite().positive().max(360) }),
    reflectors: z.array(z.object({ id, name: z.string(), type: z.enum(['diffuse', 'mirror']), reflectance: z.number().finite().positive().max(1).nullable(), presetId: z.string().min(1).nullable() })),
    timeZone: z.string().min(1).nullable(),
  }),
  sequences: z.array(sequence),
  stamps: z.array(z.object({ id, text: z.string(), note: z.string(), beforeSequenceId: id.nullable() })),
  library: z.array(z.object({ id, file: z.string().min(1), originalName: z.string(), caption: z.string(), hash: z.string().regex(/^[0-9a-f]{64}$/).nullable() })),
  floorPlans: z.array(floorPlan),
  shootingDays: z.array(z.object({ id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), sequenceIds: z.array(id), note: z.string() })),
});

export type LoadResult = { ok: true; doc: ProjectDoc } | { ok: false; error: string };

/** Vérifie aussi la cohérence interne (identifiants uniques, références valides). */
export function validateProject(raw: unknown): LoadResult {
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw) {
    const v = (raw as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && v > SCHEMA_VERSION) {
      return { ok: false, error: `Ce projet a été créé avec une version plus récente de PrepVisPro (format ${v}). Mettez l’application à jour.` };
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

function checkIntegrity(doc: ProjectDoc): string | null {
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
  for (const fp of doc.floorPlans) {
    if (dup(fp.id)) return `identifiant de plan au sol en double (${fp.id}).`;
    for (const e of fp.elements) if (dup(e.id)) return `élément de plan au sol en double (${e.id}).`;
  }
  const seqIds = new Set(doc.sequences.map((x) => x.id));
  const libFiles = new Set<string>();
  for (const l of doc.library) {
    if (dup(l.id)) return `identifiant d’image de bibliothèque en double (${l.id}).`;
    if (libFiles.has(l.file)) return `image en double dans la bibliothèque (${l.file}).`;
    libFiles.add(l.file);
  }
  for (const t of doc.stamps) {
    if (dup(t.id)) return `identifiant de tampon en double (${t.id}).`;
    if (t.beforeSequenceId && !seqIds.has(t.beforeSequenceId)) return `un tampon renvoie à une séquence absente (${t.id}).`;
  }
  for (const d of doc.shootingDays) {
    if (dup(d.id)) return `identifiant de jour de tournage en double (${d.id}).`;
    if (new Set(d.sequenceIds).size !== d.sequenceIds.length) return `séquence en double dans un jour de tournage (${d.id}).`;
    if (d.sequenceIds.some((x) => !seqIds.has(x))) return `un jour de tournage renvoie à une séquence absente (${d.id}).`;
  }
  return null;
}
