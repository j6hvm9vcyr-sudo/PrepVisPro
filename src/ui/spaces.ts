/**
 * Les trois espaces de travail (0.9), nommés d'après les documents qu'on y fait : Découpage, Plans au sol, Tournage.
 * Chaque vue existante appartient à un espace ; un espace rouvre la dernière vue qu'on y a utilisée.
 */
import { create } from 'zustand';
import { useApp } from '../state/appStore';
import type { AppState } from '../state/store';

export type View = AppState['view'];
export type Space = 'decoupage' | 'sol' | 'tournage';

export const SPACE_OF: Record<View, Space> = { table: 'decoupage', cards: 'decoupage', library: 'decoupage', floor: 'sol', days: 'tournage', shooting: 'tournage' };

export const SPACES: { id: Space; label: string; views: { view: View; label: string; key: string; title: string }[] }[] = [
  {
    id: 'decoupage',
    label: 'Découpage',
    views: [
      { view: 'table', label: 'Tableau', key: '⌘1', title: 'Le découpage, tel qu’il est exporté' },
      { view: 'cards', label: 'Fiches', key: '⌘2', title: 'Un plan par fiche, avec son image' },
      { view: 'library', label: 'Images', key: '⌘6', title: 'Bibliothèque d’images du projet' },
    ],
  },
  { id: 'sol', label: 'Plans au sol', views: [{ view: 'floor', label: 'Plans au sol', key: '⌘3', title: 'Plans au sol, lumière, soleil' }] },
  {
    id: 'tournage',
    label: 'Tournage',
    views: [
      { view: 'days', label: 'Jours', key: '⌘5', title: 'Jours de tournage et matériel' },
      { view: 'shooting', label: 'Installations', key: '⌘4', title: 'Installations et ordre de tournage, séquence par séquence' },
    ],
  },
];

/** Dernière vue utilisée dans chaque espace (le temps de la session). */
const useLast = create<Record<Space, View>>()(() => ({ decoupage: 'table', sol: 'floor', tournage: 'days' }));

useApp.subscribe((s, prev) => {
  if (s.view !== prev.view) useLast.setState({ [SPACE_OF[s.view]]: s.view });
});

export function openSpace(space: Space) {
  useApp.getState().setView(useLast.getState()[space]);
}

/** Panneau « À vérifier » (à droite, refermable). */
export const useVerifyPanel = create<{ open: boolean; set(v: boolean): void }>()((set) => ({ open: false, set: (open) => set({ open }) }));
