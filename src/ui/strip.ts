import type { Sequence } from '../model/types';

/** Couleurs du plan de travail : INT jour blanc, EXT jour jaune, INT nuit bleu, EXT nuit vert. */
export function stripColors(s: Pick<Sequence, 'intExt' | 'dayNight'>): { fill: string; edge: string } {
  const ext = s.intExt !== 'INT';
  if (s.dayNight === 'JOUR') return ext ? { fill: '#f2d14b', edge: '#c9a92a' } : { fill: '#ffffff', edge: '#aeb5c1' };
  return ext ? { fill: '#3a9a5b', edge: '#2d7e49' } : { fill: '#3e6fd8', edge: '#2f59b5' };
}

export function sequenceTitle(s: Pick<Sequence, 'intExt' | 'dayNight' | 'location'>): string {
  return `${s.intExt}. ${(s.location || 'Décor à préciser').toUpperCase()} — ${s.dayNight}`;
}
