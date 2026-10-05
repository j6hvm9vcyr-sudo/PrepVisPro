import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { figureIcon } from './floorIcons';
import { newProject } from './defaults';
import type { FloorElement } from './floor';

const cam: FloorElement = { id: 'c', kind: 'camera', at: { x: 0, y: 0 }, rotation: 0, planId: null, setupId: null, showFov: true, positions: [] };
const actor: FloorElement = { id: 'a', kind: 'actor', at: { x: 0, y: 0 }, rotation: 0, name: 'Léa', color: '#f00', positions: [], icon: null, size: 40 };

describe('figureIcon', () => {
  it('icône propre, sinon celle du projet pour ce type, sinon symbole standard', () => {
    const d0 = newProject();
    expect(figureIcon(d0, cam)).toBeNull();
    const d1 = produce(d0, (d) => {
      d.settings.floorIcons.camera = { file: 'images/cam.png', name: 'Caméra', turn: 270 };
      d.settings.floorIcons.actor = { file: 'images/perso.png', name: 'Perso', turn: 0 };
    });
    expect(figureIcon(d1, cam)).toEqual({ file: 'images/cam.png', turn: 270 });
    expect(figureIcon(d1, actor)).toEqual({ file: 'images/perso.png', turn: 0 });
    expect(figureIcon(d1, { ...actor, icon: 'images/autre.png' })).toEqual({ file: 'images/autre.png', turn: 0 });
    expect(figureIcon(d1, { id: 't', kind: 'text', at: { x: 0, y: 0 }, rotation: 0, text: 'x', size: 12 })).toBeNull();
  });
});
