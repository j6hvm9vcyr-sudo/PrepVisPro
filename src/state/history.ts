/**
 * Historique d'annulation. Les documents sont immuables (immer) : garder les versions
 * précédentes ne coûte presque rien en mémoire grâce au partage structurel.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Clé de regroupement de la dernière modification (frappe continue dans un texte). */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 500;
const MERGE_WINDOW_MS = 1500;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Enregistre une nouvelle version. Si `mergeKey` est identique à la précédente et récente,
 * la modification est fusionnée (une seule étape d'annulation pour une phrase tapée).
 */
export function pushHistory<T>(h: History<T>, next: T, mergeKey: string | null = null, now = Date.now()): History<T> {
  if (next === h.present) return h;
  const merge = mergeKey !== null && mergeKey === h.lastKey && now - h.lastAt < MERGE_WINDOW_MS;
  const past = merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: mergeKey, lastAt: now };
}

export function undoHistory<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redoHistory<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastKey: null, lastAt: 0 };
}
