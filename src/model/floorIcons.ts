/**
 * Icônes des figures du plan au sol. Une figure prend, dans l'ordre : sa propre icône (posée
 * depuis la bibliothèque), sinon l'icône choisie pour toutes les figures de ce type dans le projet
 * (Plan au sol › Figures), sinon le symbole standard.
 */
import type { FloorElement, FloorPlan } from './floor';
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

/**
 * Icône à dessiner pour cet élément, ou null (symbole standard). Dans l'ordre : celle de la figure,
 * celle du modèle de projecteur, celle du projet pour ce type de figure.
 */
export function figureIcon(doc: ProjectDoc, el: FloorElement): FigureIcon | null {
  if (el.kind === 'text' || el.kind === 'icon') return null;
  if (el.icon) return el.icon;
  if (el.kind === 'reflector') return null;
  if (el.kind === 'light') {
    const f = doc.settings.fixtures.find((x) => x.id === el.fixtureId);
    if (f?.icon) return f.icon;
  }
  return doc.settings.floorIcons[el.kind];
}

/** Images de ce plan au sol qui dessinent des figures ou des icônes posées (pour les exports). */
export function floorPlanIconFiles(doc: ProjectDoc, fp: FloorPlan): Set<string> {
  const out = new Set<string>();
  for (const el of fp.elements) {
    if (el.kind === 'icon') out.add(el.icon);
    const f = figureIcon(doc, el);
    if (f) out.add(f.file);
  }
  return out;
}

/** Toutes les images d'icônes que le projet utilise (figures, modèles de projecteurs, choix du projet). */
export function projectIconFiles(doc: ProjectDoc): Set<string> {
  const out = new Set<string>();
  for (const fp of doc.floorPlans) for (const f of floorPlanIconFiles(doc, fp)) out.add(f);
  for (const f of doc.settings.fixtures) if (f.icon) out.add(f.icon.file);
  for (const d of Object.values(doc.settings.floorIcons)) if (d) out.add(d.file);
  return out;
}
