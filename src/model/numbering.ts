import type { Id, ProjectDoc } from './types';

export interface PlanNumber {
  /** Numéro général dans le film, à partir de 1. */
  global: number;
  /** Numéro séquence/plan : « 4/2 », ou « 4/2B » pour une reprise. */
  code: string;
  /** Position du plan dans sa séquence (non-reprises), à partir de 1. */
  index: number;
  /** Lettre de reprise (« B », « C »…) ou chaîne vide. */
  repriseLetter: string;
}

/**
 * Calcule la numérotation de tout le film.
 *
 * Règles :
 * - Le numéro général compte tous les plans, reprises comprises, dans l'ordre du film.
 * - Dans une séquence, les plans qui ne sont pas des reprises sont numérotés 1, 2, 3…
 * - Une reprise prend le code de son plan d'origine suivi d'une lettre : B, C, D…
 *   dans l'ordre où les reprises apparaissent.
 * - Une reprise dont le plan d'origine est introuvable, dans une autre séquence, ou placé APRÈS elle
 *   est numérotée comme un plan normal (aucune référence pendante).
 */
export function computeNumbers(doc: ProjectDoc): Map<Id, PlanNumber> {
  const out = new Map<Id, PlanNumber>();
  let global = 0;
  for (const seq of doc.sequences) {
    let index = 0;
    const repriseCount = new Map<Id, number>();
    const seen = new Set<Id>();
    for (const plan of seq.plans) {
      global += 1;
      // Le plan d'origine doit être dans la même séquence et avant la reprise.
      const parent = plan.repriseOf && seen.has(plan.repriseOf) ? out.get(plan.repriseOf) : undefined;
      seen.add(plan.id);
      if (parent && parent.repriseLetter === '') {
        const n = (repriseCount.get(plan.repriseOf!) ?? 1) + 1;
        repriseCount.set(plan.repriseOf!, n);
        const letter = repriseLetterFor(n);
        out.set(plan.id, { global, code: parent.code + letter, index: parent.index, repriseLetter: letter });
      } else {
        index += 1;
        out.set(plan.id, { global, code: `${seq.number}/${index}`, index, repriseLetter: '' });
      }
    }
  }
  return out;
}

/** 2 → B, 3 → C, … 26 → Z, 27 → AA (cas extrême, mais jamais d'erreur). */
export function repriseLetterFor(n: number): string {
  let k = n - 1; // 1 → A (plan d'origine), donc 2 → B
  let s = '';
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}
