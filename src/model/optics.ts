/**
 * Angle de champ horizontal, en degrés.
 *
 * Formule : 2·atan( (largeur capteur × coefficient anamorphique) / (2 × focale) ).
 *
 * Domaine de validité (à afficher à l'utilisateur) :
 * - optique rectilinéaire (pas de fisheye), mise au point à l'infini ;
 * - à courte distance de mise au point, l'angle réel est plus serré ;
 * - la largeur capteur doit être la largeur ACTIVE du mode d'enregistrement utilisé.
 *
 * Renvoie null si une donnée manque ou est invalide : on n'affiche jamais un angle douteux.
 */
export function horizontalFovDeg(sensorWidthMm: number | null, focalMm: number | null, squeeze = 1): number | null {
  if (sensorWidthMm === null || focalMm === null) return null;
  if (!Number.isFinite(sensorWidthMm) || !Number.isFinite(focalMm) || !Number.isFinite(squeeze)) return null;
  if (sensorWidthMm <= 0 || focalMm <= 0 || squeeze <= 0) return null;
  return (2 * Math.atan((sensorWidthMm * squeeze) / (2 * focalMm)) * 180) / Math.PI;
}

export function formatDeg(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(1).replace('.', ',') + '°';
}
