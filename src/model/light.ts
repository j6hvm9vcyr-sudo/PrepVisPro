/**
 * Calculs de lumière, à partir des données des fabricants saisies dans le projet.
 *
 * Éclairement : loi de l'inverse du carré, E = E_réf × (d_réf / d)², au centre du faisceau,
 * sur une surface tournée vers la source. Valable à une distance grande devant la taille de la
 * source (projecteurs à lentille, panneaux à quelques mètres) ; pas pour une grande source
 * diffuse toute proche. Hors du faisceau, aucune valeur n'est donnée (rien n'est inventé).
 *
 * Diaph : formule du posemètre en lumière incidente, N² = E × S × t / C, avec C = 340
 * (calotte d'un posemètre incident courant) et t = (angle d'obturation / 360) / cadence.
 */
import type { Exposure, Fixture, FixtureMode, ProjectDoc } from './types';
import { bearing, metersBetween, normalizeDeg, type FloorLight, type FloorPlan, type Point } from './floor';

export const INCIDENT_C = 340;

/** Temps d'exposition (s). */
export function exposureTime(e: Exposure): number {
  return e.shutterDeg / 360 / e.fps;
}

/** Diaph (T) donné par un éclairement incident ; null si l'éclairement est nul. */
export function stopFromLux(lux: number, e: Exposure): number | null {
  if (!(lux > 0) || !(e.iso > 0) || !(e.fps > 0) || !(e.shutterDeg > 0)) return null;
  return Math.sqrt((lux * e.iso * exposureTime(e)) / INCIDENT_C);
}

/** Éclairement (lux) nécessaire pour un diaph. */
export function luxForStop(n: number, e: Exposure): number {
  return (n * n * INCIDENT_C) / (e.iso * exposureTime(e));
}

const STOPS = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32];
const THIRDS = ['', '⅓', '⅔'];

/** « T4 », « T2.8 ⅓ », « T1.4 ⅔ » : diaph entier inférieur + tiers. */
export function formatStop(n: number | null): string {
  if (n === null) return '—';
  if (n < 1) return 'sous T1';
  const ev = 2 * Math.log2(n); // T1 = 0, T1.4 = 1, T2 = 2…
  const third = Math.round(ev * 3) / 3;
  const whole = Math.floor(third + 1e-9);
  const frac = Math.round((third - whole) * 3);
  if (whole >= STOPS.length - 1) return `au-delà de T${STOPS[STOPS.length - 1]}`;
  return `T${String(STOPS[whole]).replace('.', ',')}${frac ? ` ${THIRDS[frac]}` : ''}`;
}

/** Données d'un mode complètes (éclairement, distance et faisceau renseignés) : seul cas où l'on calcule. */
export function modeData(mode: FixtureMode | undefined): { lux: number; distanceM: number; beamDeg: number } | null {
  if (!mode || mode.lux === null || mode.distanceM === null || mode.beamDeg === null) return null;
  if (!(mode.lux > 0) || !(mode.distanceM > 0) || !(mode.beamDeg > 0)) return null;
  return { lux: mode.lux, distanceM: mode.distanceM, beamDeg: mode.beamDeg };
}

export interface LightReading {
  light: FloorLight;
  fixture: Fixture;
  distanceM: number;
  /** Éclairement reçu (lux), ou null si la cible est hors du faisceau. */
  lux: number | null;
  /** Écart entre l'axe du faisceau et la cible (degrés). */
  offAxisDeg: number;
  /** La cible est au bord du faisceau (dernier tiers de l'angle) : valeur plus optimiste. */
  edge: boolean;
}

/** Éclairement d'un projecteur sur un point du plan. null si le calcul n'est pas possible (échelle, données). */
export function readingAt(doc: ProjectDoc, fp: FloorPlan, light: FloorLight, target: Point): LightReading | null {
  if (!fp.scale) return null;
  const fixture = doc.settings.fixtures.find((f) => f.id === light.fixtureId);
  const mode = modeData(fixture?.modes[light.mode]);
  if (!fixture || !mode) return null;
  const distanceM = metersBetween(fp, light.at, target)!;
  if (!(distanceM > 0)) return null;
  const off = normalizeDeg(bearing(light.at, target) - light.rotation);
  const offAxisDeg = off > 180 ? 360 - off : off;
  const half = mode.beamDeg / 2;
  if (offAxisDeg > half) return { light, fixture, distanceM, lux: null, offAxisDeg, edge: false };
  const lux = mode.lux * (mode.distanceM / distanceM) ** 2 * light.dimmer * 2 ** -light.lossStops;
  return { light, fixture, distanceM, lux, offAxisDeg, edge: offAxisDeg > (half * 2) / 3 };
}

/** Lectures de tous les projecteurs d'un plan sur un point (les plus forts d'abord). */
export function readingsAt(doc: ProjectDoc, fp: FloorPlan, target: Point): LightReading[] {
  return fp.elements
    .filter((e): e is FloorLight => e.kind === 'light')
    .map((l) => readingAt(doc, fp, l, target))
    .filter((r): r is LightReading => r !== null)
    .sort((a, b) => (b.lux ?? -1) - (a.lux ?? -1));
}

export interface PowerTotal {
  circuit: string;
  watts: number;
  /** Intensité à 230 V (A), charge résistive. */
  amps: number;
  count: number;
}

/** Puissance par circuit (et totale) des projecteurs d'un plan au sol, à pleine puissance. */
export function powerTotals(doc: ProjectDoc, fp: FloorPlan): { circuits: PowerTotal[]; total: PowerTotal; unknown: number } {
  const map = new Map<string, PowerTotal>();
  let unknown = 0;
  const total: PowerTotal = { circuit: 'Total', watts: 0, amps: 0, count: 0 };
  for (const el of fp.elements) {
    if (el.kind !== 'light') continue;
    const f = doc.settings.fixtures.find((x) => x.id === el.fixtureId);
    if (!f || f.watts === null) {
      unknown++;
      continue;
    }
    const key = el.circuit.trim() || '—';
    const t = map.get(key) ?? { circuit: key, watts: 0, amps: 0, count: 0 };
    const w = f.watts;
    t.watts += w;
    t.count++;
    map.set(key, t);
    total.watts += w;
    total.count++;
  }
  const circuits = [...map.values()].sort((a, b) => a.circuit.localeCompare(b.circuit, 'fr'));
  for (const t of [...circuits, total]) t.amps = t.watts / 230;
  return { circuits, total, unknown };
}
