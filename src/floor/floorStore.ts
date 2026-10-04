/** État de l'éditeur de plan au sol (interface seulement ; le plan lui-même est dans le document). */
import { create } from 'zustand';
import type { Id } from '../model/types';
import type { Point } from '../model/floor';

export type FloorTool = 'select' | 'camera' | 'actor' | 'text' | 'scale' | 'measure' | 'path';

export interface Viewport {
  /** Coin haut-gauche visible, en unités du plan. */
  x: number;
  y: number;
  /** Pixels écran par unité du plan. */
  zoom: number;
}

export interface FloorUi {
  currentId: Id | null;
  selection: Id[];
  tool: FloorTool;
  /** Points cliqués pour l'outil en cours (échelle, mesure, trajet). */
  draft: Point[];
  /** Caméra du découpage à placer au prochain clic. */
  placing: { planId: Id; setupId: Id } | null;
  /** Élément dont on trace le trajet. */
  pathFor: Id | null;
  viewports: Record<Id, Viewport>;
  set(p: Partial<Omit<FloorUi, 'set'>>): void;
}

export const useFloor = create<FloorUi>()((set) => ({
  currentId: null,
  selection: [],
  tool: 'select',
  draft: [],
  placing: null,
  pathFor: null,
  viewports: {},
  set: (p) => set(p),
}));

export const ACTOR_COLORS = ['#E5484D', '#2E9150', '#8E4EC6', '#D98A1C', '#0091FF', '#E93D82'];
