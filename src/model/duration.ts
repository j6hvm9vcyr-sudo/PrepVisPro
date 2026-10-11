/**
 * Durée des plans (à l'écran), en secondes entières.
 * Saisie : « 12 », « 12" », « 1'05 », « 1'05" », « 1:05 », « 1 min 5 », « 1 min » ; affichage : 12", 1'05".
 * Une reprise a la durée de son plan (elle redonne le même moment du film) : elle ne compte pas dans les totaux.
 */
import type { Plan, ProjectDoc, Sequence } from './types';

/** Plus long plan accepté : 2 h (au-delà, c'est une erreur de saisie). */
export const MAX_DURATION_S = 7200;

export type DurationParse = { ok: true; seconds: number | null } | { ok: false; error: string };

export function parseDuration(text: string): DurationParse {
  const t = text.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  if (!t) return { ok: true, seconds: null };
  let m: RegExpMatchArray | null;
  let s: number;
  if ((m = t.match(/^(\d{1,4})\s*(?:"|s|sec|secondes?)?$/))) s = Number(m[1]);
  else if ((m = t.match(/^(\d{1,3})\s*(?:'|:|min|mn|m)\s*(\d{1,2})?\s*(?:"|s|sec)?$/))) {
    const sec = m[2] === undefined ? 0 : Number(m[2]);
    if (sec > 59) return { ok: false, error: `${sec} secondes : au-delà de 59, comptez une minute de plus` };
    s = Number(m[1]) * 60 + sec;
  } else if ((m = t.match(/^(\d{1,3})\s*(?:min|mn|m)\s*(\d{1,2})\s*(?:s|sec)?$/))) s = Number(m[1]) * 60 + Number(m[2]);
  else return { ok: false, error: 'Durée non reconnue : 12 (secondes), 1\'05 ou 1:05' };
  if (s === 0) return { ok: false, error: 'Une durée de 0 seconde : laissez la case vide' };
  if (s > MAX_DURATION_S) return { ok: false, error: 'Plus de 2 heures : vérifiez la saisie' };
  return { ok: true, seconds: s };
}

/** 12" · 1'05" · 1h02'00" */
export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}"`;
  if (m) return `${m}'${String(sec).padStart(2, '0')}"`;
  return `${sec}"`;
}

/** Texte à retaper dans la case (« 1'05 », « 12 »). */
export function durationEditText(s: number | null): string {
  if (s === null) return '';
  return s >= 60 ? `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}` : String(s);
}

/** Durée d'un plan ; celle de son plan pour une reprise. */
export function planDuration(seq: Sequence, p: Plan): number | null {
  if (!p.repriseOf) return p.durationS;
  return seq.plans.find((x) => x.id === p.repriseOf)?.durationS ?? null;
}

export interface DurationTotal {
  seconds: number;
  /** Plans (hors reprises) encore sans durée. */
  missing: number;
  /** Plans (hors reprises) comptés. */
  counted: number;
}

/** Total d'une séquence, sans les reprises. */
export function sequenceDuration(seq: Sequence): DurationTotal {
  let seconds = 0;
  let missing = 0;
  let counted = 0;
  for (const p of seq.plans) {
    if (p.repriseOf) continue;
    if (p.durationS === null) missing++;
    else {
      seconds += p.durationS;
      counted++;
    }
  }
  return { seconds, missing, counted };
}

export function filmDuration(doc: ProjectDoc): DurationTotal {
  const t: DurationTotal = { seconds: 0, missing: 0, counted: 0 };
  for (const s of doc.sequences) {
    const d = sequenceDuration(s);
    t.seconds += d.seconds;
    t.missing += d.missing;
    t.counted += d.counted;
  }
  return t;
}

/** « 1'32" » ; « 1'32" (2 plans sans durée) » ; null si rien n'est minuté. */
export function totalLabel(t: DurationTotal): string | null {
  if (!t.counted) return null;
  return t.missing ? `${formatDuration(t.seconds)} (${t.missing} plan${t.missing > 1 ? 's' : ''} sans durée)` : formatDuration(t.seconds);
}
