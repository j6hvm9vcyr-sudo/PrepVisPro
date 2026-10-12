/** Partager (0.24) : une partie au travail (publication, export, animatique) empêche de fermer ou de changer de partie. */
import { useEffect } from 'react';
import { create } from 'zustand';

export const useShareBusyStore = create<{ busy: boolean; set: (v: boolean) => void }>((set) => ({ busy: false, set: (busy) => set({ busy }) }));

export function useShareBusy(busy: boolean) {
  useEffect(() => {
    useShareBusyStore.getState().set(busy);
    return () => useShareBusyStore.getState().set(false);
  }, [busy]);
}
