import { describe, expect, it } from 'vitest';
import { inKit, kitFocals, nearestLens, parseFocalList } from './lenses';
import type { LensSeries } from './types';

const primes: LensSeries = { id: 'a', name: 'Supreme', kind: 'primes', focals: [18, 25, 35, 50, 75, 100], min: null, max: null };
const zoom: LensSeries = { id: 'b', name: 'Optimo', kind: 'zoom', focals: [], min: 24, max: 290 };

describe('optiques du projet', () => {
  it('lecture d’une liste de focales', () => {
    expect(parseFocalList('18 25 35mm, 50 / 75')).toEqual([18, 25, 35, 50, 75]);
    expect(parseFocalList('12,5 18')).toEqual([12.5, 18]);
    expect(parseFocalList('18 abc')).toBeNull();
  });
  it('focale dans la série ou couverte par le zoom', () => {
    expect(inKit([], 33)).toBe(true);
    expect(inKit([primes], 35)).toBe(true);
    expect(inKit([primes], 32)).toBe(false);
    expect(inKit([primes, zoom], 120)).toBe(true);
    expect(kitFocals([primes, zoom])).toEqual([18, 25, 35, 50, 75, 100]);
  });
  it('optique la plus proche (écart relatif), zoom exact', () => {
    expect(nearestLens([primes], 44)).toEqual({ focal: 50, series: 'Supreme' });
    expect(nearestLens([primes], 21)).toEqual({ focal: 18, series: 'Supreme' });
    expect(nearestLens([primes, zoom], 130)!.focal).toBe(130);
    expect(nearestLens([], 50)).toBeNull();
  });
});
