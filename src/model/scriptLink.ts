/**
 * Scénario + tableau (0.17) : chaque plan est relié au passage de la scène que reprend son extrait.
 *
 * Un extrait est relié s'il se retrouve tel quel dans le texte de la scène (espaces et retours à la
 * ligne comptent pour un seul espace ; rien d'autre n'est deviné). S'il apparaît plusieurs fois, on
 * prend la première occurrence qui suit le plan précédent. Un extrait introuvable est signalé, jamais
 * rattaché « à peu près ».
 * Passages non couverts : le texte qu'aucun extrait ne reprend, sauf les blancs, la ponctuation seule
 * et les noms de personnage seuls sur leur ligne (en majuscules, comme dans un scénario).
 */
import { produce } from 'immer';
import type { Id, Plan, ProjectDoc, Sequence } from './types';
import { newPlan } from './defaults';

export interface PlanLink {
  planId: Id;
  start: number;
  end: number;
}

export interface SceneLinks {
  links: PlanLink[];
  /** Plans dont l'extrait n'est pas dans le texte de la scène. */
  notFound: Id[];
  /** Plans sans extrait (les reprises comprises). */
  empty: Id[];
}

/** Texte « aplati » (blancs réduits à un espace) et, pour chaque caractère, sa place dans l'original. */
function flatten(text: string): { flat: string; at: number[] } {
  let flat = '';
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (!space && flat.length) {
        flat += ' ';
        at.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    flat += ch;
    at.push(i);
  }
  return { flat, at };
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

export function linkScene(seq: Pick<Sequence, 'scriptText' | 'plans'>): SceneLinks {
  const out: SceneLinks = { links: [], notFound: [], empty: [] };
  const { flat, at } = flatten(seq.scriptText);
  let from = 0;
  for (const p of seq.plans) {
    const ex = squash(p.scriptExcerpt);
    if (!ex) {
      out.empty.push(p.id);
      continue;
    }
    let i = flat.indexOf(ex, from);
    if (i < 0) i = flat.indexOf(ex);
    if (i < 0) {
      out.notFound.push(p.id);
      continue;
    }
    const start = at[i]!;
    const end = at[i + ex.length - 1]! + 1;
    out.links.push({ planId: p.id, start, end });
    from = i;
  }
  return out;
}

export interface Segment {
  start: number;
  end: number;
  /** Plans qui reprennent ce morceau (vide = non couvert). */
  planIds: Id[];
  /** Morceau non couvert qui compte (du texte, pas un blanc ni un nom de personnage seul). */
  uncovered: boolean;
}

/** Une ligne en majuscules seule (nom de personnage, transition) : ne compte pas comme passage. */
function isCueOnly(s: string): boolean {
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => l.length <= 40 && /\p{L}/u.test(l) && l === l.toLocaleUpperCase('fr') && !/[.!?…]\s*$/.test(l.replace(/\(.*\)$/, '').trim()));
}

function counts(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s) && !isCueOnly(s);
}

/** Découpe le texte de la scène en morceaux couverts (par quels plans) et non couverts. */
export function sceneSegments(text: string, links: PlanLink[]): Segment[] {
  const cuts = new Set<number>([0, text.length]);
  for (const l of links) {
    cuts.add(l.start);
    cuts.add(l.end);
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const start = pts[k]!;
    const end = pts[k + 1]!;
    if (end <= start) continue;
    const planIds = links.filter((l) => l.start <= start && l.end >= end).map((l) => l.planId);
    out.push({ start, end, planIds, uncovered: !planIds.length && counts(text.slice(start, end)) });
  }
  return out;
}

/** Nombre de passages non couverts (morceaux de texte qu'aucun extrait ne reprend). */
export function uncoveredCount(seq: Pick<Sequence, 'scriptText' | 'plans'>): number {
  if (!seq.scriptText.trim()) return 0;
  return sceneSegments(seq.scriptText, linkScene(seq).links).filter((s) => s.uncovered).length;
}

/**
 * Nouveau plan pour un passage de la scène : son extrait est le passage, et il prend sa place dans
 * l'ordre du texte (après le dernier plan relié qui le précède, et ses reprises).
 */
export function addPlanForPassage(doc: ProjectDoc, seqId: Id, start: number, end: number): { doc: ProjectDoc; planId: Id } | null {
  const seq = doc.sequences.find((s) => s.id === seqId);
  if (!seq || end <= start) return null;
  const excerpt = seq.scriptText.slice(start, end).trim();
  if (!excerpt) return null;
  const links = linkScene(seq).links;
  const before = links.filter((l) => l.start <= start).map((l) => seq.plans.findIndex((p) => p.id === l.planId));
  let at = before.length ? Math.max(...before) + 1 : 0;
  while (at < seq.plans.length && seq.plans[at]!.repriseOf) at++;
  const cameraId = seq.plans[0]?.cameras[0]?.cameraId ?? doc.settings.cameras[0]!.id;
  const plan: Plan = { ...newPlan(cameraId), scriptExcerpt: excerpt };
  return {
    planId: plan.id,
    doc: produce(doc, (d) => {
      d.sequences.find((s) => s.id === seqId)!.plans.splice(at, 0, plan);
    }),
  };
}
