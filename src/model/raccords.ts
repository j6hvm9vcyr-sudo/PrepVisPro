/**
 * Raccords : règle des 180° (0.23).
 *
 * Un axe relie deux personnages d'un plan au sol. Chaque caméra placée est d'un côté de la droite
 * qui les joint, ou dessus. Entre deux plans qui se suivent dans la séquence, la caméra de fin du
 * premier et celle de début du second doivent être du même côté ; sinon c'est un saut d'axe,
 * signalé dans « À vérifier » tant qu'il n'est pas marqué « C'est voulu ».
 *
 * Rien n'est deviné :
 * - un plan sans caméra sur ce plan au sol (ni sur celui du plan dont il est la reprise) n'a pas de
 *   côté, et ne fait raccord avec personne ;
 * - un plan à plusieurs caméras de côtés différents n'a pas de côté (le montage choisira) ;
 * - une caméra sur l'axe (à moins de 3° de la droite) est neutre : jamais un saut ;
 * - si l'un des deux personnages se déplace (positions 2, 3…), l'axe bouge pendant la scène : il
 *   n'est pas vérifié.
 */
import type { Id, ProjectDoc } from './types';
import type { FloorAxis, FloorCamera, FloorPlan, Point } from './floor';
import { computeNumbers } from './numbering';

/** Côté de la droite A→B : 1 à droite (sens horaire, axe y vers le bas), -1 à gauche, 0 sur l'axe. */
export type Side = 1 | -1 | 0;

/** En deçà de cet angle (vu depuis le personnage le plus proche), la caméra est « sur l'axe ». */
export const ON_AXIS_DEG = 3;

export function sideOf(a: Point, b: Point, p: Point): Side {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (!(len > 0)) return 0;
  const cross = abx * (p.y - a.y) - aby * (p.x - a.x);
  const dist = Math.abs(cross) / len;
  const near = Math.min(Math.hypot(p.x - a.x, p.y - a.y), Math.hypot(p.x - b.x, p.y - b.y));
  if (near === 0 || dist <= near * Math.sin((ON_AXIS_DEG * Math.PI) / 180)) return 0;
  return cross > 0 ? 1 : -1;
}

export interface ShotSide {
  planId: Id;
  code: string;
  /** Caméras de ce plan posées sur ce plan au sol (celles du plan d'origine pour une reprise). */
  cameras: FloorCamera[];
  /** Côté au début et à la fin du plan ; null si inconnu (pas de caméra, ou caméras de côtés différents). */
  start: Side | null;
  end: Side | null;
}

export interface AxisJump {
  floorPlanId: Id;
  axisId: Id;
  seqId: Id;
  /** Noms des deux personnages. */
  names: [string, string];
  fromPlanId: Id;
  toPlanId: Id;
  fromCode: string;
  toCode: string;
  /** Clé de « C'est voulu » : « planAvant>planAprès ». */
  key: string;
  accepted: boolean;
}

export interface AxisReport {
  axis: FloorAxis;
  names: [string, string];
  /** Un des deux personnages se déplace : l'axe n'est pas vérifié. */
  moving: boolean;
  /** Plans de chaque séquence du plan au sol, dans l'ordre du film. */
  sequences: { seqId: Id; number: string; shots: ShotSide[] }[];
  jumps: AxisJump[];
}

export function jumpKey(fromPlanId: Id, toPlanId: Id): string {
  return `${fromPlanId}>${toPlanId}`;
}

/** Un seul côté pour toutes ces valeurs, sinon null. */
function common(sides: Side[]): Side | null {
  if (!sides.length) return null;
  return sides.every((s) => s === sides[0]) ? sides[0]! : null;
}

export function axisReports(doc: ProjectDoc, fp: FloorPlan, numbers = computeNumbers(doc)): AxisReport[] {
  const out: AxisReport[] = [];
  for (const axis of fp.axes) {
    const [ea, eb] = axis.actorIds.map((id) => fp.elements.find((e) => e.id === id));
    if (!ea || !eb || ea.kind !== 'actor' || eb.kind !== 'actor') continue;
    const names: [string, string] = [ea.name || 'Personnage', eb.name || 'Personnage'];
    const moving = ea.positions.length > 0 || eb.positions.length > 0;
    const report: AxisReport = { axis, names, moving, sequences: [], jumps: [] };
    for (const seqId of fp.sequenceIds) {
      const seq = doc.sequences.find((s) => s.id === seqId);
      if (!seq) continue;
      const camsOf = (planId: Id) => fp.elements.filter((e): e is FloorCamera => e.kind === 'camera' && e.planId === planId);
      const shots: ShotSide[] = seq.plans.map((p) => {
        let cameras = camsOf(p.id);
        if (!cameras.length && p.repriseOf) cameras = camsOf(p.repriseOf);
        const code = numbers.get(p.id)?.code ?? '?';
        if (moving) return { planId: p.id, code, cameras, start: null, end: null };
        const start = common(cameras.map((c) => sideOf(ea.at, eb.at, c.at)));
        const end = common(cameras.map((c) => sideOf(ea.at, eb.at, c.positions[c.positions.length - 1]?.at ?? c.at)));
        return { planId: p.id, code, cameras, start, end };
      });
      report.sequences.push({ seqId, number: seq.number, shots });
      for (let i = 1; i < shots.length; i++) {
        const x = shots[i - 1]!;
        const y = shots[i]!;
        if (x.end === null || y.start === null || x.end === 0 || y.start === 0 || x.end === y.start) continue;
        const key = jumpKey(x.planId, y.planId);
        report.jumps.push({ floorPlanId: fp.id, axisId: axis.id, seqId, names, fromPlanId: x.planId, toPlanId: y.planId, fromCode: x.code, toCode: y.code, key, accepted: axis.accepted.includes(key) });
      }
    }
    out.push(report);
  }
  return out;
}

/** Tous les sauts d'axe du projet (acceptés compris), dans l'ordre des plans au sol. */
export function axisJumps(doc: ProjectDoc, numbers = computeNumbers(doc)): AxisJump[] {
  return doc.floorPlans.flatMap((fp) => axisReports(doc, fp, numbers).flatMap((r) => r.jumps));
}
