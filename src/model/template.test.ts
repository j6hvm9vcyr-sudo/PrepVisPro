import { describe, expect, it } from 'vitest';
import { projectFrom } from './template';
import { sampleProject } from './sample';
import { validateProject } from './schema';

describe('projectFrom', () => {
  it('reprend la préparation (réglages, équipe), pas le film', () => {
    const src = sampleProject();
    const d = projectFrom(src, 'Nouveau film');
    expect(validateProject(d).ok).toBe(true);
    expect(d.id).not.toBe(src.id);
    expect(d.meta.title).toBe('Nouveau film');
    expect(d.meta.director).toBe('');
    expect(d.settings).toEqual(src.settings);
    expect(d.meta.crew.map((c) => [c.role, c.name])).toEqual(src.meta.crew.map((c) => [c.role, c.name]));
    expect(d.sequences).toHaveLength(1);
    expect(d.sequences[0]!.plans[0]!.cameras[0]!.cameraId).toBe(src.settings.cameras[0]!.id);
    expect([d.floorPlans, d.shootingDays, d.library, d.stamps]).toEqual([[], [], [], []]);
    // Copie : modifier le nouveau projet ne touche pas l'ancien.
    expect(d.settings.cameras).not.toBe(src.settings.cameras);
  });
});
