/**
 * Ce que le plan au sol permet de déduire pour le découpage : la valeur de plan (d'après la
 * distance au personnage et l'angle de champ vertical) et l'axe (d'après l'orientation du
 * personnage par rapport à la caméra). Ce sont des suggestions, jamais appliquées sans l'utilisateur.
 */
import type { ProjectDoc } from './types';
import { bearing, metersBetween, normalizeDeg, type FloorActor, type FloorCamera, type FloorPlan, type Point } from './floor';
import { locatePlan } from './ops';
import { fieldOfView, parseAspectRatio } from './optics';
import { norm } from './text';

/**
 * Hauteur de cadre (m) à laquelle chaque valeur cède la place à la suivante, pour un personnage
 * debout cadré en hauteur. Repères usuels : GP = visage, Poitrine, Taille, Américain = mi-cuisse,
 * Italien = sous le genou, Moyen = en pied.
 */
export const SIZE_SCALE: { term: string; maxM: number }[] = [
  { term: 'TGP', maxM: 0.25 },
  { term: 'GP', maxM: 0.45 },
  { term: 'Poitrine', maxM: 0.75 },
  { term: 'Taille', maxM: 1.05 },
  { term: 'Américain', maxM: 1.35 },
  { term: 'Italien', maxM: 1.65 },
  { term: 'Moyen', maxM: 2.6 },
  { term: 'Demi-ensemble', maxM: 6 },
  { term: 'Ensemble', maxM: 15 },
  { term: 'Général', maxM: Infinity },
];

/** Hauteur de champ visée pour une valeur (milieu géométrique de sa plage), en mètres ; null si terme inconnu. */
function targetHeightFor(term: string): number | null {
  const i = SIZE_SCALE.findIndex((x) => norm(x.term) === norm(term));
  if (i < 0) return null;
  const lo = i === 0 ? 0.12 : SIZE_SCALE[i - 1]!.maxM;
  const hi = Number.isFinite(SIZE_SCALE[i]!.maxM) ? SIZE_SCALE[i]!.maxM : lo * 2.5;
  return Math.sqrt(lo * hi);
}

/** Focale qui donne la valeur voulue à cette distance : f = distance × hauteur d'image ÷ hauteur de champ. */
export function idealFocalFor(term: string, distanceM: number, frameHeightMm: number): number | null {
  const h = targetHeightFor(term);
  if (h === null || !(distanceM > 0) || !(frameHeightMm > 0)) return null;
  return (distanceM * frameHeightMm) / h;
}

export function sizeForFrameHeight(heightM: number, terms: readonly string[]): string | null {
  const s = SIZE_SCALE.find((x) => heightM <= x.maxM);
  if (!s) return null;
  // Le terme doit exister dans la liste du projet (même écriture, accents et casse ignorés).
  return terms.find((t) => norm(t) === norm(s.term)) ?? null;
}

const AXES: { term: string; maxDeg: number }[] = [
  { term: 'Face', maxDeg: 22.5 },
  { term: '3/4', maxDeg: 67.5 },
  { term: 'Profil', maxDeg: 112.5 },
  { term: '3/4 dos', maxDeg: 157.5 },
  { term: 'Dos', maxDeg: 180.01 },
];

/** Écart (0 à 180°) entre la direction où regarde le personnage et la direction de la caméra. */
export function axisAngle(actor: { at: Point; rotation: number }, camAt: Point): number {
  const d = normalizeDeg(bearing(actor.at, camAt) - actor.rotation);
  return d > 180 ? 360 - d : d;
}

export function axisForAngle(deg: number, terms: readonly string[]): string | null {
  const a = AXES.find((x) => deg <= x.maxDeg);
  if (!a) return null;
  return terms.find((t) => norm(t) === norm(a.term)) ?? null;
}

export interface FramingGuess {
  actor: FloorActor;
  distanceM: number;
  /** Hauteur de champ à la distance du personnage (m) ; null si l'angle vertical est inconnu. */
  frameHeightM: number | null;
  /** Hauteur de l'image cadrée sur le capteur (mm), pour le calcul inverse de focale. */
  frameMm: number | null;
  size: string | null;
  axisDeg: number;
  axis: string | null;
}

export type SuggestResult =
  | { ok: true; start: FramingGuess; end: FramingGuess | null }
  | { ok: false; reason: string };

/** Personnage le plus proche dans le champ (ou à défaut dans un cône de ±30° autour de l'axe). */
/**
 * Personnage le plus proche dans le champ. `end` : chaque personnage est pris à sa dernière
 * position (fin du plan), avec l'orientation qu'il a là.
 */
function subjectFor(fp: FloorPlan, at: Point, rotation: number, halfFov: number, end = false): FloorActor | null {
  let best: { a: FloorActor; d: number } | null = null;
  for (const el of fp.elements) {
    if (el.kind !== 'actor') continue;
    const last = end ? el.positions[el.positions.length - 1] : undefined;
    const a: FloorActor = last ? { ...el, at: last.at, rotation: last.rotation } : el;
    const off = normalizeDeg(bearing(at, a.at) - rotation);
    const dev = off > 180 ? 360 - off : off;
    if (dev > halfFov) continue;
    const d = Math.hypot(a.at.x - at.x, a.at.y - at.y);
    if (d > 0 && (!best || d < best.d)) best = { a, d };
  }
  return best?.a ?? null;
}

export function suggestFraming(doc: ProjectDoc, fp: FloorPlan, cam: FloorCamera): SuggestResult {
  if (!fp.scale) return { ok: false, reason: 'Mettez le plan à l’échelle (E) pour estimer la valeur.' };
  const loc = cam.planId ? locatePlan(doc, cam.planId) : null;
  const setup = loc?.plan.cameras.find((c) => c.id === cam.setupId);
  if (!loc || !setup) return { ok: false, reason: 'Reliez cette caméra à un plan du découpage.' };
  const projCam = doc.settings.cameras.find((c) => c.id === setup.cameraId);
  const ratio = parseAspectRatio(doc.meta.aspectRatio);
  const terms = doc.settings.terms;

  const guess = (at: Point, rotation: number, focal: number | null, end = false): FramingGuess | { reason: string } => {
    const fov = fieldOfView(projCam, focal, ratio);
    const half = fov.horizontal !== null ? fov.horizontal / 2 : 30;
    const actor = subjectFor(fp, at, rotation, half, end);
    if (!actor) return { reason: 'Aucun personnage dans le champ de la caméra.' };
    const distanceM = metersBetween(fp, at, actor.at)!;
    const hMm = fov.frame?.heightMm ?? null;
    const frameHeightM = hMm !== null && focal !== null && focal > 0 ? (distanceM * hMm) / focal : null;
    const axisDeg = axisAngle(actor, at);
    return { actor, distanceM, frameHeightM, frameMm: hMm, size: frameHeightM !== null ? sizeForFrameHeight(frameHeightM, terms.size) : null, axisDeg, axis: axisForAngle(axisDeg, terms.axis) };
  };

  const start = guess(cam.at, cam.rotation, setup.start.focalMm);
  if ('reason' in start) return { ok: false, reason: start.reason };
  // Fin du plan : dernière position de la caméra (avec son orientation), personnages à leur
  // dernière position, focale de fin si elle change.
  const endPos = cam.positions[cam.positions.length - 1] ?? null;
  const actorsMove = fp.elements.some((e) => e.kind === 'actor' && e.positions.length > 0);
  const endFocal = setup.end?.focalMm ?? null;
  let end: FramingGuess | null = null;
  if (endPos || actorsMove || (endFocal !== null && endFocal !== setup.start.focalMm)) {
    const g = guess(endPos?.at ?? cam.at, endPos?.rotation ?? cam.rotation, endFocal ?? setup.start.focalMm, true);
    end = 'reason' in g ? null : g;
  }
  return { ok: true, start, end };
}

export interface FloorMismatch {
  field: 'size' | 'axis';
  /** Ce que suggère le plan au sol (début, et fin pour un plan évolutif). */
  suggested: string;
  current: string;
  floorPlan: string;
}

/**
 * Écarts entre le découpage et ce que déduisent les plans au sol, par caméra du découpage
 * (identifiant du réglage caméra). Sert à signaler qu'une modification d'un côté n'a pas été
 * reportée de l'autre.
 */
export function floorMismatches(doc: ProjectDoc): Map<string, FloorMismatch[]> {
  const out = new Map<string, FloorMismatch[]>();
  for (const fp of doc.floorPlans) {
    if (!fp.scale) continue;
    for (const el of fp.elements) {
      if (el.kind !== 'camera' || !el.setupId || !el.planId) continue;
      const r = suggestFraming(doc, fp, el);
      if (!r.ok) continue;
      const setup = locatePlan(doc, el.planId)?.plan.cameras.find((c) => c.id === el.setupId);
      if (!setup) continue;
      const list: FloorMismatch[] = [];
      for (const field of ['size', 'axis'] as const) {
        const s = r.start[field];
        const e = r.end?.[field] ?? null;
        if (s === null) continue;
        const wanted = e !== null && e !== s ? `${s} → ${e}` : s;
        const cur = setup.start[field] + (setup.end && setup.end[field] && setup.end[field] !== setup.start[field] ? ` → ${setup.end[field]}` : '');
        if (norm(wanted) !== norm(cur)) list.push({ field, suggested: wanted, current: cur, floorPlan: fp.name });
      }
      if (list.length) out.set(el.setupId, list);
    }
  }
  return out;
}
