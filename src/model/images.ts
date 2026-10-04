import type { ImageAsset, Plan, ProjectDoc } from './types';

/** Tous les fichiers du projet référencés par le document (images des plans, fonds et icônes des plans au sol). */
export function referencedFiles(doc: ProjectDoc): Set<string> {
  const out = new Set<string>();
  for (const s of doc.sequences) for (const p of s.plans) for (const i of p.images) out.add(i.file);
  for (const fp of doc.floorPlans) {
    if (fp.background) out.add(fp.background.file);
    // Icônes posées, et icônes des projecteurs, réflecteurs et personnages.
    for (const el of fp.elements) if ('icon' in el && el.icon) out.add(el.icon);
  }
  return out;
}

/**
 * Image principale d'un plan :
 * 1. celle choisie à la main, si elle existe encore ;
 * 2. sinon la première photo de repérage ;
 * 3. sinon la première référence ;
 * 4. sinon aucune.
 */
export function coverImage(plan: Plan): ImageAsset | null {
  if (plan.coverImageId) {
    const chosen = plan.images.find((i) => i.id === plan.coverImageId);
    if (chosen) return chosen;
  }
  return plan.images.find((i) => i.kind === 'scouting') ?? plan.images.find((i) => i.kind === 'reference') ?? null;
}
