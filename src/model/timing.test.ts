import { describe, expect, it } from 'vitest';
import { applyTimings, clock, doneCount, IDLE, lapsMs, plansToTime, press, roundSeconds, togglePause, undoMark } from './timing';
import { sampleProject } from './sample';

describe('minuter à la lecture', () => {
  it('espace : démarre, puis chaque appui termine un plan ; le dernier arrête le chronomètre', () => {
    let s = press(IDLE, 1000, 3);
    expect(s.marks).toEqual([0]);
    s = press(s, 3500, 3);
    s = press(s, 4200, 3);
    expect(doneCount(s)).toBe(2);
    s = press(s, 10_000, 3);
    expect(lapsMs(s)).toEqual([2500, 700, 5800]);
    expect(s.runningSince).toBeNull();
    // Rien de plus après le dernier plan.
    expect(press(s, 12_000, 3)).toBe(s);
  });

  it('la pause n’est pas comptée ; espace en pause reprend sans passage', () => {
    let s = press(IDLE, 0, 2);
    s = togglePause(s, 2000);
    expect(clock(s, 9000)).toBe(2000);
    s = press(s, 9000, 2);
    expect(s.marks).toEqual([0]);
    s = press(s, 10_000, 2);
    expect(lapsMs(s)).toEqual([3000]);
  });

  it('⌫ annule le dernier passage : le plan précédent garde tout le temps écoulé', () => {
    let s = press(IDLE, 0, 3);
    s = press(s, 1000, 3); // trop tôt
    s = undoMark(s, 1500, 3);
    s = press(s, 4000, 3);
    expect(lapsMs(s)).toEqual([4000]);
    // Après la fin : ⌫ relance le dernier plan, depuis là où il s'était arrêté.
    s = press(s, 6000, 3);
    s = press(s, 7000, 3);
    expect(s.runningSince).toBeNull();
    s = undoMark(s, 20_000, 3);
    expect(doneCount(s)).toBe(2);
    s = press(s, 21_000, 3);
    expect(lapsMs(s)).toEqual([4000, 2000, 2000]);
    expect(undoMark(press(IDLE, 0, 3), 5, 3)).toEqual(IDLE);
  });

  it('secondes retenues : arrondi, au moins 1 s', () => {
    expect(roundSeconds(2499)).toBe(2);
    expect(roundSeconds(2500)).toBe(3);
    expect(roundSeconds(200)).toBe(1);
  });

  it('les reprises ne sont ni minutées ni modifiées', () => {
    const doc = sampleProject();
    const seq = doc.sequences[0]!;
    const plans = plansToTime(seq);
    expect(plans.map((p) => p.id)).toEqual(seq.plans.filter((p) => !p.repriseOf).map((p) => p.id));
    expect(plans).toHaveLength(3);
    const reprise = seq.plans.find((p) => p.repriseOf)!;
    const next = applyTimings(doc, seq.id, { [plans[0]!.id]: 11, [reprise.id]: 99 });
    expect(next.sequences[0]!.plans[0]!.durationS).toBe(11);
    expect(next.sequences[0]!.plans.find((p) => p.repriseOf)!.durationS).toBeNull();
  });
});
