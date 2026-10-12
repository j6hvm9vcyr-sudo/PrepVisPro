import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { dayStrip, minutesToTime, planLocation, planSun, shadowLength, sunForCamera } from './sunPlan';
import { sunDay } from './sun';
import { addFloorPlan, newFloorPlan } from './floorOps';
import { doc, plan, seq } from './testkit';
import { sunLegend } from '../floor/render';

const PARIS = { lat: 48.8566, lon: 2.3522 };

function build(gps: (typeof PARIS | null)[]) {
  let d = doc((c) => gps.map((_, i) => seq(String(i + 1), [plan(c)])));
  d = produce(d, (x) => {
    x.settings.timeZone = 'Europe/Paris';
    gps.forEach((g, i) => void (x.sequences[i]!.gps = g));
  });
  const fp = { ...newFloorPlan('Rue', d.sequences.map((s) => s.id)), northDeg: 0, sunAt: { date: '2026-06-21', time: '14:00' } };
  d = addFloorPlan(d, fp);
  return { d, fp: d.floorPlans[0]! };
}

describe('soleil sur le plan au sol', () => {
  it('position du décor : celle des séquences, refusée si elles diffèrent', () => {
    const one = build([PARIS, null]);
    expect(planLocation(one.d, one.fp)).toEqual({ ok: true, point: PARIS });
    const mixed = build([PARIS, { lat: 43.3, lon: 5.37 }]);
    expect(planLocation(mixed.d, mixed.fp)).toEqual({ ok: false, reason: 'mixed' });
    const none = build([null]);
    expect(planSun(none.d, none.fp)).toEqual({ ok: false, reason: 'none' });
  });
  it('Paris, 21 juin 2026, 14 h : comme NREL SPA (azimut 184,05°, hauteur apparente 64,54°)', () => {
    const { d, fp } = build([PARIS]);
    const s = planSun(d, fp);
    if (!s.ok) throw new Error('attendu');
    expect(s.pos.azimuth).toBeCloseTo(184.05, 1);
    expect(s.pos.elevation).toBeCloseTo(64.54, 1);
    // Nord à 90° sur le plan : le soleil est à 90 + 184 = 274° du plan.
    const s2 = planSun(d, { ...fp, northDeg: 90 });
    if (!s2.ok) throw new Error('attendu');
    expect(s2.planBearing).toBeCloseTo(274.05, 1);
    expect(planSun(d, { ...fp, northDeg: null }).ok && (planSun(d, { ...fp, northDeg: null }) as { planBearing: null }).planBearing).toBeNull();
  });
  it('heure qui n’existe pas : signalée', () => {
    const { d, fp } = build([PARIS]);
    expect(planSun(d, { ...fp, sunAt: { date: '2026-03-29', time: '02:30' } })).toEqual({ ok: false, reason: 'bad-time' });
  });
  it('ombre portée', () => {
    expect(shadowLength(1.8, 45)).toBeCloseTo(1.8);
    expect(shadowLength(1.8, 30)).toBeCloseTo(3.118, 2);
    expect(shadowLength(1.8, -2)).toBeNull();
  });
  it('soleil et axe caméra', () => {
    expect(sunForCamera(0, 0, 30)).toBe('contre-jour');
    expect(sunForCamera(0, 180, 30)).toBe('de face (soleil dans le dos de la caméra)');
    expect(sunForCamera(0, 90, 30)).toBe('latéral, à droite');
    expect(sunForCamera(0, 270, 30)).toBe('latéral, à gauche');
    expect(sunForCamera(90, 140, 30)).toBe('trois-quarts contre, à droite');
    expect(sunForCamera(0, 0, 70)).toBe('contre-jour (soleil haut)');
    expect(sunForCamera(0, 0, -1)).toBeNull();
  });
  it('légende des exports', () => {
    const { d, fp } = build([PARIS]);
    expect(sunLegend(d, fp)).toMatch(/^Soleil le 21 juin 2026 à 14:00 \(Europe\/Paris\) : direction 184° \(S\), hauteur 65° · lever 05:47, coucher 21:58$/);
    expect(sunLegend(d, { ...fp, sunAt: null })).toBeNull();
  });
});

describe('réglette des heures (0.19)', () => {
  it('une tranche par quart d’heure ; nuit, crépuscule, heure dorée et jour dans l’ordre, aux heures de sunDay', () => {
    const strip = dayStrip('2026-06-21', 'Europe/Paris', PARIS);
    expect(strip).toHaveLength(96);
    expect(strip[0]).toEqual({ minute: 0, phase: 'night' });
    expect(strip.find((x) => x.minute === 13 * 60)!.phase).toBe('day');
    // Les changements de moment se suivent dans l'ordre attendu, le matin puis le soir.
    const changes = strip.map((x) => x.phase).filter((v, i, a) => i === 0 || v !== a[i - 1]);
    expect(changes).toEqual(['night', 'twilight', 'golden', 'day', 'golden', 'twilight', 'night']);
    // Le début du jour sur la réglette suit la fin de l'heure dorée du matin calculée par sunDay (au quart d'heure près).
    const day = sunDay('2026-06-21', 'Europe/Paris', PARIS)!;
    const firstDay = strip.find((x) => x.phase === 'day')!.minute;
    const goldenEnd = new Date(day.goldenMorning[1]!).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    const [h, m] = goldenEnd.split(':').map(Number);
    expect(firstDay - (h! * 60 + m!)).toBeGreaterThanOrEqual(0);
    expect(firstDay - (h! * 60 + m!)).toBeLessThan(15);
  });

  it('passage à l’heure d’été : les heures qui n’existent pas sont signalées, pas inventées', () => {
    const strip = dayStrip('2026-03-29', 'Europe/Paris', PARIS);
    expect(strip.filter((x) => x.phase === null).map((x) => minutesToTime(x.minute))).toEqual(['02:00', '02:15', '02:30', '02:45']);
  });
});
