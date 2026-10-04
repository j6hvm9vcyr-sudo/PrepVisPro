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
  // Format 1 : courant. Les prochaines étapes s'ajouteront ici : if (v === 1) raw = from1to2(raw) …
  return { ok: true, raw };
}
