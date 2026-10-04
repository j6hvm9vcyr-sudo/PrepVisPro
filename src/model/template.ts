/**
 * Nouveau projet à partir d'un autre : on reprend la préparation (réglages, équipe), pas le film.
 * Repris : caméras, optiques, projecteurs, matières de réflecteurs, exposition, listes de termes,
 * champs obligatoires, fuseau horaire, production, ratio et équipe.
 * Non repris : titre, réalisation, séquences, tampons, images, plans au sol, jours de tournage.
 */
import { produce } from 'immer';
import { newId, newProject, newSequence } from './defaults';
import type { ProjectDoc } from './types';

export function projectFrom(source: ProjectDoc, title: string): ProjectDoc {
  return produce(newProject(title), (d) => {
    d.settings = structuredClone(source.settings);
    d.meta.production = source.meta.production;
    d.meta.aspectRatio = source.meta.aspectRatio;
    d.meta.crew = source.meta.crew.map((c) => ({ ...c, id: newId('crew') }));
    d.sequences = [newSequence('1', d.settings.cameras[0]!.id)];
  });
}
