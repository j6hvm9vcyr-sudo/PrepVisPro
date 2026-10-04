import { describe, expect, it } from 'vitest';
import { compassName, localToUtc, parseCoordinates, sunDay, sunPosition, utcToLocal } from './sun';
import ref from './sun.reference.json';

/** Écart angulaire (degrés) entre deux azimuts. */
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('position du soleil — comparée à NREL SPA (pvlib 0.16)', () => {
  it.each(ref.pos)('$place $local', (r) => {
    const p = sunPosition(r.utcMs, { lat: r.lat, lon: r.lon });
    expect(Math.abs(p.trueElevation - r.trueEl)).toBeLessThan(0.05);
    // Réfraction moyenne, comparée à SPA à 1013 hPa, 10 °C. Sous l'horizon, SPA n'en compte plus : pas de comparaison.
    if (r.trueEl > 0) expect(Math.abs(p.elevation - r.el)).toBeLessThan(r.trueEl > 2 ? 0.05 : 0.2);
    // L'azimut n'a de sens précis que si le soleil n'est pas au zénith.
    if (r.trueEl < 85) expect(angDiff(p.azimuth, r.az)).toBeLessThan(0.05);
  });
});

// Référence : instants où la hauteur SPA vaut −0,833° (et son maximum), trouvés par dichotomie sur
// la position SPA elle-même ; la fonction approchée de lever/coucher de pvlib s'écarte jusqu'à 80 s.
describe('lever, coucher, midi solaire — comparés à NREL SPA', () => {
  it.each(ref.days)('$place $date', (r) => {
    const d = sunDay(r.date, r.tz, { lat: r.lat, lon: r.lon })!;
    expect(d).not.toBeNull();
    const near = (ours: number | null, theirs: number | null) => {
      if (theirs === null) return;
      expect(ours).not.toBeNull();
      expect(Math.abs(ours! - theirs) / 60000).toBeLessThan(1);
    };
    // SPA donne les événements du jour civil autour de minuit local : on ne compare que ceux du même jour légal.
    const sameDay = (t: number | null) => t !== null && utcToLocal(t, r.tz).date === r.date;
    if (sameDay(r.sunrise)) near(d.sunrise, r.sunrise);
    if (sameDay(r.sunset)) near(d.sunset, r.sunset);
    if (sameDay(r.transit)) near(d.noon, r.transit);
  });
  it('jour et nuit polaires', () => {
    const north = { lat: 78.22, lon: 15.65 }; // Longyearbyen
    expect(sunDay('2026-06-21', 'Arctic/Longyearbyen', north)!.polar).toBe('day');
    expect(sunDay('2026-12-21', 'Arctic/Longyearbyen', north)!.polar).toBe('night');
    expect(sunDay('2026-06-21', 'Europe/Paris', { lat: 48.8566, lon: 2.3522 })!.polar).toBeNull();
  });
  it('heure dorée : le soir, de 6° de hauteur à −4°', () => {
    const p = { lat: 48.8566, lon: 2.3522 };
    const d = sunDay('2026-06-21', 'Europe/Paris', p)!;
    const [a, b] = d.goldenEvening;
    expect(sunPosition(a!, p).elevation).toBeCloseTo(6, 2);
    expect(sunPosition(b!, p).elevation).toBeCloseTo(-4, 2);
    expect(a!).toBeLessThan(d.sunset!);
    expect(b!).toBeGreaterThan(d.sunset!);
  });
});

describe('heure légale', () => {
  it('heure d’été et d’hiver à Paris', () => {
    expect(new Date(localToUtc('2026-06-21', '14:00', 'Europe/Paris')!).toISOString()).toBe('2026-06-21T12:00:00.000Z');
    expect(new Date(localToUtc('2026-12-21', '14:00', 'Europe/Paris')!).toISOString()).toBe('2026-12-21T13:00:00.000Z');
    expect(utcToLocal(Date.UTC(2026, 5, 21, 12, 0), 'Europe/Paris')).toEqual({ date: '2026-06-21', time: '14:00' });
  });
  it('heure inexistante (passage à l’heure d’été) : refusée', () => {
    expect(localToUtc('2026-03-29', '02:30', 'Europe/Paris')).toBeNull();
    expect(localToUtc('2026-03-29', '03:30', 'Europe/Paris')).not.toBeNull();
    expect(localToUtc('2026-13-01', '10:00', 'Europe/Paris')).toBeNull();
  });
});

describe('saisie des coordonnées', () => {
  it('formats courants', () => {
    expect(parseCoordinates('48.8584, 2.2945')).toEqual({ lat: 48.8584, lon: 2.2945 });
    expect(parseCoordinates('48,8584 2,2945')).toEqual({ lat: 48.8584, lon: 2.2945 });
    expect(parseCoordinates('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lon: 151.2093 });
    const dms = parseCoordinates('48°51\'30.2"N 2°17\'40.2"E')!;
    expect(dms.lat).toBeCloseTo(48.85839, 4);
    expect(dms.lon).toBeCloseTo(2.29450, 4);
    expect(parseCoordinates('34°03\'08"N 118°14\'37"W')!.lon).toBeLessThan(0);
  });
  it('refuse ce qui est ambigu ou faux', () => {
    expect(parseCoordinates('48,85,2,29')).toBeNull();
    expect(parseCoordinates('95, 2')).toBeNull();
    expect(parseCoordinates('rue de Rivoli')).toBeNull();
    expect(parseCoordinates('')).toBeNull();
  });
  it('points cardinaux', () => {
    expect(compassName(0)).toBe('N');
    expect(compassName(91)).toBe('E');
    expect(compassName(225)).toBe('SO');
    expect(compassName(359)).toBe('N');
  });
});
