/**
 * Les trois pages (0.9 ; panneaux 0.18), nommées d'après les documents qu'on y fait : Découpage, Plans au sol, Tournage.
 * Le Découpage a une seule surface, le tableau, en liste ou en fiches ; le reste est en panneaux (panels.ts).
 * Une page rouvre la dernière vue qu'on y a utilisée.
 */
import { create } from 'zustand';
import { useApp } from '../state/appStore';
import type { AppState } from '../state/store';

export type View = AppState['view'];
export type Space = 'decoupage' | 'sol' | 'tournage';

export const SPACE_OF: Record<View, Space> = { table: 'decoupage', cards: 'decoupage', floor: 'sol', days: 'tournage' };

export const SPACES: { id: Space; label: string; views: { view: View; label: string; key: string; title: string }[] }[] = [
  {
    id: 'decoupage',
    label: 'Découpage',
    views: [
      { view: 'table', label: 'Liste', key: '⌥⌘L', title: 'Le découpage en liste, tel qu’il est exporté' },
      { view: 'cards', label: 'Fiches', key: '⌥⌘L', title: 'Un plan par fiche, avec son image' },
    ],
  },
  { id: 'sol', label: 'Plans au sol', views: [{ view: 'floor', label: 'Plans au sol', key: '⌘2', title: 'Plans au sol, lumière, soleil' }] },
  { id: 'tournage', label: 'Tournage', views: [{ view: 'days', label: 'Tournage', key: '⌘3', title: 'Jours de tournage, installations et matériel' }] },
];

/** Dernière vue utilisée dans chaque espace (le temps de la session). */
const useLast = create<Record<Space, View>>()(() => ({ decoupage: 'table', sol: 'floor', tournage: 'days' }));

useApp.subscribe((s, prev) => {
  if (s.view !== prev.view) useLast.setState({ [SPACE_OF[s.view]]: s.view });
});

/** Vues où le tableau du découpage est affiché (et a la main sur le clavier). */
export function isGridView(v: View): boolean {
  return v === 'table';
}

export function openSpace(space: Space) {
  useApp.getState().setView(useLast.getState()[space]);
}

/** Panneau « À vérifier » (à droite, refermable). */
export const useVerifyPanel = create<{ open: boolean; set(v: boolean): void }>()((set) => ({ open: false, set: (open) => set({ open }) }));
