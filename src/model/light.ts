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
import type { Exposure, Fixture, FixtureMode, ProjectDoc, ReflectorMaterial } from './types';
import { bearing, metersBetween, normalizeDeg, project, type FloorLight, type FloorPlan, type FloorReflector, type Point } from './floor';
import { gelStack, type GelStack } from './gels';

const INCIDENT_C = 340;

/** Temps d'exposition (s). */
function exposureTime(e: Exposure): number {
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
  /** Gélatines et diffusions posées. */
  gels: GelStack;
  /**
   * Pourquoi il n'y a pas de valeur : hors du faisceau, ou hors du faisceau d'origine alors
   * qu'une diffusion l'a élargi (la lumière y arrive, mais on ne sait pas combien).
   */
  why: 'beam' | 'diffusion' | null;
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
  const gels = gelStack(light.gels, fixture.kind === 'tungsten');
  if (offAxisDeg > half) return { light, fixture, distanceM, lux: null, offAxisDeg, edge: false, gels, why: gels.diffused ? 'diffusion' : 'beam' };
  const lux = mode.lux * (mode.distanceM / distanceM) ** 2 * light.dimmer * 2 ** -light.lossStops * gels.transmission;
  return { light, fixture, distanceM, lux, offAxisDeg, edge: offAxisDeg > (half * 2) / 3, gels, why: null };
}

// ------------------------------------------------------------------ réflecteurs

/**
 * Lumière renvoyée par un réflecteur sur un point.
 *
 * Diffus (toile, poly) : surface lambertienne. Éclairement reçu au centre E_r = E × cos(i) ;
 * luminance L = ρ·E_r/π ; vu de la cible, la partie éclairée est assimilée à un disque de même
 * aire, ce qui donne E = ρ·E_r·r²/(r² + D²)·cos(o) (formule exacte dans l'axe d'un disque
 * uniforme). Aire éclairée = la plus petite de la toile et de la tache du faisceau. On suppose
 * la tache uniforme à la valeur du centre : chiffre plutôt haut si le faisceau est inégal.
 *
 * Miroir : réflexion spéculaire exacte en plan (source image). E = ρ × éclairement du
 * projecteur à la distance parcourue (projecteur → miroir → cible), si le rayon frappe le
 * miroir dans le faisceau.
 *
 * Ni hauteur ni inclinaison : le réflecteur est supposé vertical, à hauteur de la cible.
 */
export interface BounceReading {
  light: FloorLight;
  fixture: Fixture;
  reflector: FloorReflector;
  material: ReflectorMaterial | null;
  /** Distance réflecteur → cible (m). */
  distanceM: number;
  /** Éclairement reçu au centre du réflecteur, perpendiculairement à sa surface (lux). */
  onReflector: number | null;
  lux: number | null;
  why: 'material' | 'not-lit' | 'back' | 'behind' | 'miss' | null;
  edge: boolean;
  gels: GelStack;
}

const dir = (deg: number): Point => project({ x: 0, y: 0 }, deg, 1);
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

export function bounceAt(doc: ProjectDoc, fp: FloorPlan, light: FloorLight, refl: FloorReflector, target: Point): BounceReading | null {
  if (!fp.scale) return null;
  const u = fp.scale.metersPerUnit;
  const material = doc.settings.reflectors.find((m) => m.id === refl.materialId) ?? null;
  const n = dir(refl.rotation);
  const distanceM = metersBetween(fp, refl.at, target)!;
  const atBoard = readingAt(doc, fp, light, refl.at);
  if (!atBoard) return null;
  const base = { light, fixture: atBoard.fixture, reflector: refl, material, distanceM, gels: atBoard.gels };
  const toLight = sub(light.at, refl.at);
  const toTarget = sub(target, refl.at);
  const lenL = Math.hypot(toLight.x, toLight.y);
  const lenT = Math.hypot(toTarget.x, toTarget.y);
  const cosI = lenL > 0 ? dot(toLight, n) / lenL : 0;
  const cosO = lenT > 0 ? dot(toTarget, n) / lenT : 0;
  const onReflector = atBoard.lux !== null && cosI > 0 ? atBoard.lux * cosI : null;
  if (cosI <= 0) return { ...base, onReflector: null, lux: null, why: 'back', edge: false };
  if (cosO <= 0 || !(distanceM > 0)) return { ...base, onReflector, lux: null, why: 'behind', edge: false };
  const rho = material?.reflectance ?? null;

  if (material?.type === 'mirror') {
    // Source image du projecteur derrière le miroir.
    const h = dot(toLight, n);
    const virt = { x: light.at.x - 2 * h * n.x, y: light.at.y - 2 * h * n.y };
    const ray = sub(target, virt);
    const den = dot(ray, n);
    if (den <= 0) return { ...base, onReflector, lux: null, why: 'miss', edge: false };
    const t = dot(sub(refl.at, virt), n) / den;
    const hit = { x: virt.x + t * ray.x, y: virt.y + t * ray.y };
    const along = Math.abs(dot(sub(hit, refl.at), dir(refl.rotation + 90))) * u;
    if (t <= 0 || t >= 1 || along > refl.widthM / 2) return { ...base, onReflector, lux: null, why: 'miss', edge: false };
    const atHit = readingAt(doc, fp, light, hit);
    if (!atHit || atHit.lux === null) return { ...base, onReflector, lux: null, why: 'not-lit', edge: false };
    if (rho === null) return { ...base, onReflector, lux: null, why: 'material', edge: atHit.edge };
    const path = atHit.distanceM + metersBetween(fp, hit, target)!;
    return { ...base, onReflector, lux: rho * atHit.lux * (atHit.distanceM / path) ** 2, why: null, edge: atHit.edge };
  }

  if (onReflector === null) return { ...base, onReflector: null, lux: null, why: 'not-lit', edge: false };
  if (rho === null) return { ...base, onReflector, lux: null, why: 'material', edge: atBoard.edge };
  const mode = modeData(atBoard.fixture.modes[light.mode])!;
  const spot = atBoard.distanceM * Math.tan(((mode.beamDeg / 2) * Math.PI) / 180);
  const area = Math.min(refl.widthM * refl.heightM, (Math.PI * spot * spot) / cosI);
  const r2 = area / Math.PI;
  return { ...base, onReflector, lux: rho * onReflector * (r2 / (r2 + distanceM * distanceM)) * cosO, why: null, edge: atBoard.edge };
}

/** Toute la lumière reçue en un point : directe et renvoyée (les plus fortes d'abord). */
export interface Contribution {
  key: string;
  /** « Fresnel 2K », ou « Toile 12×12 ← Fresnel 2K ». */
  label: string;
  distanceM: number;
  lux: number | null;
  note: string | null;
  edge: boolean;
  /** Valeur indicative (diffusion, réflecteur diffus) plutôt que calcul exact. */
  approx: boolean;
  gels: GelStack;
}

export function lightName(doc: ProjectDoc, l: FloorLight): string {
  return l.label || doc.settings.fixtures.find((f) => f.id === l.fixtureId)?.name || 'Projecteur';
}

export function reflectorName(doc: ProjectDoc, r: FloorReflector): string {
  const m = doc.settings.reflectors.find((x) => x.id === r.materialId);
  return r.label || m?.name || 'Réflecteur';
}

const BOUNCE_NOTE: Record<NonNullable<BounceReading['why']>, string | null> = {
  material: 'taux de réflexion à mesurer',
  'not-lit': null,
  back: null,
  behind: null,
  miss: null,
};

export function contributionsAt(doc: ProjectDoc, fp: FloorPlan, target: Point): Contribution[] {
  const lights = fp.elements.filter((e): e is FloorLight => e.kind === 'light');
  const refls = fp.elements.filter((e): e is FloorReflector => e.kind === 'reflector');
  const out: Contribution[] = [];
  for (const l of lights) {
    const r = readingAt(doc, fp, l, target);
    if (!r) continue;
    out.push({
      key: l.id,
      label: lightName(doc, l),
      distanceM: r.distanceM,
      lux: r.lux,
      note: r.why === 'beam' ? 'hors faisceau' : r.why === 'diffusion' ? 'hors faisceau d’origine (diffusion) : non calculé' : null,
      edge: r.edge,
      approx: r.gels.diffused,
      gels: r.gels,
    });
    for (const rf of refls) {
      const b = bounceAt(doc, fp, l, rf, target);
      if (!b) continue;
      const note = b.why ? BOUNCE_NOTE[b.why] : null;
      if (b.lux === null && !note) continue;
      out.push({ key: `${l.id}>${rf.id}`, label: `${reflectorName(doc, rf)} ← ${lightName(doc, l)}`, distanceM: b.distanceM, lux: b.lux, note, edge: b.edge, approx: b.material?.type !== 'mirror' || b.gels.diffused, gels: b.gels });
    }
  }
  return out.sort((a, b) => (b.lux ?? -1) - (a.lux ?? -1));
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
