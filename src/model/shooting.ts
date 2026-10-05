/**
 * Ordre de tournage par installation.
 *
 * Une installation = une position de caméra et un sens de lumière : les plans tournés à la suite
 * sans tout réinstaller. La proposition s'appuie sur les plans au sol (position et direction des
 * caméras) ; elle se corrige ensuite à la main, et les plans ajoutés après coup restent « à ranger ».
 */
import { produce } from 'immer';
import type { Id, Installation, Plan, ProjectDoc, Sequence, ShootingOrder } from './types';
import { normalizeDeg, type FloorCamera, type FloorPlan } from './floor';
import { SIZE_SCALE } from './floorSuggest';
import { newId } from './defaults';
import { norm } from './text';

/** Écart maximal de direction de caméra dans une même installation (degrés). */
const SAME_DIRECTION_DEG = 35;
/** Écart maximal de position de caméra dans une même installation (mètres). */
const SAME_PLACE_M = 1.5;

/** Rang de largeur d'une valeur : plus grand = plus large (Général avant TGP). Inconnue : au milieu. */
function widthRank(size: string): number {
  const i = SIZE_SCALE.findIndex((x) => norm(x.term) === norm(size));
  return i < 0 ? SIZE_SCALE.length / 2 : i;
}

function angleDiff(a: number, b: number): number {
  const d = normalizeDeg(a - b);
  return d > 180 ? 360 - d : d;
}

interface Placed {
  plan: Plan;
  fp: FloorPlan;
  cam: FloorCamera;
  rank: number;
  index: number;
}

/** Caméra d'un plan sur un plan au sol de la séquence (la première caméra du plan qui y est placée). */
function placementOf(doc: ProjectDoc, seq: Sequence, plan: Plan): { fp: FloorPlan; cam: FloorCamera } | null {
  for (const fp of doc.floorPlans) {
    if (!fp.sequenceIds.includes(seq.id)) continue;
    for (const c of plan.cameras) {
      const el = fp.elements.find((e): e is FloorCamera => e.kind === 'camera' && e.planId === plan.id && e.setupId === c.id);
      if (el) return { fp, cam: el };
    }
  }
  return null;
}

function distanceM(fp: FloorPlan, a: FloorCamera, b: FloorCamera): number {
  const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
  // Sans échelle : 100 unités ≈ 1 m (repère prudent).
  return fp.scale ? d * fp.scale.metersPerUnit : d / 100;
}

/** Valeur la plus large d'un plan (début ou fin d'un plan évolutif), toutes caméras. */
function planWidth(plan: Plan): number {
  return Math.max(...plan.cameras.flatMap((c) => [widthRank(c.start.size), c.end ? widthRank(c.end.size) : -1]));
}

/**
 * Propose les installations d'une séquence :
 * - regroupe les plans dont les caméras sont au même endroit et regardent dans la même direction ;
 * - tourne d'abord le côté du plan le plus large (champ), puis l'autre (contrechamp) ;
 * - dans chaque côté, les installations les plus larges d'abord ; dans chaque installation, du plus large au plus serré.
 * Les plans qui ne sont sur aucun plan au sol forment une dernière installation, à placer.
 */
export function proposeShooting(doc: ProjectDoc, seq: Sequence): ShootingOrder {
  const placed: Placed[] = [];
  const unplaced: Plan[] = [];
  seq.plans.forEach((plan, index) => {
    const p = placementOf(doc, seq, plan);
    if (p) placed.push({ plan, ...p, rank: planWidth(plan), index });
    else unplaced.push(plan);
  });
  // Les plus larges d'abord : ils fondent les installations.
  placed.sort((a, b) => b.rank - a.rank || a.index - b.index);
  const groups: Placed[][] = [];
  for (const p of placed) {
    const g = groups.find((x) => x[0]!.fp.id === p.fp.id && angleDiff(x[0]!.cam.rotation, p.cam.rotation) <= SAME_DIRECTION_DEG && distanceM(p.fp, x[0]!.cam, p.cam) <= SAME_PLACE_M);
    if (g) g.push(p);
    else groups.push([p]);
  }
  // Côté du plan le plus large = champ ; l'autre = contrechamp.
  const main = groups[0]?.[0]?.cam.rotation ?? 0;
  const sideOf = (g: Placed[]) => (angleDiff(g[0]!.cam.rotation, main) <= 90 ? 0 : 1);
  groups.sort((a, b) => sideOf(a) - sideOf(b) || b[0]!.rank - a[0]!.rank || a[0]!.index - b[0]!.index);

  const installations: Installation[] = groups.map((g, i) => {
    g.sort((a, b) => b.rank - a.rank || a.index - b.index);
    const side = sideOf(g) === 0 ? 'Champ' : 'Contrechamp';
    return { id: newId('in'), name: `${side} ${i + 1}`, planIds: g.map((x) => x.plan.id), note: '' };
  });
  if (unplaced.length) installations.push({ id: newId('in'), name: 'Sans position sur le plan', planIds: unplaced.map((p) => p.id), note: '' });
  return { installations };
}

export interface EffectiveShooting {
  installations: (Installation & { plans: Plan[] })[];
  /** Plans de la séquence qui ne sont dans aucune installation (ajoutés après coup). */
  loose: Plan[];
}

/** Ordre tel qu'il s'applique aujourd'hui : plans disparus retirés, nouveaux plans « à ranger ». */
export function effectiveShooting(seq: Sequence): EffectiveShooting | null {
  if (!seq.shooting) return null;
  const byId = new Map(seq.plans.map((p) => [p.id, p]));
  const used = new Set<Id>();
  const installations = seq.shooting.installations.map((ins) => {
    const plans = ins.planIds.map((id) => byId.get(id)).filter((p): p is Plan => !!p && !used.has(p.id));
    plans.forEach((p) => used.add(p.id));
    return { ...ins, plans };
  });
  return { installations, loose: seq.plans.filter((p) => !used.has(p.id)) };
}

/** Retire des ordres de tournage les plans qui n'existent plus dans leur séquence. */
export function cleanupShooting(doc: ProjectDoc): ProjectDoc {
  const stale = doc.sequences.some((s) => {
    if (!s.shooting) return false;
    const ids = new Set(s.plans.map((p) => p.id));
    return s.shooting.installations.some((i) => i.planIds.some((id) => !ids.has(id)));
  });
  if (!stale) return doc;
  return produce(doc, (d) => {
    for (const s of d.sequences) {
      if (!s.shooting) continue;
      const ids = new Set(s.plans.map((p) => p.id));
      for (const i of s.shooting.installations) i.planIds = i.planIds.filter((id) => ids.has(id));
    }
  });
}

// ------------------------------------------------------------------ modifications

function draftSeq(d: ProjectDoc, seqId: Id) {
  const s = d.sequences.find((x) => x.id === seqId);
  if (!s) throw new Error('Séquence introuvable');
  return s;
}

export function setShooting(doc: ProjectDoc, seqId: Id, order: ShootingOrder | null): ProjectDoc {
  return produce(doc, (d) => void (draftSeq(d, seqId).shooting = order));
}

/** Déplace un plan dans une installation, à une position donnée (fin si index absent). */
export function movePlanToInstallation(doc: ProjectDoc, seqId: Id, planId: Id, installationId: Id, index?: number): ProjectDoc {
  return produce(doc, (d) => {
    const s = draftSeq(d, seqId);
    if (!s.shooting) return;
    for (const i of s.shooting.installations) i.planIds = i.planIds.filter((x) => x !== planId);
    const target = s.shooting.installations.find((i) => i.id === installationId);
    if (!target) return;
    const at = index === undefined ? target.planIds.length : Math.max(0, Math.min(index, target.planIds.length));
    target.planIds.splice(at, 0, planId);
  });
}

export function addInstallation(doc: ProjectDoc, seqId: Id, name: string): { doc: ProjectDoc; id: Id } {
  const id = newId('in');
  const next = produce(doc, (d) => {
    const s = draftSeq(d, seqId);
    s.shooting ??= { installations: [] };
    s.shooting.installations.push({ id, name, planIds: [], note: '' });
  });
  return { doc: next, id };
}

export function updateInstallation(doc: ProjectDoc, seqId: Id, installationId: Id, fn: (i: Installation) => void): ProjectDoc {
  return produce(doc, (d) => {
    const i = draftSeq(d, seqId).shooting?.installations.find((x) => x.id === installationId);
    if (i) fn(i);
  });
}

export function moveInstallation(doc: ProjectDoc, seqId: Id, installationId: Id, delta: -1 | 1): ProjectDoc {
  const i = doc.sequences.find((s) => s.id === seqId)?.shooting?.installations.findIndex((x) => x.id === installationId) ?? -1;
  return i < 0 ? doc : moveInstallationTo(doc, seqId, installationId, i + delta);
}

/** Place une installation au rang `to` (glisser-déposer). */
export function moveInstallationTo(doc: ProjectDoc, seqId: Id, installationId: Id, to: number): ProjectDoc {
  return produce(doc, (d) => {
    const list = draftSeq(d, seqId).shooting?.installations;
    if (!list) return;
    const i = list.findIndex((x) => x.id === installationId);
    if (i < 0 || to < 0 || to >= list.length || to === i) return;
    list.splice(to, 0, list.splice(i, 1)[0]!);
  });
}

/** Supprime une installation : ses plans redeviennent « à ranger ». */
export function removeInstallation(doc: ProjectDoc, seqId: Id, installationId: Id): ProjectDoc {
  return produce(doc, (d) => {
    const s = draftSeq(d, seqId);
    if (!s.shooting) return;
    s.shooting.installations = s.shooting.installations.filter((x) => x.id !== installationId);
  });
}
