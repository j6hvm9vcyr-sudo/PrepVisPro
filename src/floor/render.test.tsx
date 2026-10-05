// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { cameraLegend, contentBounds, exportScaleBar, frame, REFERENCE_WIDTH, sceneSvg } from './render';
import { computeScale } from '../model/floor';
import { addElements, addFloorPlan, newFloorPlan } from '../model/floorOps';
import { doc, fr, plan, seq, setup } from '../model/testkit';

function build() {
  let d = doc((c) => [seq('4', [plan(c, { action: 'Axel entre', cameras: [setup(c, { start: fr({ focalMm: 32 }) })] }), plan(c, { action: 'Gros plan', cameras: [setup(c, { start: fr({ focalMm: 85 }) })] })])]);
  d = produce(d, (x) => void (x.settings.cameras[0]!.sensorWidthMm = 36));
  const s = d.sequences[0]!;
  const fp = { ...newFloorPlan('Salon', [s.id]), background: { file: 'images/bg.png', width: 2000, height: 1000, opacity: 0.8, originalName: 'bg.png' }, scale: computeScale({ x: 0, y: 0 }, { x: 1000, y: 0 }, 10) };
  d = addFloorPlan(d, fp);
  const [p1, p2] = s.plans;
  d = addElements(d, fp.id, [
    { id: 'c2', kind: 'camera', at: { x: 1500, y: 500 }, rotation: 270, planId: p2!.id, setupId: p2!.cameras[0]!.id, showFov: true, positions: [], icon: null },
    { id: 'c1', kind: 'camera', at: { x: 500, y: 500 }, rotation: 90, planId: p1!.id, setupId: p1!.cameras[0]!.id, showFov: true, positions: [], icon: null },
    { id: 'a1', kind: 'actor', at: { x: 1000, y: 500 }, rotation: 0, name: 'Axel', color: '#E5484D', positions: [{ at: { x: 1000, y: 300 }, rotation: 0 }], icon: null, size: 40 },
  ]);
  return { d, fp: d.floorPlans[0]! };
}

describe('export du plan au sol', () => {
  it('cadre : le fond entier, et les étiquettes qui dépassent', () => {
    const { fp } = build();
    const b = contentBounds(fp, 0)!;
    expect(b.x).toBeLessThanOrEqual(0);
    expect(b.w).toBeGreaterThanOrEqual(2000);
    const out = produce(fp, (x) => void (x.elements[0]!.at = { x: 2100, y: 500 }));
    expect(contentBounds(out, 1)!.x + contentBounds(out, 1)!.w).toBeGreaterThan(2100 + 150);
    expect(contentBounds({ ...fp, background: null, elements: [] }, 1)).toBeNull();
  });

  it('cadrage : grand côté demandé, symboles à taille constante', () => {
    const { fp } = build();
    const f = frame(fp, 2800)!;
    expect(Math.max(f.width, f.height)).toBe(2800);
    // Un pixel symbole vaut 2800/1100 pixels de sortie.
    expect(f.k * f.zoom).toBeCloseTo(2800 / REFERENCE_WIDTH, 6);
  });

  it('barre d’échelle à longueur ronde, exacte', () => {
    const bar = exportScaleBar(0.01, 2, 300);
    // 300 px de sortie = 1,5 m → 1 m, soit 200 px.
    expect(bar.meters).toBe(1);
    expect(bar.px).toBeCloseTo(200);
  });

  it('SVG : caméras avec numéro à jour, champ dessiné, barre d’échelle, police intégrée', () => {
    const { d, fp } = build();
    const svg = sceneSvg(d, fp, frame(fp, 2000)!, { fontCss: "@font-face{font-family:'IBM Plex Mono'}" });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<style>@font-face');
    expect(svg).toContain('4/1');
    expect(svg).toContain('4/2');
    expect(svg).toContain('32 mm');
    expect(svg.match(/<polygon/g)?.length).toBe(2);
    expect(svg).toContain('Axel');
    expect(svg).toMatch(/\d m</);
    expect(svg).not.toContain('data-rotate');
  });

  it('SVG sans échelle : mention explicite, pas de barre', () => {
    const { d, fp } = build();
    const svg = sceneSvg(d, { ...fp, scale: null }, frame({ ...fp, scale: null }, 1500)!);
    expect(svg).toContain('non mis à l’échelle');
  });

  it('légende : caméras dans l’ordre du découpage, avec l’action', () => {
    const { d, fp } = build();
    expect(cameraLegend(d, fp)).toEqual([
      { code: '4/1', detail: '32 mm', action: 'Axel entre', missing: false },
      { code: '4/2', detail: '85 mm', action: 'Gros plan', missing: false },
    ]);
  });
});
