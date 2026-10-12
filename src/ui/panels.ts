/**
 * Panneaux (0.18–0.19) : une surface fixe par page, des panneaux qu'on ouvre ou ferme autour, comme
 * dans Resolve. Leur disposition est gardée sur ce Mac (préférences, `layout`).
 * Découpage : Le film et Scénario à gauche, Images en bas, Notes ou Détails à droite.
 * Plans au sol : la liste des plans au sol à gauche, Détails (la sélection) à droite.
 * Tournage : Le film à gauche, Détails (le jour ou la séquence choisis) à droite.
 */
import { produce, type Draft } from 'immer';
import { useApp } from '../state/appStore';
import { getPrefs, updatePrefs, usePrefs } from '../state/prefs';
import type { AppPrefs, PanelLayout } from '../model/prefs';
import { SPACE_OF, useVerifyPanel, type Space } from './spaces';

export type PanelId = 'film' | 'scenario' | 'images' | 'notes' | 'details';

export const PANEL_LABEL: Record<PanelId, string> = { film: 'Le film', scenario: 'Scénario', images: 'Images', notes: 'Notes', details: 'Détails' };
export const PANEL_KEY: Record<PanelId, string> = { film: '⌥⌘1', scenario: '⌥⌘2', images: '⌥⌘3', notes: '⌥⌘4', details: '⌘I' };

/** Panneaux de chaque page, dans l'ordre de la barre du haut (Détails à part, à droite). */
export const PANELS_OF: Record<Space, PanelId[]> = { decoupage: ['film', 'scenario', 'images', 'notes'], sol: ['film'], tournage: ['film'] };

/** Interrupteur de la disposition qui porte ce panneau dans cette page ; null : géré à part (Détails du Découpage) ou absent. */
function layoutKey(space: Space, id: PanelId): keyof PanelLayout | null {
  if (space === 'sol') return id === 'film' ? 'solFilm' : id === 'details' ? 'solDetails' : null;
  if (space === 'tournage') return id === 'film' ? 'tournageFilm' : id === 'details' ? 'tournageDetails' : null;
  return id === 'details' ? null : id;
}

function openIn(space: Space, id: PanelId, layout: PanelLayout, inspector: boolean, verifying: boolean): boolean {
  if (id !== 'details' && !PANELS_OF[space].includes(id)) return false;
  // À droite, une seule chose : À vérifier passe devant Notes et Détails.
  if ((id === 'details' || id === 'notes') && verifying) return false;
  if (space === 'decoupage' && id === 'details') return inspector && !layout.notes;
  const k = layoutKey(space, id);
  return k ? (layout[k] as boolean) : false;
}

/** Le panneau est-il ouvert (dans la page en cours) ? */
export function usePanelOpen(id: PanelId): boolean {
  const layout = usePrefs((s) => s.prefs.layout);
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const verifying = useVerifyPanel((s) => s.open);
  return openIn(SPACE_OF[view], id, layout, inspector, verifying);
}

function isOpen(id: PanelId): boolean {
  const st = useApp.getState();
  return openIn(SPACE_OF[st.view], id, getPrefs().layout, st.inspector, useVerifyPanel.getState().open);
}

/** Change la disposition ; préférences illisibles : en mémoire seulement (le fichier n'est pas écrasé). */
export function setLayout(recipe: (d: Draft<AppPrefs>) => void) {
  if (!updatePrefs(recipe)) usePrefs.setState((s) => ({ prefs: produce(s.prefs, recipe) }));
}

export function setPanel(id: PanelId, on: boolean) {
  const st = useApp.getState();
  const space = SPACE_OF[st.view];
  // À droite, une seule chose à la fois : À vérifier, Notes ou Détails.
  if ((id === 'notes' || id === 'details') && on) useVerifyPanel.getState().set(false);
  if (space === 'decoupage' && id === 'details') {
    if (on) setLayout((d) => void (d.layout.notes = false));
    if (st.inspector !== on) st.toggleInspector();
    return;
  }
  const k = layoutKey(space, id);
  if (!k) return;
  // Notes : Détails (s'il était ouvert) revient quand on les ferme.
  setLayout((d) => void ((d.layout[k] as boolean) = on));
}

export function togglePanel(id: PanelId) {
  setPanel(id, !isOpen(id));
}

/** Ouvre un panneau du Découpage (depuis une autre page aussi). */
export function openDecoupagePanel(id: PanelId) {
  const st = useApp.getState();
  if (SPACE_OF[st.view] !== 'decoupage') st.setView('table');
  setPanel(id, true);
}

/** Minuter une séquence : dans le panneau Scénario, à côté de sa scène. */
export function startTiming(seqId: string) {
  openDecoupagePanel('scenario');
  useApp.getState().setTiming(seqId);
}
