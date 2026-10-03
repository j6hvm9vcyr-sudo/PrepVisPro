import type { ImageAsset, Plan } from './types';

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
