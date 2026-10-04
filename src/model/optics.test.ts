import { describe, expect, it } from 'vitest';
import { angleDeg, fieldOfView, frameGeometry, parseAspectRatio } from './optics';

describe('ratio du projet', () => {
  it('formats usuels', () => {
    expect(parseAspectRatio('1,85:1')).toBeCloseTo(1.85);
    expect(parseAspectRatio('2.39')).toBeCloseTo(2.39);
    expect(parseAspectRatio('16/9')).toBeCloseTo(16 / 9);
    expect(parseAspectRatio('4:3')).toBeCloseTo(4 / 3);
    expect(parseAspectRatio('')).toBeNull();
    expect(parseAspectRatio('scope')).toBeNull();
  });
});

describe('zone cadrée et angles', () => {
  it('plein format 36 × 24, 50 mm : valeurs de référence', () => {
    const f = fieldOfView({ sensorWidthMm: 36, sensorHeightMm: 24, squeeze: 1 }, 50, null);
    expect(f.horizontal).toBeCloseTo(39.598, 3);
    expect(f.vertical).toBeCloseTo(26.991, 3);
    expect(f.diagonal).toBeCloseTo(46.793, 3);
  });
  it('ratio plus large que le capteur : la hauteur est rognée, la largeur reste entière', () => {
    const g = frameGeometry(36, 24, 1, 2.39)!;
    expect(g.widthMm).toBe(36);
    expect(g.heightMm).toBeCloseTo(36 / 2.39);
    expect(g.croppedWidth).toBe(false);
  });
  it('ratio plus étroit que le capteur : la largeur est rognée (champ horizontal plus serré)', () => {
    const g = frameGeometry(36, 24, 1, 4 / 3)!;
    expect(g.widthMm).toBeCloseTo(32);
    expect(g.croppedWidth).toBe(true);
  });
  it('anamorphique 2x : largeur désanamorphosée', () => {
    const g = frameGeometry(22, 18, 2, null)!;
    expect(g.widthMm).toBe(44);
    expect(angleDeg(44, 50)).toBeCloseTo(angleDeg(22, 25)!, 10);
  });
  it('sans hauteur : angle horizontal seulement ; sans largeur : rien', () => {
    const f = fieldOfView({ sensorWidthMm: 24.89, sensorHeightMm: null, squeeze: 1 }, 32, null);
    expect(f.horizontal).not.toBeNull();
    expect(f.vertical).toBeNull();
    expect(fieldOfView({ sensorWidthMm: null, sensorHeightMm: 18, squeeze: 1 }, 32, 1.85).horizontal).toBeNull();
  });
});
