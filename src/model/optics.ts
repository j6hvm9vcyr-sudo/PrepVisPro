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

/** Ratio d'image du projet (« 1,85:1 », « 2.39 », « 16/9 », « 4:3 ») ; null si absent ou illisible. */
export function parseAspectRatio(text: string): number | null {
  const t = text.trim().replace(/,/g, '.').replace(/\s+/g, '');
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)(?:[:/x](\d+(?:\.\d+)?))?$/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] !== undefined ? Number(m[2]) : 1;
  const r = a / b;
  return Number.isFinite(r) && r >= 0.5 && r <= 4 ? r : null;
}

export interface FrameGeometry {
  /** Largeur et hauteur de l'image cadrée, en mm « désanamorphosés » (largeur × coefficient). */
  widthMm: number;
  heightMm: number | null;
  /** Le cadre au ratio du projet rogne-t-il la largeur du capteur ? */
  croppedWidth: boolean;
}

/**
 * Zone réellement cadrée sur le capteur.
 * - Sans ratio de projet, ou sans hauteur capteur : toute la largeur active.
 * - Avec ratio et hauteur : le plus grand cadre au ratio qui tient dans le capteur (centré).
 */
export function frameGeometry(sensorWidthMm: number | null, sensorHeightMm: number | null, squeeze: number, ratio: number | null): FrameGeometry | null {
  if (sensorWidthMm === null || !(sensorWidthMm > 0) || !(squeeze > 0)) return null;
  const w = sensorWidthMm * squeeze;
  const h = sensorHeightMm !== null && sensorHeightMm > 0 ? sensorHeightMm : null;
  if (ratio === null) return { widthMm: w, heightMm: h, croppedWidth: false };
  if (h === null) return { widthMm: w, heightMm: w / ratio, croppedWidth: false };
  if (w / h > ratio) return { widthMm: h * ratio, heightMm: h, croppedWidth: true };
  return { widthMm: w, heightMm: w / ratio, croppedWidth: false };
}

/** Angle (degrés) couvert par une dimension d'image `sizeMm` avec une focale `focalMm` (mise au point à l'infini). */
export function angleDeg(sizeMm: number | null, focalMm: number | null): number | null {
  if (sizeMm === null || focalMm === null || !(sizeMm > 0) || !(focalMm > 0)) return null;
  return (2 * Math.atan(sizeMm / (2 * focalMm)) * 180) / Math.PI;
}

export interface FieldOfView {
  horizontal: number | null;
  vertical: number | null;
  diagonal: number | null;
  frame: FrameGeometry | null;
}

/** Angles de champ de l'image cadrée (horizontal, vertical, diagonal). */
export function fieldOfView(cam: { sensorWidthMm: number | null; sensorHeightMm: number | null; squeeze: number } | undefined, focalMm: number | null, ratio: number | null): FieldOfView {
  const frame = cam ? frameGeometry(cam.sensorWidthMm, cam.sensorHeightMm, cam.squeeze, ratio) : null;
  if (!frame) return { horizontal: null, vertical: null, diagonal: null, frame: null };
  const d = frame.heightMm !== null ? Math.hypot(frame.widthMm, frame.heightMm) : null;
  return { horizontal: angleDeg(frame.widthMm, focalMm), vertical: angleDeg(frame.heightMm, focalMm), diagonal: angleDeg(d, focalMm), frame };
}
