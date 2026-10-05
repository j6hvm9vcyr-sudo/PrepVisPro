import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { figureIcon, floorPlanIconFiles, projectIconFiles } from './floorIcons';
import { newProject } from './defaults';
import { newFloorPlan } from './floorOps';
import type { FloorElement } from './floor';
import type { FigureIcon } from './types';

const ic = (file: string, turn: FigureIcon['turn'] = 0): FigureIcon => ({ file, name: file, turn });
const cam: FloorElement = { id: 'c', kind: 'camera', at: { x: 0, y: 0 }, rotation: 0, planId: null, setupId: null, showFov: true, positions: [], icon: null };
const actor: FloorElement = { id: 'a', kind: 'actor', at: { x: 0, y: 0 }, rotation: 0, name: 'Léa', color: '#f00', positions: [], icon: null, size: 40 };
const light: FloorElement = { id: 'l', kind: 'light', at: { x: 0, y: 0 }, rotation: 0, fixtureId: 'f', mode: 0, dimmer: 1, gels: [], lossStops: 0, circuit: '', positions: [], label: '', icon: null, size: 40 };

describe('figureIcon', () => {
  it('icône de la figure, puis du modèle de projecteur, puis du projet, sinon symbole standard', () => {
    const d0 = newProject();
    expect(figureIcon(d0, cam)).toBeNull();
    const d1 = produce(d0, (d) => {
      d.settings.floorIcons.camera = ic('images/cam.png', 270);
      d.settings.floorIcons.actor = ic('images/perso.png');
      d.settings.floorIcons.light = ic('images/proj.png');
      d.settings.fixtures.push({ id: 'f', name: 'Fresnel', watts: null, kind: 'tungsten', modes: [], icon: ic('images/fresnel.png', 90) });
    });
    expect(figureIcon(d1, cam)).toEqual(ic('images/cam.png', 270));
    expect(figureIcon(d1, actor)).toEqual(ic('images/perso.png'));
    // Deux personnages, deux icônes.
    expect(figureIcon(d1, { ...actor, icon: ic('images/lea.png') })).toEqual(ic('images/lea.png'));
    // Projecteur : celle de son modèle (la source utilisée), sauf s'il a la sienne.
    expect(figureIcon(d1, light)).toEqual(ic('images/fresnel.png', 90));
    expect(figureIcon(d1, { ...light, fixtureId: null })).toEqual(ic('images/proj.png'));
    expect(figureIcon(d1, { ...light, icon: ic('images/kino.png') })).toEqual(ic('images/kino.png'));
    expect(figureIcon(d1, { id: 't', kind: 'text', at: { x: 0, y: 0 }, rotation: 0, text: 'x', size: 12 })).toBeNull();
  });

  it('les images utilisées sont connues (exports, copie du projet)', () => {
    const fp = { ...newFloorPlan('P', []), elements: [cam, light, { id: 'i', kind: 'icon' as const, at: { x: 0, y: 0 }, rotation: 0, icon: 'images/pose.png', label: '', size: 56 }] };
    const d = produce(newProject(), (x) => {
      x.settings.floorIcons.camera = ic('images/cam.png');
      x.settings.floorIcons.actor = ic('images/perso.png');
      x.settings.fixtures.push({ id: 'f', name: 'F', watts: null, kind: 'led', modes: [], icon: ic('images/fresnel.png') });
      x.floorPlans.push(fp);
    });
    expect([...floorPlanIconFiles(d, d.floorPlans[0]!)].sort()).toEqual(['images/cam.png', 'images/fresnel.png', 'images/pose.png']);
    expect([...projectIconFiles(d)].sort()).toEqual(['images/cam.png', 'images/fresnel.png', 'images/perso.png', 'images/pose.png']);
  });
});
