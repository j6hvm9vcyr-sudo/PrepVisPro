/**
 * Plans au sol.
 *
 * Coordonnées : unités du plan = pixels de l'image de fond (ou unités libres sans fond).
 * L'échelle (mètres par unité) est séparée : la calibrer ne déplace rien.
 * Rotation en degrés, 0 = vers le haut du plan, sens horaire.
 */
import type { CameraSetup, Id, ProjectDoc } from './types';
import { horizontalFovDeg } from './optics';

export interface Point {
  x: number;
  y: number;
}

export interface FloorBackground {
  /** Image dans le projet (« images/… »). Un PDF est converti en image à l'import. */
  file: string;
  width: number;
  height: number;
  opacity: number;
  originalName: string;
}

export interface FloorScale {
  /** Mètres par unité du plan. */
  metersPerUnit: number;
  /** Les deux points et la distance saisis lors de la mise à l'échelle (pour la refaire). */
  a: Point;
  b: Point;
  meters: number;
}

interface Base {
  id: Id;
  at: Point;
  rotation: number;
}

export interface FloorCamera extends Base {
  kind: 'camera';
  /** Caméra du découpage représentée (plan + caméra du plan). */
  planId: Id | null;
  setupId: Id | null;
  showFov: boolean;
  /** Trajet d'un mouvement de caméra (travelling…), en unités du plan. */
  path: Point[];
}

export interface FloorActor extends Base {
  kind: 'actor';
  name: string;
  color: string;
  path: Point[];
}

export interface FloorIcon extends Base {
  kind: 'icon';
  /** Image de l'icône dans le projet (« icons/… »). */
  icon: string;
  label: string;
  /** Taille à l'écran, en pixels (lisible quel que soit le zoom). */
  size: number;
}

export interface FloorText extends Base {
  kind: 'text';
  text: string;
  size: number;
}

export type FloorElement = FloorCamera | FloorActor | FloorIcon | FloorText;

export interface FloorPlan {
  id: Id;
  name: string;
  /** Séquences concernées (une seule par défaut). */
  sequenceIds: Id[];
  background: FloorBackground | null;
  scale: FloorScale | null;
  elements: FloorElement[];
  /** Longueur dessinée des champs caméra, en mètres (si le plan est à l'échelle). */
  fovLengthM: number;
}

export const DEFAULT_FOV_LENGTH_M = 4;
/** Longueur des champs sans échelle connue, en unités du plan. */
export const UNSCALED_FOV_LENGTH = 160;

// ------------------------------------------------------------------ géométrie

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Échelle à partir de deux points et d'une distance réelle. null si impossible. */
export function computeScale(a: Point, b: Point, meters: number): FloorScale | null {
  const d = distance(a, b);
  if (!(d > 0) || !(meters > 0) || !Number.isFinite(meters)) return null;
  return { metersPerUnit: meters / d, a, b, meters };
}

/** Angle (degrés, 0 = haut, sens horaire) du vecteur a → b. */
export function bearing(a: Point, b: Point): number {
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return normalizeDeg(deg);
}

export function normalizeDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Point situé à `dist` unités dans la direction `deg` depuis `from`. */
export function project(from: Point, deg: number, dist: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: from.x + Math.sin(rad) * dist, y: from.y - Math.cos(rad) * dist };
}

export interface FovCone {
  /** Angle total du champ, en degrés. */
  angle: number;
  /** Longueur en unités du plan. */
  length: number;
  left: Point;
  right: Point;
}

/** Champ d'une caméra sur le plan. null si l'angle n'est pas calculable (capteur ou focale inconnus). */
export function fovCone(at: Point, rotation: number, fovDeg: number | null, length: number): FovCone | null {
  if (fovDeg === null || !(fovDeg > 0) || fovDeg >= 180) return null;
  return { angle: fovDeg, length, left: project(at, rotation - fovDeg / 2, length), right: project(at, rotation + fovDeg / 2, length) };
}

/** Champs de début et de fin (plan évolutif) d'une caméra du découpage. */
export function setupFov(doc: ProjectDoc, setup: CameraSetup): { start: number | null; end: number | null } {
  const cam = doc.settings.cameras.find((c) => c.id === setup.cameraId);
  const w = cam?.sensorWidthMm ?? null;
  const sq = cam?.squeeze ?? 1;
  const start = horizontalFovDeg(w, setup.start.focalMm, sq);
  const end = setup.end && setup.end.focalMm !== null && setup.end.focalMm !== setup.start.focalMm ? horizontalFovDeg(w, setup.end.focalMm, sq) : null;
  return { start, end };
}

/** Longueur des champs en unités du plan. */
export function fovLengthUnits(fp: FloorPlan): number {
  return fp.scale ? fp.fovLengthM / fp.scale.metersPerUnit : UNSCALED_FOV_LENGTH;
}

/** Distance réelle entre deux points, en mètres (null sans échelle). */
export function metersBetween(fp: FloorPlan, a: Point, b: Point): number | null {
  return fp.scale ? distance(a, b) * fp.scale.metersPerUnit : null;
}
