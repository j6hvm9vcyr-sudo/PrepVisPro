/**
 * Mise à niveau des anciens fichiers projet vers le format courant.
 * Chaque évolution du format ajoute une étape ici (et un test), sans jamais
 * modifier le fichier d'origine sur disque avant validation complète.
 */
import { SCHEMA_VERSION } from './types';

export type MigrateResult = { ok: true; raw: unknown } | { ok: false; error: string };

export function migrate(raw: unknown): MigrateResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Ce fichier n’est pas un projet PrepVisPro.' };
  const v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== 'number') return { ok: false, error: 'Ce fichier n’est pas un projet PrepVisPro (version de format absente).' };
  if (v > SCHEMA_VERSION) {
    return { ok: false, error: `Ce projet a été créé avec une version plus récente de PrepVisPro (format ${v}). Mettez l’application à jour.` };
  }
  let doc = raw as Record<string, unknown>;
  // Étapes successives, de version en version.
  if (v <= 1) doc = from1to2(doc);
  if (v <= 2) doc = from2to3(doc);
  if (v <= 3) doc = { ...doc, schemaVersion: 4, floorPlans: [] };
  if (v <= 4) doc = from4to5(doc);
  return { ok: true, raw: doc };
}

/** Format 1 → 2 : chaque séquence reçoit le texte de sa scène (vide). */
function from1to2(doc: Record<string, unknown>): Record<string, unknown> {
  const seqs = Array.isArray(doc.sequences) ? doc.sequences : [];
  return {
    ...doc,
    schemaVersion: 2,
    sequences: seqs.map((s) => (s && typeof s === 'object' ? { scriptText: '', ...(s as object) } : s)),
  };
}

/** Format 2 → 3 : chaque séquence reçoit un dépouillement image (vide). */
function from2to3(doc: Record<string, unknown>): Record<string, unknown> {
  const seqs = Array.isArray(doc.sequences) ? doc.sequences : [];
  return {
    ...doc,
    schemaVersion: 3,
    sequences: seqs.map((s) => (s && typeof s === 'object' ? { breakdown: { camera: '', grip: '', lighting: '', other: '' }, ...(s as object) } : s)),
  };
}

/** Format 4 → 5 : chaque caméra du projet reçoit une hauteur capteur (inconnue). */
function from4to5(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  if (!settings) return { ...doc, schemaVersion: 5 };
  const cams = Array.isArray(settings.cameras) ? settings.cameras : [];
  return {
    ...doc,
    schemaVersion: 5,
    settings: { ...settings, cameras: cams.map((c) => (c && typeof c === 'object' ? { sensorHeightMm: null, ...(c as object) } : c)) },
  };
}
