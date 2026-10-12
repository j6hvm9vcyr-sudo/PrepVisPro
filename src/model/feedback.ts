/**
 * Retours (0.21) : le découpage interactif publié laisse chaque destinataire annoter les plans
 * (validé, à revoir, un mot, une valeur proposée) puis enregistrer ses retours dans un fichier
 * `.topshot-retours`. Topshot le relit, le range avec le projet, et chaque retour devient, au choix,
 * une note datée ou une saisie dans le tableau (toujours validée à la main).
 */
import { produce } from 'immer';
import { z } from 'zod';
import type { Feedback, FeedbackItem, Id, ProjectDoc } from './types';
import { FEEDBACK_FIELDS } from './types';
import { addNote } from './notes';
import { FIELD_LABEL } from './entry';

export const RETOURS_EXT = 'topshot-retours';
/** Au-delà, ce n'est pas un fichier de retours. */
export const RETOURS_MAX_BYTES = 2 * 1024 * 1024;

/** Fichier écrit par le découpage interactif (version 1). */
const fileSchema = z.object({
  topshotRetours: z.literal(1),
  id: z.string().min(1).max(100),
  projectId: z.string().min(1),
  publication: z.number().int().positive(),
  author: z.string().max(200),
  role: z.string().max(200),
  sentAt: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        planId: z.string().min(1).nullable(),
        seqId: z.string().min(1).nullable(),
        code: z.string().max(50),
        verdict: z.enum(['ok', 'revoir']).nullable(),
        text: z.string().max(5000),
        proposal: z.object({ setupId: z.string().min(1).nullable(), field: z.enum(FEEDBACK_FIELDS), text: z.string().max(500), before: z.string().max(500) }).nullable(),
      }),
    )
    .max(5000),
});

export type RetoursFile = z.infer<typeof fileSchema>;

export type ReadResult = { ok: true; feedback: Feedback } | { ok: false; error: string };

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
  const items = f.items.filter((i) => i.verdict || i.text.trim() || i.proposal);
  if (new Set(items.map((i) => i.id)).size !== items.length) return { ok: false, error: 'Ce fichier de retours est abîmé (retour en double).' };
  return {
    ok: true,
    feedback: {
      id: f.id,
      author: f.author.trim() || 'Sans nom',
      role: f.role.trim(),
      publication: f.publication,
      sentAt: f.sentAt,
      receivedAt: now,
      items: items.map((i) => ({ ...i, text: i.text.trim(), state: 'new' as const })),
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
    if (it) it.state = state;
  });
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
  const parts = [item.verdict === 'ok' ? 'validé' : item.verdict === 'revoir' ? 'à revoir' : '', item.text, item.proposal ? `propose ${FIELD_LABEL[item.proposal.field]} : ${item.proposal.text}` : ''].filter(Boolean);
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
