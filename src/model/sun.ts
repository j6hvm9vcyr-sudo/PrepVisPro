/**
 * Position du soleil (algorithme de la NOAA, d'après J. Meeus, « Astronomical Algorithms »).
 * Vérifié contre l'algorithme de référence NREL SPA (pvlib) : écart < 0,05° sur la position,
 * < 1 min sur le lever et le coucher, de −45° à +60° de latitude, de 2020 à 2035 (voir sun.test.ts).
 *
 * Conventions : azimut en degrés depuis le nord, sens horaire (90 = est) ; hauteur au-dessus de
 * l'horizon, réfraction atmosphérique moyenne comprise (ce que l'on voit). Horizon dégagé :
 * relief et bâtiments ne sont pas pris en compte.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface SunPosition {
  /** Azimut (degrés depuis le nord, sens horaire). */
  azimuth: number;
  /** Hauteur apparente (degrés, réfraction comprise). */
  elevation: number;
  /** Hauteur géométrique (sans réfraction), pour les seuils de lever et de crépuscule. */
  trueElevation: number;
}

function julianDay(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

/** Réfraction atmosphérique moyenne (degrés) pour une hauteur géométrique, formule de la NOAA. */
function refraction(h: number): number {
  if (h > 85) return 0;
  const te = Math.tan(h * RAD);
  let r: number;
  if (h > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (h > -0.575) r = 1735 + h * (-518.2 + h * (103.4 + h * (-12.79 + h * 0.711)));
  else r = -20.774 / te;
  return r / 3600;
}

/** Position du soleil à un instant (UTC, en millisecondes) et en un lieu. */
export function sunPosition(utcMs: number, p: GeoPoint): SunPosition {
  const jc = (julianDay(utcMs) - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  // Équation du temps (minutes).
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const minutesUtc = (((utcMs % 86400000) + 86400000) % 86400000) / 60000;
  const tst = (((minutesUtc + eqTime + 4 * p.lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const latR = p.lat * RAD;
  const declR = decl * RAD;
  const cosZ = Math.min(1, Math.max(-1, Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(ha * RAD)));
  const zenith = Math.acos(cosZ) * DEG;
  const trueElevation = 90 - zenith;
  // Azimut depuis le nord, sens horaire.
  const az = Math.atan2(Math.sin(ha * RAD), Math.cos(ha * RAD) * Math.sin(latR) - Math.tan(declR) * Math.cos(latR)) * DEG + 180;
  return { azimuth: ((az % 360) + 360) % 360, elevation: trueElevation + refraction(trueElevation), trueElevation };
}

// ------------------------------------------------------------------ fuseaux horaires

/** Décalage (minutes) du fuseau `tz` par rapport à UTC à un instant donné. */
function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Le fuseau existe-t-il (nom IANA, ex. « Europe/Paris ») ? */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Heure légale (date « AAAA-MM-JJ », heure « HH:MM ») d'un fuseau → instant UTC.
 * null si l'heure n'existe pas ce jour-là (passage à l'heure d'été).
 */
export function localToUtc(date: string, time: string, tz: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const naive = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  if (Number.isNaN(naive)) return null;
  // Deux passes : le décalage peut changer entre l'heure « naïve » et l'heure réelle.
  let utc = naive - offsetMinutes(naive, tz) * 60000;
  utc = naive - offsetMinutes(utc, tz) * 60000;
  return utcToLocal(utc, tz).time === `${tm[1]!.padStart(2, '0')}:${tm[2]}` && utcToLocal(utc, tz).date === date ? utc : null;
}

/** Instant UTC → date et heure légales du fuseau. */
export function utcToLocal(utcMs: number, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((x) => x.type === t)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}` };
}

// ------------------------------------------------------------------ journée du soleil

/** Seuils de hauteur (degrés). Lever et coucher : bord supérieur du disque, réfraction standard. */
export const SUNRISE_ELEV = -0.833;
export const CIVIL_ELEV = -6;
/** Heure dorée et heure bleue : convention usuelle des photographes (PhotoPills), hauteur apparente. */
export const GOLDEN_HIGH = 6;
export const GOLDEN_LOW = -4;

export interface SunDay {
  /** Instants UTC (ms) ; null si le soleil ne franchit pas le seuil ce jour-là. */
  sunrise: number | null;
  sunset: number | null;
  noon: number;
  noonElevation: number;
  dawn: number | null;
  dusk: number | null;
  /** Heure dorée du matin (début, fin) et du soir. */
  goldenMorning: [number | null, number | null];
  goldenEvening: [number | null, number | null];
  /** Toute la journée au-dessus / au-dessous de l'horizon. */
  polar: 'day' | 'night' | null;
}

/** Recherche par dichotomie de l'instant où f change de signe entre a et b. */
function cross(f: (t: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let i = 0; i < 40 && b - a > 500; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fa < 0 === fm < 0) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

/** Événements de la journée légale `date` dans le fuseau `tz`, au lieu `p`. */
export function sunDay(date: string, tz: string, p: GeoPoint): SunDay | null {
  const start = localToUtc(date, '00:00', tz) ?? localToUtc(date, '01:00', tz);
  if (start === null) return null;
  const nextDay = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const end = localToUtc(nextDay, '00:00', tz) ?? localToUtc(nextDay, '01:00', tz) ?? start + 86400000;
  const step = 10 * 60000;
  const ups: Record<string, number | null> = {};
  const downs: Record<string, number | null> = {};
  const levels: [string, number, boolean][] = [
    ['rise', SUNRISE_ELEV, false],
    ['civil', CIVIL_ELEV, false],
    ['gHigh', GOLDEN_HIGH, true],
    ['gLow', GOLDEN_LOW, true],
  ];
  let noon = start;
  let noonElevation = -90;
  let prev = start;
  let prevPos = sunPosition(start, p);
  for (let t = start + step; t <= end; t += step) {
    const pos = sunPosition(t, p);
    if (pos.trueElevation > noonElevation) {
      noonElevation = pos.trueElevation;
      noon = t;
    }
    for (const [k, lvl, apparent] of levels) {
      const a = (apparent ? prevPos.elevation : prevPos.trueElevation) - lvl;
      const b = (apparent ? pos.elevation : pos.trueElevation) - lvl;
      const f = (x: number) => (apparent ? sunPosition(x, p).elevation : sunPosition(x, p).trueElevation) - lvl;
      if (a < 0 && b >= 0 && ups[k] === undefined) ups[k] = cross(f, prev, t);
      if (a >= 0 && b < 0 && downs[k] === undefined) downs[k] = cross(f, prev, t);
    }
    prev = t;
    prevPos = pos;
  }
  // Midi solaire affiné (maximum de hauteur) à la seconde près.
  let lo = noon - step;
  let hi = noon + step;
  for (let i = 0; i < 40 && hi - lo > 500; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (sunPosition(m1, p).trueElevation < sunPosition(m2, p).trueElevation) lo = m1;
    else hi = m2;
  }
  noon = (lo + hi) / 2;
  const top = sunPosition(noon, p);
  const sunrise = ups.rise ?? null;
  const sunset = downs.rise ?? null;
  const allDay = sunrise === null && sunset === null;
  return {
    sunrise,
    sunset,
    noon,
    noonElevation: top.elevation,
    dawn: ups.civil ?? null,
    dusk: downs.civil ?? null,
    goldenMorning: [ups.gLow ?? null, ups.gHigh ?? null],
    goldenEvening: [downs.gHigh ?? null, downs.gLow ?? null],
    polar: allDay ? (top.trueElevation > SUNRISE_ELEV ? 'day' : 'night') : null,
  };
}

// ------------------------------------------------------------------ saisie des coordonnées

/**
 * Coordonnées collées depuis Plans, Google Maps ou un GPS :
 * « 48.8584, 2.2945 », « 48,8584 2,2945 », « 48°51'30.2"N 2°17'40.2"E ».
 * null si le texte n'est pas une position sûre (jamais deviné).
 */
export function parseCoordinates(text: string): GeoPoint | null {
  const t = text.trim().replace(/[′’']/g, "'").replace(/[″”"]/g, '"');
  if (!t) return null;
  const dms = /^(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:[.,]\d+)?)"?\s*([NS])[\s,;]+(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:[.,]\d+)?)"?\s*([EOW])$/i.exec(t);
  if (dms) {
    const n = (s: string) => Number(s.replace(',', '.'));
    const lat = (n(dms[1]!) + n(dms[2]!) / 60 + n(dms[3]!) / 3600) * (dms[4]!.toUpperCase() === 'S' ? -1 : 1);
    const lon = (n(dms[5]!) + n(dms[6]!) / 60 + n(dms[7]!) / 3600) * (dms[8]!.toUpperCase() === 'E' ? 1 : -1);
    return valid(lat, lon);
  }
  // Décimal : virgule décimale possible (« 48,8584 2,2945 ») si un espace sépare les deux nombres.
  const dec = /^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/.exec(t);
  if (dec) {
    const sep = t.slice(dec[1]!.length, t.length - dec[2]!.length);
    // « 48,85,2,29 » est ambigu : refusé.
    if (dec[1]!.includes(',') && !/\s/.test(sep)) return null;
    return valid(Number(dec[1]!.replace(',', '.')), Number(dec[2]!.replace(',', '.')));
  }
  return null;
}

function valid(lat: number, lon: number): GeoPoint | null {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function formatCoordinates(p: GeoPoint): string {
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

/** Nom du point cardinal (16 directions) d'un azimut. */
export function compassName(az: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return names[Math.round((((az % 360) + 360) % 360) / 22.5) % 16]!;
}
