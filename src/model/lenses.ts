/** Optiques du projet : focales disponibles, focale « hors série », optique la plus proche. */
import type { LensSeries } from './types';
import { formatNumber, parseDecimal } from './text';

/** « 18 25 35 50,75 / 100 » → [18, 25, 35, 50, 75, 100] (« 50,75 » se lit comme 50 et 75 seulement s'il y a un espace). */
export function parseFocalList(text: string): number[] | null {
  const parts = text
    .replace(/mm/gi, ' ')
    .split(/[\s;/]+|,\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const v = parseDecimal(p);
    if (v === null || !(v > 0) || v > 2000) return null;
    out.push(v);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function lensLabel(l: LensSeries): string {
  if (l.kind === 'zoom') return `${l.name || 'Zoom'} ${l.min !== null && l.max !== null ? `${formatNumber(l.min)}-${formatNumber(l.max)} mm` : ''}`.trim();
  return `${l.name || 'Fixes'} ${l.focals.map(formatNumber).join(', ')} mm`.trim();
}

/** Focales fixes disponibles (toutes séries), triées. */
export function kitFocals(lenses: readonly LensSeries[]): number[] {
  return [...new Set(lenses.flatMap((l) => (l.kind === 'primes' ? l.focals : [])))].sort((a, b) => a - b);
}

/** La focale existe-t-elle dans les optiques du projet ? true s'il n'y a aucune optique déclarée. */
export function inKit(lenses: readonly LensSeries[], f: number): boolean {
  if (!lenses.length) return true;
  return lenses.some((l) => (l.kind === 'primes' ? l.focals.some((x) => Math.abs(x - f) < 0.01) : l.min !== null && l.max !== null && f >= l.min - 0.01 && f <= l.max + 0.01));
}

export interface LensChoice {
  focal: number;
  /** Série qui la fournit (« Supreme Prime », « Zoom Angénieux 24-290 »). */
  series: string;
}

/** Optique du projet la plus proche d'une focale idéale (le zoom donne la focale exacte s'il la couvre). */
export function nearestLens(lenses: readonly LensSeries[], ideal: number): LensChoice | null {
  let best: { c: LensChoice; d: number } | null = null;
  const consider = (focal: number, series: string) => {
    // Écart relatif : passer de 25 à 32 compte autant que de 50 à 64.
    const d = Math.abs(Math.log(focal / ideal));
    if (!best || d < best.d - 1e-9) best = { c: { focal, series }, d };
  };
  for (const l of lenses) {
    if (l.kind === 'primes') l.focals.forEach((f) => consider(f, l.name || 'Fixes'));
    else if (l.min !== null && l.max !== null) consider(Math.min(l.max, Math.max(l.min, Math.round(ideal))), lensLabel(l));
  }
  return (best as { c: LensChoice } | null)?.c ?? null;
}
