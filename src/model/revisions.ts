/**
 * Révisions colorées (0.21) : chaque publication porte la couleur de révision des scénarios, dans
 * l'ordre standard de la WGA West (repris par Final Draft) : blanche (non révisée), bleue, rose,
 * jaune, verte, dorée (goldenrod), chamois (buff), saumon, cerise, puis « 2e bleue »… Les couleurs
 * affichées (hex) sont des teintes d'écran, pas une norme.
 * Source : https://kb.finaldraft.com/hc/en-us/articles/15575314119316 (« standard revision set colors »).
 * Un plan ajouté ou modifié depuis la publication précédente est marqué « * », comme les lignes révisées d'un scénario.
 */
import type { Id, ProjectDoc } from './types';
import { compareDocs } from './diff';

const CYCLE: { name: string; hex: string }[] = [
  { name: 'bleue', hex: '#8DB4F2' },
  { name: 'rose', hex: '#F4B6C6' },
  { name: 'jaune', hex: '#F4E38A' },
  { name: 'verte', hex: '#A8D8A8' },
  { name: 'dorée', hex: '#E3B84B' },
  { name: 'chamois', hex: '#E8D3A9' },
  { name: 'saumon', hex: '#F2A08A' },
  { name: 'cerise', hex: '#D9536F' },
];

/** Couleur de la publication n (1 = blanche). */
export function revisionColor(n: number): { name: string; hex: string } {
  if (n <= 1) return { name: 'blanche', hex: '#FFFFFF' };
  const k = n - 2;
  const turn = Math.floor(k / CYCLE.length);
  const c = CYCLE[k % CYCLE.length]!;
  return { name: turn ? `${turn + 1}e ${c.name}` : c.name, hex: c.hex };
}

/** Révision écrite sur les documents : « révision bleue ». */
export function revisionName(n: number): string {
  return `révision ${revisionColor(n).name}`;
}

/** Changements d'un plan depuis la publication précédente (« avant → après », par réglage). */
export interface PlanRevision {
  status: 'added' | 'changed';
  changes: { label: string; from: string; to: string }[];
}

/** Plans ajoutés ou modifiés entre deux états du projet (les retirés ne sont plus dans le découpage). */
export function revisedPlans(before: ProjectDoc, after: ProjectDoc): Map<Id, PlanRevision> {
  const out = new Map<Id, PlanRevision>();
  for (const s of compareDocs(before, after).sequences)
    for (const p of s.plans) if (p.status !== 'removed') out.set(p.id, { status: p.status, changes: p.changes });
  return out;
}
