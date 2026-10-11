import { describe, expect, it } from 'vitest';
import { durationEditText, filmDuration, formatDuration, parseDuration, planDuration, sequenceDuration, totalLabel } from './duration';
import { sampleProject } from './sample';
import { produce } from 'immer';

describe('durée des plans', () => {
  it('lit les écritures courantes', () => {
    const ok = (t: string) => {
      const r = parseDuration(t);
      return r.ok ? r.seconds : r.error;
    };
    expect(ok('12')).toBe(12);
    expect(ok('12"')).toBe(12);
    expect(ok('12 s')).toBe(12);
    expect(ok("1'05")).toBe(65);
    expect(ok("1'05\"")).toBe(65);
    expect(ok('1’05”')).toBe(65);
    expect(ok("1''")).toBe(1);
    expect(ok('1:05')).toBe(65);
    expect(ok("2'")).toBe(120);
    expect(ok('1 min 5')).toBe(65);
    expect(ok('3 min')).toBe(180);
    expect(ok('')).toBeNull();
    expect(ok("1'75")).toMatch(/59/);
    expect(ok('0')).toMatch(/vide/);
    expect(ok('9000')).toMatch(/2 heures/);
    expect(ok('douze')).toMatch(/non reconnue/);
    expect(ok('1,5')).toMatch(/non reconnue/);
  });

  it('affiche à la façon d’un découpage', () => {
    expect(formatDuration(12)).toBe('12"');
    expect(formatDuration(65)).toBe('1\'05"');
    expect(formatDuration(3725)).toBe('1h02\'05"');
    expect(durationEditText(65)).toBe("1'05");
    expect(durationEditText(12)).toBe('12');
    expect(durationEditText(null)).toBe('');
    // Ce qu'on affiche à retaper se relit à l'identique.
    for (const s of [1, 59, 60, 61, 599, 3600, 7200]) expect(parseDuration(durationEditText(s))).toEqual({ ok: true, seconds: s });
  });

  it('une reprise a la durée de son plan et ne compte pas dans les totaux', () => {
    const doc = produce(sampleProject(), (d) => {
      const [a, b, c] = d.sequences[0]!.plans;
      a!.durationS = 8;
      b!.durationS = 4;
      c!.durationS = 70;
    });
    const s = doc.sequences[0]!;
    const reprise = s.plans[3]!;
    expect(reprise.repriseOf).toBe(s.plans[1]!.id);
    expect(planDuration(s, reprise)).toBe(4);
    expect(sequenceDuration(s)).toEqual({ seconds: 82, missing: 0, counted: 3 });
    expect(totalLabel(sequenceDuration(s))).toBe('1\'22"');
    const f = filmDuration(doc);
    expect(f.counted).toBe(3);
    expect(f.missing).toBe(4);
    expect(totalLabel(f)).toBe('1\'22" (4 plans sans durée)');
    expect(totalLabel(sequenceDuration(doc.sequences[1]!))).toBeNull();
  });
});
