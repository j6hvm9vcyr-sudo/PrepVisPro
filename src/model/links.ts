/**
 * Où un plan du découpage apparaît dans les autres documents du projet.
 *
 * Rien n'est recopié d'un document à l'autre : le plan au sol, l'ordre de tournage, les jours
 * et la bibliothèque d'images lisent le même plan. Ce module ne fait que le montrer.
 */
import type { Id, ProjectDoc } from './types';
import { locatePlan } from './ops';
import { computeNumbers } from './numbering';
import { effectiveShooting } from './shooting';
import { dayLabels } from './days';

export interface PlanLinks {
  /** Plans au sol de la séquence, avec les caméras de ce plan placées ou non. */
  floors: {
    id: Id;
    name: string;
    cameras: { setupId: Id; label: string; elementId: Id | null }[];
    lights: number;
    reflectors: number;
  }[];
  /** Ordre de tournage : installation (rang, nom) et rang du plan, « à ranger », ou pas établi. */
  shooting: { kind: 'none' } | { kind: 'loose' } | { kind: 'installation'; index: number; name: string; order: number };
  /** Jours de tournage de la séquence (« J1 »…). */
  days: string[];
  /** Autres plans qui utilisent les mêmes images. */
  sharedWith: string[];
}

export function planLinks(doc: ProjectDoc, planId: Id): PlanLinks | null {
  const loc = locatePlan(doc, planId);
  if (!loc) return null;
  const { seq, plan } = loc;
  const labelOf = (cameraId: Id) => doc.settings.cameras.find((k) => k.id === cameraId)?.label ?? '?';
  const floors = doc.floorPlans
    .filter((f) => f.sequenceIds.includes(seq.id))
    .map((f) => ({
      id: f.id,
      name: f.name || 'Plan au sol',
      cameras: plan.cameras.map((c) => ({
        setupId: c.id,
        label: labelOf(c.cameraId),
        elementId: f.elements.find((e) => e.kind === 'camera' && e.planId === plan.id && e.setupId === c.id)?.id ?? null,
      })),
      lights: f.elements.filter((e) => e.kind === 'light').length,
      reflectors: f.elements.filter((e) => e.kind === 'reflector').length,
    }));

  let shooting: PlanLinks['shooting'] = { kind: 'none' };
  const e = effectiveShooting(seq);
  if (e) {
    shooting = { kind: 'loose' };
    let order = 0;
    e.installations.forEach((ins, i) => {
      for (const p of ins.plans) {
        order++;
        if (p.id === plan.id) shooting = { kind: 'installation', index: i + 1, name: ins.name, order };
      }
    });
  }

  const labels = dayLabels(doc);
  const days = doc.shootingDays.filter((d) => d.sequenceIds.includes(seq.id)).map((d) => labels.get(d.id)!);

  const files = new Set(plan.images.map((i) => i.file));
  const numbers = computeNumbers(doc);
  const sharedWith: string[] = [];
  if (files.size)
    for (const s of doc.sequences)
      for (const p of s.plans)
        if (p.id !== plan.id && p.images.some((i) => files.has(i.file))) sharedWith.push(numbers.get(p.id)?.code ?? '?');

  return { floors, shooting, days, sharedWith };
}
