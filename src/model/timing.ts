/**
 * Minuter à la lecture : on lit la séquence et on appuie sur espace à chaque changement de plan.
 *
 * Le chronomètre est « virtuel » : il ne compte pas les pauses. Chaque appui ajoute un passage
 * (instant virtuel) ; la durée d'un plan est l'écart entre deux passages. Annuler le dernier
 * passage (⌫) rend au plan précédent tout le temps écoulé depuis : on avait appuyé trop tôt.
 * Les reprises ne sont pas minutées : elles ont la durée de leur plan.
 */
import { produce } from 'immer';
import type { Id, Plan, ProjectDoc, Sequence } from './types';
import { MAX_DURATION_S } from './duration';

/** Plans à minuter, dans l'ordre du découpage (sans les reprises). */
export function plansToTime(seq: Sequence): Plan[] {
  return seq.plans.filter((p) => !p.repriseOf);
}

export interface TimingState {
  /** Instants virtuels (ms) des passages : le premier démarre le premier plan. */
  marks: number[];
  /** Temps virtuel accumulé jusqu'à la dernière pause (ms). */
  banked: number;
  /** Instant réel (ms) de la dernière reprise ; null = en pause (ou pas commencé). */
  runningSince: number | null;
}

export const IDLE: TimingState = { marks: [], banked: 0, runningSince: null };

/** Temps virtuel à l'instant réel `now`. */
export function clock(s: TimingState, now: number): number {
  return s.banked + (s.runningSince === null ? 0 : now - s.runningSince);
}

/** Nombre de plans déjà terminés (le plan en cours est celui d'après). */
export function doneCount(s: TimingState): number {
  return Math.max(0, s.marks.length - 1);
}

/** Espace : démarre, ou termine le plan en cours et passe au suivant. */
export function press(s: TimingState, now: number, planCount: number): TimingState {
  if (s.marks.length > planCount) return s;
  if (!s.marks.length) return { marks: [0], banked: 0, runningSince: now };
  // En pause, espace reprend sans compter de passage.
  if (s.runningSince === null) return { ...s, runningSince: now };
  const t = clock(s, now);
  const marks = [...s.marks, t];
  // Dernier plan terminé : le chronomètre s'arrête.
  if (marks.length > planCount) return { marks, banked: t, runningSince: null };
  return { ...s, marks };
}

/** ⌫ : annule le dernier passage (le plan précédent reprend, sans perdre de temps). */
export function undoMark(s: TimingState, now: number, planCount: number): TimingState {
  if (s.marks.length <= 1) return IDLE;
  const finished = s.marks.length > planCount;
  const marks = s.marks.slice(0, -1);
  // Annuler la fin du dernier plan : il repart, depuis l'instant où on l'avait arrêté.
  return finished ? { marks, banked: s.banked, runningSince: now } : { ...s, marks };
}

export function togglePause(s: TimingState, now: number): TimingState {
  if (!s.marks.length) return s;
  if (s.runningSince === null) return { ...s, runningSince: now };
  return { ...s, banked: clock(s, now), runningSince: null };
}

/** Durées mesurées (ms) des plans terminés. */
export function lapsMs(s: TimingState): number[] {
  const out: number[] = [];
  for (let i = 1; i < s.marks.length; i++) out.push(s.marks[i]! - s.marks[i - 1]!);
  return out;
}

/** Secondes entières retenues pour une durée mesurée (au moins 1 s). */
export function roundSeconds(ms: number): number {
  return Math.min(MAX_DURATION_S, Math.max(1, Math.round(ms / 1000)));
}

/** Écrit les durées retenues (plan → secondes) ; les reprises ne sont jamais touchées. */
export function applyTimings(doc: ProjectDoc, seqId: Id, durations: Record<Id, number>): ProjectDoc {
  return produce(doc, (d) => {
    const seq = d.sequences.find((s) => s.id === seqId);
    if (!seq) return;
    for (const p of seq.plans) {
      const v = durations[p.id];
      if (v !== undefined && !p.repriseOf) p.durationS = v;
    }
  });
}
