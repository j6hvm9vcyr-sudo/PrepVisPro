/**
 * Soleil sur un plan au sol : lieu (position GPS des décors du plan), heure simulée (fuseau du
 * projet), direction sur le plan (nord du plan) et rapport avec l'axe de chaque caméra.
 */
import type { ProjectDoc } from './types';
import type { FloorPlan } from './floor';
import { normalizeDeg } from './floor';
import { isTimeZone, localToUtc, sunDay, sunPosition, systemTimeZone, type GeoPoint, type SunDay, type SunPosition } from './sun';

/** Fuseau du projet ; celui de l'ordinateur s'il n'est pas choisi (ou inconnu de ce système). */
export function projectTimeZone(doc: ProjectDoc): string {
  const tz = doc.settings.timeZone;
  return tz && isTimeZone(tz) ? tz : systemTimeZone();
}

export type PlanLocation = { ok: true; point: GeoPoint } | { ok: false; reason: 'none' | 'mixed' };

/** Position du décor du plan : celle de ses séquences. Plusieurs positions différentes : refusé. */
export function planLocation(doc: ProjectDoc, fp: FloorPlan): PlanLocation {
  const pts = doc.sequences.filter((s) => fp.sequenceIds.includes(s.id) && s.gps).map((s) => s.gps!);
  if (!pts.length) return { ok: false, reason: 'none' };
  // À 10 m près (4 décimales), c'est le même décor.
  const key = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
  if (new Set(pts.map(key)).size > 1) return { ok: false, reason: 'mixed' };
  return { ok: true, point: pts[0]! };
}

export type PlanSun =
  | { ok: true; at: number; tz: string; point: GeoPoint; pos: SunPosition; day: SunDay | null; /** Direction du soleil sur le plan (null sans nord). */ planBearing: number | null }
  | { ok: false; reason: 'none' | 'mixed' | 'no-time' | 'bad-time' };

/** `withDay` : calcule aussi les événements de la journée (inutile pour le dessin du plan). */
export function planSun(doc: ProjectDoc, fp: FloorPlan, withDay = true): PlanSun {
  const loc = planLocation(doc, fp);
  if (!loc.ok) return { ok: false, reason: loc.reason };
  if (!fp.sunAt) return { ok: false, reason: 'no-time' };
  const tz = projectTimeZone(doc);
  const at = localToUtc(fp.sunAt.date, fp.sunAt.time, tz);
  if (at === null) return { ok: false, reason: 'bad-time' };
  const pos = sunPosition(at, loc.point);
  return { ok: true, at, tz, point: loc.point, pos, day: withDay ? sunDay(fp.sunAt.date, tz, loc.point) : null, planBearing: fp.northDeg === null ? null : normalizeDeg(fp.northDeg + pos.azimuth) };
}

/** Longueur de l'ombre portée d'une hauteur `h` (m) sur un sol plat ; null si le soleil est couché. */
export function shadowLength(h: number, elevation: number): number | null {
  return elevation > 0.5 ? h / Math.tan((elevation * Math.PI) / 180) : null;
}

/**
 * Soleil par rapport à l'axe d'une caméra (direction où elle regarde, sur le plan).
 * Contre-jour : soleil devant la caméra ; face : soleil dans son dos.
 */
export function sunForCamera(cameraRotation: number, sunBearing: number, elevation: number): string | null {
  if (elevation <= 0) return null;
  const d = normalizeDeg(sunBearing - cameraRotation);
  const off = d > 180 ? 360 - d : d;
  const side = d > 180 ? 'gauche' : 'droite';
  const high = elevation >= 60 ? ' (soleil haut)' : '';
  if (off <= 30) return `contre-jour${high}`;
  if (off <= 70) return `trois-quarts contre, à ${side}${high}`;
  if (off <= 110) return `latéral, à ${side}${high}`;
  if (off <= 150) return `trois-quarts face, à ${side}${high}`;
  return `de face (soleil dans le dos de la caméra)${high}`;
}
