/**
 * Opérations sur le document. Toutes sont pures : elles renvoient un nouveau document
 * (partage structurel via immer) et ne modifient jamais l'original. C'est ce qui rend
 * l'annulation fiable.
 */
import { produce, type Draft } from 'immer';
import type { CameraSetup, Id, ImageAsset, Plan, ProjectDoc, Sequence, TermCategory } from './types';
import { newId, newPlan, newProjectCamera, newSequence } from './defaults';
import { norm } from './text';
import { deleteSequenceInFlow, moveInFlow } from './stamps';

export interface PlanLocation {
  seqIndex: number;
  planIndex: number;
  seq: Sequence;
  plan: Plan;
}

export function locatePlan(doc: ProjectDoc, planId: Id): PlanLocation | null {
  for (let si = 0; si < doc.sequences.length; si++) {
    const seq = doc.sequences[si]!;
    const pi = seq.plans.findIndex((p) => p.id === planId);
    if (pi >= 0) return { seqIndex: si, planIndex: pi, seq, plan: seq.plans[pi]! };
  }
  return null;
}

function draftPlan(d: Draft<ProjectDoc>, planId: Id): Draft<Plan> {
  for (const s of d.sequences) {
    const p = s.plans.find((x) => x.id === planId);
    if (p) return p;
  }
  throw new Error(`Plan introuvable : ${planId}`);
}

function deepCopySetup(c: CameraSetup): CameraSetup {
  return { ...structuredClone(c), id: newId('cs') };
}

/**
 * Insère un plan juste après `afterPlanId`, avec les réglages caméra de celui-ci.
 * Reprise : même action, même extrait, mêmes images, rattachée au plan d'origine.
 */
export function insertPlanAfter(doc: ProjectDoc, afterPlanId: Id, opts: { reprise: boolean }): { doc: ProjectDoc; planId: Id } {
  const loc = locatePlan(doc, afterPlanId);
  if (!loc) throw new Error(`Plan introuvable : ${afterPlanId}`);
  const src = loc.plan;
  const plan: Plan = {
    ...newPlan(src.cameras[0]!.cameraId),
    cameras: src.cameras.map(deepCopySetup),
  };
  if (opts.reprise) {
    plan.repriseOf = src.repriseOf ?? src.id;
    plan.action = src.action;
    plan.scriptExcerpt = src.scriptExcerpt;
    plan.images = src.images.map((i) => ({ ...i, id: newId('img') }));
    const coverIdx = src.coverImageId ? src.images.findIndex((i) => i.id === src.coverImageId) : -1;
    plan.coverImageId = coverIdx >= 0 ? plan.images[coverIdx]!.id : null;
  }
  const next = produce(doc, (d) => {
    d.sequences[loc.seqIndex]!.plans.splice(loc.planIndex + 1, 0, plan);
  });
  return { doc: next, planId: plan.id };
}

/** Ajoute un plan vide à la fin d'une séquence. */
export function appendPlan(doc: ProjectDoc, seqId: Id): { doc: ProjectDoc; planId: Id } {
  const camId = doc.settings.cameras[0]!.id;
  const plan = newPlan(camId);
  const next = produce(doc, (d) => {
    const s = d.sequences.find((x) => x.id === seqId);
    if (!s) throw new Error(`Séquence introuvable : ${seqId}`);
    s.plans.push(plan);
  });
  return { doc: next, planId: plan.id };
}

export type DeleteResult = { ok: true; doc: ProjectDoc; focusPlanId: Id } | { ok: false; error: string };

/** Supprime un plan. Ses reprises deviennent des plans normaux. Une séquence garde au moins un plan. */
export function deletePlan(doc: ProjectDoc, planId: Id): DeleteResult {
  const loc = locatePlan(doc, planId);
  if (!loc) return { ok: false, error: 'Plan introuvable.' };
  if (loc.seq.plans.length <= 1) return { ok: false, error: 'Une séquence garde au moins un plan.' };
  const next = produce(doc, (d) => {
    const plans = d.sequences[loc.seqIndex]!.plans;
    plans.splice(loc.planIndex, 1);
    for (const p of plans) if (p.repriseOf === planId) p.repriseOf = null;
  });
  const remaining = next.sequences[loc.seqIndex]!.plans;
  return { ok: true, doc: next, focusPlanId: remaining[Math.max(0, loc.planIndex - 1)]!.id };
}

/** Déplace un plan d'un cran dans sa séquence (-1 vers le haut, +1 vers le bas). */
export function movePlan(doc: ProjectDoc, planId: Id, delta: -1 | 1): ProjectDoc {
  const loc = locatePlan(doc, planId);
  if (!loc) return doc;
  const j = loc.planIndex + delta;
  if (j < 0 || j >= loc.seq.plans.length) return doc;
  return produce(doc, (d) => {
    const plans = d.sequences[loc.seqIndex]!.plans;
    const [p] = plans.splice(loc.planIndex, 1);
    plans.splice(j, 0, p!);
  });
}

export function updatePlan(doc: ProjectDoc, planId: Id, fn: (p: Draft<Plan>) => void): ProjectDoc {
  return produce(doc, (d) => fn(draftPlan(d, planId)));
}

export function replaceCameraSetup(doc: ProjectDoc, planId: Id, setup: CameraSetup): ProjectDoc {
  return produce(doc, (d) => {
    const p = draftPlan(d, planId);
    const i = p.cameras.findIndex((c) => c.id === setup.id);
    if (i < 0) throw new Error('Caméra introuvable dans le plan.');
    p.cameras[i] = structuredClone(setup);
  });
}

function nextCameraLabel(labels: string[]): string {
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!labels.includes(l)) return l;
  }
  return `Cam ${labels.length + 1}`;
}

/**
 * Ajoute une caméra au plan (réglages copiés de la dernière).
 * Utilise une caméra du projet pas encore présente sur le plan ; en crée une si besoin.
 */
export function addCameraToPlan(doc: ProjectDoc, planId: Id): { doc: ProjectDoc; setupId: Id } {
  const loc = locatePlan(doc, planId);
  if (!loc) throw new Error(`Plan introuvable : ${planId}`);
  const used = new Set(loc.plan.cameras.map((c) => c.cameraId));
  let cam = doc.settings.cameras.find((c) => !used.has(c.id));
  let created = null as ReturnType<typeof newProjectCamera> | null;
  if (!cam) {
    created = newProjectCamera(nextCameraLabel(doc.settings.cameras.map((c) => c.label)));
    cam = created;
  }
  const setup = { ...deepCopySetup(loc.plan.cameras[loc.plan.cameras.length - 1]!), cameraId: cam.id };
  const next = produce(doc, (d) => {
    if (created) d.settings.cameras.push(created);
    draftPlan(d, planId).cameras.push(setup);
  });
  return { doc: next, setupId: setup.id };
}

export function removeCameraFromPlan(doc: ProjectDoc, planId: Id, setupId: Id): ProjectDoc {
  return produce(doc, (d) => {
    const p = draftPlan(d, planId);
    if (p.cameras.length <= 1) return;
    p.cameras = p.cameras.filter((c) => c.id !== setupId);
  });
}

/** Ajoute des termes personnalisés, sans doublon (comparaison sans accents ni casse). */
export function addTerms(doc: ProjectDoc, category: TermCategory, terms: string[]): ProjectDoc {
  if (!terms.length) return doc;
  return produce(doc, (d) => {
    const list = d.settings.terms[category];
    for (const t of terms) {
      const clean = t.trim();
      if (clean && !list.some((x) => norm(x) === norm(clean))) list.push(clean);
    }
  });
}

export function addImages(doc: ProjectDoc, planId: Id, images: ImageAsset[]): ProjectDoc {
  return updatePlan(doc, planId, (p) => {
    p.images.push(...images);
  });
}

export function removeImage(doc: ProjectDoc, planId: Id, imageId: Id): ProjectDoc {
  return updatePlan(doc, planId, (p) => {
    p.images = p.images.filter((i) => i.id !== imageId);
    if (p.coverImageId === imageId) p.coverImageId = null;
  });
}

export function setImageKind(doc: ProjectDoc, planId: Id, imageId: Id, kind: ImageAsset['kind']): ProjectDoc {
  return updatePlan(doc, planId, (p) => {
    const i = p.images.find((x) => x.id === imageId);
    if (i) i.kind = kind;
  });
}

export function setCover(doc: ProjectDoc, planId: Id, imageId: Id | null): ProjectDoc {
  return updatePlan(doc, planId, (p) => {
    p.coverImageId = imageId;
  });
}

// ---------------------------------------------------------------- séquences

export function insertSequenceAfter(doc: ProjectDoc, afterSeqId: Id | null, number: string): { doc: ProjectDoc; seqId: Id; planId: Id } {
  const seq = newSequence(number, doc.settings.cameras[0]!.id);
  const next = produce(doc, (d) => {
    const i = afterSeqId ? d.sequences.findIndex((s) => s.id === afterSeqId) : -1;
    d.sequences.splice(i + 1, 0, seq);
  });
  return { doc: next, seqId: seq.id, planId: seq.plans[0]!.id };
}

export function updateSequence(doc: ProjectDoc, seqId: Id, fn: (s: Draft<Sequence>) => void): ProjectDoc {
  return produce(doc, (d) => {
    const s = d.sequences.find((x) => x.id === seqId);
    if (!s) throw new Error(`Séquence introuvable : ${seqId}`);
    fn(s);
  });
}

/** Supprime une séquence ; les tampons gardent leur place dans le film (voir stamps.ts). */
export function deleteSequence(doc: ProjectDoc, seqId: Id): ProjectDoc {
  return deleteSequenceInFlow(doc, seqId);
}

/** Déplace une séquence d'un cran dans le film (un tampon compte comme un cran). */
export function moveSequence(doc: ProjectDoc, seqId: Id, delta: -1 | 1): ProjectDoc {
  return moveInFlow(doc, seqId, delta);
}
