/** Synthèse d'une séquence, calculée à partir de ses plans (pour le dépouillement). */
import type { Sequence } from './types';
import { formatNumber } from './text';

export interface SequenceSummary {
  focals: string;
  grip: string;
  movements: string;
}

export function summarizeSequence(s: Sequence): SequenceSummary {
  const focals = new Set<number>();
  const grip: string[] = [];
  const movements: string[] = [];
  for (const p of s.plans)
    for (const c of p.cameras) {
      if (c.start.focalMm !== null) focals.add(c.start.focalMm);
      if (c.end?.focalMm != null) focals.add(c.end.focalMm);
      for (const g of c.grip) if (!grip.includes(g)) grip.push(g);
      for (const m of c.movements) if (!movements.includes(m)) movements.push(m);
    }
  const f = [...focals].sort((a, b) => a - b).map(formatNumber);
  return { focals: f.length ? `${f.join(', ')} mm` : '', grip: grip.join(', '), movements: movements.join(', ') };
}
