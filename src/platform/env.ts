/** L'interface tourne-t-elle dans l'application Mac (Tauri) ? */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
