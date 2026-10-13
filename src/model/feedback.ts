/**
 * Retours (0.21) : le découpage interactif publié laisse chaque destinataire annoter les plans
 * (validé, à revoir, un mot, une valeur proposée) puis enregistrer ses retours dans un fichier
 * `.topshot-retours`. Topshot le relit, le range avec le projet, et chaque retour devient, au choix,
 * une note datée ou une saisie dans le tableau (toujours validée à la main).
 */
import { produce, type Draft } from 'immer';
import { z } from 'zod';
import type { Feedback, FeedbackField, FeedbackItem, Id, ProjectDoc } from './types';
import { FEEDBACK_FIELDS } from './types';
import { addNote } from './notes';
import { displayText, FIELD_LABEL } from './entry';
import { durationEditText } from './duration';
import { locatePlan } from './ops';
import { newPlan } from './defaults';

/** Nom des réglages qu'un retour peut proposer. */
export const FEEDBACK_LABEL: Record<FeedbackField, string> = { ...FIELD_LABEL, duration: 'Durée' };

export const RETOURS_EXT = 'topshot-retours';
/** Au-delà, ce n'est pas un fichier de retours. */
export const RETOURS_MAX_BYTES = 2 * 1024 * 1024;

const itemV1 = z.object({
  id: z.string().min(1).max(100),
  planId: z.string().min(1).nullable(),
  seqId: z.string().min(1).nullable(),
  code: z.string().max(50),
  verdict: z.enum(['ok', 'revoir']).nullable(),
  text: z.string().max(5000),
  proposal: z.object({ setupId: z.string().min(1).nullable(), field: z.enum(FEEDBACK_FIELDS), text: z.string().max(500), before: z.string().max(500) }).nullable(),
});
const head = {
  id: z.string().min(1).max(100),
  projectId: z.string().min(1),
  author: z.string().max(200),
  role: z.string().max(200),
  sentAt: z.number().int().nonnegative(),
};
/** Version 1 : écrit par le découpage interactif publié. */
const fileV1 = z.object({ topshotRetours: z.literal(1), ...head, publication: z.number().int().positive(), items: z.array(itemV1).max(5000) });
/**
 * Version 2 (0.25) : peut aussi venir d'ailleurs que d'une publication (notes de réunion rangées par
 * un assistant, voir docs/retours-v2.md) : créer un plan, citer la note d'où vient chaque retour.
 */
const fileV2 = z.object({
  topshotRetours: z.literal(2),
  ...head,
  publication: z.number().int().positive().nullable(),
  items: z
    .array(
      itemV1.extend({
        create: z.object({ afterPlanId: z.string().min(1).nullable() }).nullable().default(null),
        noteIds: z.array(z.string().min(1).max(100)).max(100).default([]),
        quote: z.string().max(2000).default(''),
      }),
    )
    .max(5000),
});
const fileSchema = z.discriminatedUnion('topshotRetours', [fileV1, fileV2]);

export type RetoursFile = z.infer<typeof fileSchema>;

export type ReadResult = { ok: true; feedback: Feedback } | { ok: false; error: string };

/** Identifiant d'un plan à créer : lettres, chiffres, « _ » et « - ». */
const PLAN_ID = /^[A-Za-z0-9_-]{1,100}$/;

function allNoteIds(doc: ProjectDoc): Set<Id> {
  const ids = new Set<Id>();
  for (const s of doc.sequences) {
    for (const n of s.notes) ids.add(n.id);
    for (const p of s.plans) for (const n of p.notes) ids.add(n.id);
  }
  return ids;
}

/** Lit un fichier de retours pour ce projet. */
export function readRetours(text: string, doc: ProjectDoc, now: number): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas un fichier de retours Topshot.' };
  }
  const r = fileSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: 'Ce fichier de retours est abîmé ou d’une autre version.' };
  const f = r.data;
  if (f.projectId !== doc.id) return { ok: false, error: 'Ces retours concernent un autre projet.' };
  const notes = allNoteIds(doc);
  const items: FeedbackItem[] = [];
  for (const i of f.items) {
    const v2 = 'create' in i ? i : { ...i, create: null, noteIds: [], quote: '' };
    if (!(v2.verdict || v2.text.trim() || v2.proposal || v2.create)) continue;
    items.push({ ...v2, text: v2.text.trim(), quote: v2.quote.trim(), noteIds: [...new Set(v2.noteIds.filter((n) => notes.has(n)))], state: 'new' });
  }
  if (new Set(items.map((i) => i.id)).size !== items.length) return { ok: false, error: 'Ce fichier de retours est abîmé (retour en double).' };
  // Plans à créer : un identifiant neuf (ou celui d'un plan déjà créé dans la même séquence), une fois chacun.
  const created = items.filter((i) => i.create);
  for (const i of created) {
    if (!i.planId || !i.seqId || !PLAN_ID.test(i.planId)) return { ok: false, error: 'Ce fichier de retours est abîmé (plan à créer sans séquence).' };
    const at = locatePlan(doc, i.planId);
    if (at && at.seq.id !== i.seqId) return { ok: false, error: 'Ce fichier de retours est abîmé (plan à créer déjà pris).' };
  }
  if (new Set(created.map((i) => i.planId)).size !== created.length) return { ok: false, error: 'Ce fichier de retours est abîmé (plan créé deux fois).' };
  return {
    ok: true,
    feedback: {
      id: f.id,
      author: f.author.trim() || 'Sans nom',
      role: f.role.trim(),
      publication: f.publication,
      sentAt: f.sentAt,
      receivedAt: now,
      items,
    },
  };
}

/** Range des retours avec le projet ; déjà reçus (même fichier) : rien ne change. */
export function addFeedback(doc: ProjectDoc, fb: Feedback): { doc: ProjectDoc; added: boolean } {
  if (doc.feedback.some((f) => f.id === fb.id)) return { doc, added: false };
  return { doc: produce(doc, (d) => void d.feedback.push(fb)), added: true };
}

export function setItemState(doc: ProjectDoc, fbId: Id, itemId: Id, state: FeedbackItem['state']): ProjectDoc {
  return produce(doc, (d) => {
    const it = d.feedback.find((f) => f.id === fbId)?.items.find((i) => i.id === itemId);
    if (!it) return;
    it.state = state;
    if (state !== 'new') checkNotes(d);
  });
}

/** Une note d'où viennent des retours est cochée quand tous ces retours sont traités (jamais décochée). */
function checkNotes(d: Draft<ProjectDoc>): void {
  const open = new Map<Id, boolean>();
  for (const f of d.feedback) for (const i of f.items) for (const n of i.noteIds) open.set(n, (open.get(n) ?? false) || i.state === 'new');
  if (!open.size) return;
  for (const s of d.sequences) {
    for (const n of s.notes) if (open.get(n.id) === false) n.done = true;
    for (const p of s.plans) for (const n of p.notes) if (open.get(n.id) === false) n.done = true;
  }
}

/**
 * Valeur actuelle de la case visée par une proposition (null : plan ou caméra absents). Sans caméra
 * précisée, la première du plan.
 */
export function fieldValue(doc: ProjectDoc, planId: Id, setupId: Id | null, field: FeedbackField): string | null {
  const loc = locatePlan(doc, planId);
  if (!loc) return null;
  if (field === 'action') return loc.plan.action;
  if (field === 'duration') return durationEditText(loc.plan.durationS);
  const setup = setupId ? loc.plan.cameras.find((c) => c.id === setupId) : loc.plan.cameras[0];
  return setup ? displayText(field, setup) : null;
}

/** Plan à créer : déjà là (créé depuis) ? */
export function isCreated(doc: ProjectDoc, item: FeedbackItem): boolean {
  return !!item.planId && !!locatePlan(doc, item.planId);
}

/**
 * Crée le plan proposé (vide, une caméra : celle du premier plan de la séquence), après le plan
 * indiqué s'il est toujours dans la séquence, sinon en fin de séquence. Null : séquence retirée.
 */
export function createPlanFromItem(doc: ProjectDoc, fbId: Id, itemId: Id): ProjectDoc | null {
  const item = doc.feedback.find((f) => f.id === fbId)?.items.find((i) => i.id === itemId);
  if (!item?.create || !item.planId || !item.seqId) return null;
  if (isCreated(doc, item)) return setItemState(doc, fbId, itemId, 'applied');
  const si = doc.sequences.findIndex((s) => s.id === item.seqId);
  if (si < 0) return null;
  const seq = doc.sequences[si]!;
  const cameraId = seq.plans[0]?.cameras[0]?.cameraId ?? doc.settings.cameras[0]?.id;
  if (!cameraId) return null;
  const plan = { ...newPlan(cameraId), id: item.planId };
  const after = item.create.afterPlanId ? seq.plans.findIndex((p) => p.id === item.create!.afterPlanId) : -1;
  const next = produce(doc, (d) => void d.sequences[si]!.plans.splice(after >= 0 ? after + 1 : seq.plans.length, 0, plan));
  return setItemState(next, fbId, itemId, 'applied');
}

/** Retours pas encore traités. */
export function pendingCount(doc: ProjectDoc): number {
  return doc.feedback.reduce((n, f) => n + f.items.filter((i) => i.state === 'new').length, 0);
}

/** Où va le retour : le plan (s'il existe encore), sinon sa séquence, sinon rien. */
export function itemOwner(doc: ProjectDoc, item: FeedbackItem): { planId: Id } | { seqId: Id } | null {
  if (item.planId && doc.sequences.some((s) => s.plans.some((p) => p.id === item.planId))) return { planId: item.planId };
  if (item.seqId && doc.sequences.some((s) => s.id === item.seqId)) return { seqId: item.seqId };
  return null;
}

/** Texte de la note : qui, quoi (« Margaux (réalisation) · à revoir : Plutôt un 50 · propose Focale : 50 »). */
export function noteText(fb: Feedback, item: FeedbackItem): string {
  const who = fb.role ? `${fb.author} (${fb.role.toLowerCase()})` : fb.author;
  const parts = [
    item.verdict === 'ok' ? 'validé' : item.verdict === 'revoir' ? 'à revoir' : '',
    item.create ? `nouveau plan ${item.code}` : '',
    item.text,
    item.proposal ? `propose ${FEEDBACK_LABEL[item.proposal.field]} : ${item.proposal.text}` : '',
  ].filter(Boolean);
  return `${who} · ${parts.join(' · ')}`;
}

/** Range un retour en note datée (date d'envoi des retours) sur son plan ou sa séquence. */
export function itemToNote(doc: ProjectDoc, fbId: Id, itemId: Id): ProjectDoc | null {
  const fb = doc.feedback.find((f) => f.id === fbId);
  const item = fb?.items.find((i) => i.id === itemId);
  if (!fb || !item) return null;
  const owner = itemOwner(doc, item);
  if (!owner) return null;
  const r = addNote(doc, owner, noteText(fb, item), fb.sentAt);
  return setItemState(r.doc, fbId, itemId, 'noted');
}
