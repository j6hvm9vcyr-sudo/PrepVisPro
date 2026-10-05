/**
 * Icônes des figures du plan au sol. Une figure prend, dans l'ordre : sa propre icône (posée
 * depuis la bibliothèque), sinon l'icône choisie pour toutes les figures de ce type dans le projet
 * (Plan au sol › Figures), sinon le symbole standard.
 */
import type { FloorElement } from './floor';
import type { FigureIcon, FigureKind, ProjectDoc } from './types';

/** Taille à l'écran d'une caméra dessinée par une icône (les caméras n'ont pas de taille propre). */
export const CAMERA_ICON_SIZE = 48;

/** Sens dans lequel l'image regarde → rotation qui la fait regarder vers le haut (0° du plan). */
export const LOOKS: { label: string; title: string; turn: FigureIcon['turn'] }[] = [
  { label: '↑', title: 'L’image regarde vers le haut', turn: 0 },
  { label: '→', title: 'L’image regarde vers la droite', turn: 270 },
  { label: '↓', title: 'L’image regarde vers le bas', turn: 180 },
  { label: '←', title: 'L’image regarde vers la gauche', turn: 90 },
];

export const FIGURE_LABEL: Record<FigureKind, string> = { camera: 'Caméra', actor: 'Personnage', light: 'Projecteur' };

/** Icône à dessiner pour cet élément, ou null (symbole standard). */
export function figureIcon(doc: ProjectDoc, el: FloorElement): { file: string; turn: number } | null {
  if ((el.kind === 'actor' || el.kind === 'light') && el.icon) return { file: el.icon, turn: 0 };
  if (el.kind !== 'camera' && el.kind !== 'actor' && el.kind !== 'light') return null;
  const d = doc.settings.floorIcons[el.kind];
  return d ? { file: d.file, turn: d.turn } : null;
}
