/**
 * Panneaux (0.18) : une surface fixe par page, des panneaux qu'on ouvre ou ferme autour, comme
 * dans Resolve. Leur disposition est gardée sur ce Mac (préférences, `layout`).
 * Découpage : Le film et Scénario à gauche, Images en bas, Notes ou Détails à droite.
 */
import { useApp } from '../state/appStore';
import { produce, type Draft } from 'immer';
import { getPrefs, updatePrefs, usePrefs } from '../state/prefs';
import type { AppPrefs } from '../model/prefs';
import { SPACE_OF, useVerifyPanel } from './spaces';

export type PanelId = 'film' | 'scenario' | 'images' | 'notes' | 'details';

export const PANEL_LABEL: Record<PanelId, string> = { film: 'Le film', scenario: 'Scénario', images: 'Images', notes: 'Notes', details: 'Détails' };
export const PANEL_KEY: Record<PanelId, string> = { film: '⌥⌘1', scenario: '⌥⌘2', images: '⌥⌘3', notes: '⌥⌘4', details: '⌘I' };

/** Le panneau est-il ouvert (dans la page en cours) ? */
export function usePanelOpen(id: PanelId): boolean {
  const layout = usePrefs((s) => s.prefs.layout);
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const verifying = useVerifyPanel((s) => s.open);
  if (id === 'details') return inspector && !layout.notes && !verifying;
  if (id === 'notes') return layout.notes && !verifying;
  if (id === 'film' && SPACE_OF[view] === 'tournage') return layout.tournageFilm;
  return layout[id];
}

function isOpen(id: PanelId): boolean {
  const { layout } = getPrefs();
  const st = useApp.getState();
  const verifying = useVerifyPanel.getState().open;
  if (id === 'details') return st.inspector && !layout.notes && !verifying;
  if (id === 'notes') return layout.notes && !verifying;
  if (id === 'film' && SPACE_OF[st.view] === 'tournage') return layout.tournageFilm;
  return layout[id];
}

/** Change la disposition ; préférences illisibles : en mémoire seulement (le fichier n'est pas écrasé). */
export function setLayout(recipe: (d: Draft<AppPrefs>) => void) {
  if (!updatePrefs(recipe)) usePrefs.setState((s) => ({ prefs: produce(s.prefs, recipe) }));
}

export function setPanel(id: PanelId, on: boolean) {
  const st = useApp.getState();
  // À droite, une seule chose à la fois : À vérifier, Notes ou Détails.
  if ((id === 'notes' || id === 'details') && on) useVerifyPanel.getState().set(false);
  if (id === 'details') {
    if (on) setLayout((d) => void (d.layout.notes = false));
    if (st.inspector !== on) st.toggleInspector();
    return;
  }
  if (id === 'notes') {
    // Détails (s'il était ouvert) revient quand on ferme les notes.
    setLayout((d) => void (d.layout.notes = on));
    return;
  }
  if (id === 'film' && SPACE_OF[st.view] === 'tournage') {
    setLayout((d) => void (d.layout.tournageFilm = on));
    return;
  }
  setLayout((d) => void (d.layout[id] = on));
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
