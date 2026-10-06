/**
 * « À vérifier » : un seul relevé de ce qui manque, pour tout le projet.
 *
 * Un seul code d'état partout (tableau, arbre du film, À vérifier) :
 * - vert « ok » : plan complet et rien à vérifier ;
 * - orange « warn » : commencé, mais il manque quelque chose (voir les éléments) ;
 * - gris « none » : pas encore commencé (aucune case remplie).
 *
 * Rien n'est inventé : chaque élément découle d'une donnée du projet, et les vérifications
 * qui dépendent d'un autre document (plan au sol, jours) ne s'appliquent que si ce document existe.
 */
import type { CameraSetup, Id, Plan, ProjectDoc } from './types';
import { missingFields } from './completeness';
import { computeNumbers } from './numbering';

export type PlanState = 'ok' | 'warn' | 'none';

export type VerifyItem =
  /** Cases obligatoires vides sur un plan commencé. */
  | { kind: 'fields'; planId: Id; code: string; missing: string[] }
  /** La séquence a un plan au sol, mais une caméra de ce plan n'y est placée nulle part. */
  | { kind: 'floor'; planId: Id; code: string; cameras: string[] }
  /** Des jours de tournage existent, mais cette séquence n'est dans aucun. */
  | { kind: 'day'; seqId: Id; number: string; location: string };

export interface Verification {
  items: VerifyItem[];
  /** Plans pas encore commencés (gris), dans l'ordre du film. */
  notStarted: { planId: Id; code: string }[];
  /** État de chaque plan. */
  states: Map<Id, PlanState>;
}

function setupStarted(c: CameraSetup): boolean {
  const s = c.start;
  return !!(s.size || s.axis || s.angle || s.tiltDeg !== null || s.focalMm !== null || c.end || c.movements.length || c.grip.length);
}

/** Un plan est « commencé » dès qu'une case du découpage est remplie. */
export function planStarted(plan: Plan): boolean {
  return !!plan.action.trim() || plan.cameras.some(setupStarted);
}

export function verify(doc: ProjectDoc): Verification {
  const numbers = computeNumbers(doc);
  const items: VerifyItem[] = [];
  const notStarted: Verification['notStarted'] = [];
  const states = new Map<Id, PlanState>();
  const labelOf = (cameraId: Id) => doc.settings.cameras.find((k) => k.id === cameraId)?.label ?? '?';
  const hasDays = doc.shootingDays.length > 0;

  for (const seq of doc.sequences) {
    const floors = doc.floorPlans.filter((f) => f.sequenceIds.includes(seq.id));
    for (const plan of seq.plans) {
      const code = numbers.get(plan.id)?.code ?? '?';
      if (!planStarted(plan)) {
        states.set(plan.id, 'none');
        notStarted.push({ planId: plan.id, code });
        continue;
      }
      let warn = false;
      const missing = missingFields(plan, doc.settings);
      if (missing.length) {
        items.push({ kind: 'fields', planId: plan.id, code, missing });
        warn = true;
      }
      if (floors.length) {
        const unplaced = plan.cameras.filter((c) => !floors.some((f) => f.elements.some((e) => e.kind === 'camera' && e.planId === plan.id && e.setupId === c.id)));
        if (unplaced.length) {
          items.push({ kind: 'floor', planId: plan.id, code, cameras: plan.cameras.length > 1 ? unplaced.map((c) => labelOf(c.cameraId)) : [] });
          warn = true;
        }
      }
      states.set(plan.id, warn ? 'warn' : 'ok');
    }
    if (hasDays && seq.plans.length && !doc.shootingDays.some((d) => d.sequenceIds.includes(seq.id))) {
      items.push({ kind: 'day', seqId: seq.id, number: seq.number, location: seq.location });
    }
  }
  return { items, notStarted, states };
}

/** Libellé court d'un élément, tel qu'affiché dans « À vérifier ». */
export function itemLabel(it: VerifyItem): string {
  switch (it.kind) {
    case 'fields':
      return `${it.code} · ${it.missing.join(', ')}`;
    case 'floor':
      return `${it.code} · ${it.cameras.length ? `caméra${it.cameras.length > 1 ? 's' : ''} ${it.cameras.join(', ')} pas` : 'pas'} sur le plan au sol`;
    case 'day':
      return `Séq. ${it.number || '?'}${it.location ? ` · ${it.location}` : ''} · aucun jour`;
  }
}
