import { describe, expect, it } from 'vitest';
import { computeNumbers, repriseLetterFor } from './numbering';
import { doc, plan, seq } from './testkit';

describe('numérotation', () => {
  it('numérote séquence/plan et numéro général dans l’ordre du film', () => {
    const d = doc((c) => [seq('1', [plan(c), plan(c)]), seq('3A', [plan(c), plan(c), plan(c)])]);
    const n = computeNumbers(d);
    const codes = d.sequences.flatMap((s) => s.plans.map((p) => `${n.get(p.id)!.global}:${n.get(p.id)!.code}`));
    expect(codes).toEqual(['1:1/1', '2:1/2', '3:3A/1', '4:3A/2', '5:3A/3']);
  });

  it('numérote les reprises B, C… sans décaler les plans suivants', () => {
    const d = doc((c) => {
      const a = plan(c);
      const b = plan(c);
      return [seq('4', [a, b, plan(c, { repriseOf: b.id }), plan(c, { repriseOf: b.id }), plan(c), plan(c, { repriseOf: a.id })])];
    });
    const n = computeNumbers(d);
    expect(d.sequences[0]!.plans.map((p) => n.get(p.id)!.code)).toEqual(['4/1', '4/2', '4/2B', '4/2C', '4/3', '4/1B']);
    expect(d.sequences[0]!.plans.map((p) => n.get(p.id)!.global)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('traite comme un plan normal une reprise placée avant son origine', () => {
    const d = doc((c) => {
      const a = plan(c);
      return [seq('2', [plan(c, { repriseOf: a.id }), a])];
    });
    const n = computeNumbers(d);
    expect(d.sequences[0]!.plans.map((p) => n.get(p.id)!.code)).toEqual(['2/1', '2/2']);
  });

  it('ignore une reprise qui renvoie à une autre séquence', () => {
    const d = doc((c) => {
      const a = plan(c);
      return [seq('1', [a]), seq('2', [plan(c, { repriseOf: a.id })])];
    });
    const n = computeNumbers(d);
    expect(n.get(d.sequences[1]!.plans[0]!.id)!.code).toBe('2/1');
  });

  it('ne fait pas une reprise de reprise', () => {
    const d = doc((c) => {
      const a = plan(c);
      const r = plan(c, { repriseOf: a.id });
      return [seq('5', [a, r, plan(c, { repriseOf: r.id })])];
    });
    const n = computeNumbers(d);
    expect(d.sequences[0]!.plans.map((p) => n.get(p.id)!.code)).toEqual(['5/1', '5/1B', '5/2']);
  });

  it('lettres de reprise', () => {
    expect(repriseLetterFor(2)).toBe('B');
    expect(repriseLetterFor(26)).toBe('Z');
    expect(repriseLetterFor(27)).toBe('AA');
  });
});
