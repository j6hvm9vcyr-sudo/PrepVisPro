import { describe, expect, it } from 'vitest';
import { dropTarget } from './dragList';

describe('dropTarget', () => {
  it('position finale selon la ligne survolée et le côté', () => {
    // Liste A B C D ; on déplace A (0).
    expect(dropTarget(0, 2, 'after')).toBe(2); // après C → B C A D
    expect(dropTarget(0, 2, 'before')).toBe(1); // avant C → B A C D
    expect(dropTarget(0, 0, 'after')).toBe(0); // sur soi-même : rien ne bouge
    // On déplace D (3).
    expect(dropTarget(3, 0, 'before')).toBe(0);
    expect(dropTarget(3, 1, 'after')).toBe(2);
    expect(dropTarget(3, 3, 'before')).toBe(3);
  });
});
