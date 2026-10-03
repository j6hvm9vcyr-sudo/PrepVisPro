/** Le tableau garde le focus clavier ; les autres composants peuvent le lui rendre. */
let gridEl: HTMLElement | null = null;

export function registerGrid(el: HTMLElement | null) {
  gridEl = el;
}

export function focusGrid() {
  if (gridEl && document.activeElement !== gridEl) gridEl.focus({ preventScroll: true });
}

/** L'utilisateur est-il en train de taper dans un champ de texte ? */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'file', 'range', 'color'].includes(type);
  }
  return false;
}
