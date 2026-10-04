import { useEffect, useLayoutEffect, useRef } from 'react';
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

/** Touche reçue pendant une composition (accent, texte prédictif de macOS, méthode de saisie). */
export function isComposing(e: { nativeEvent: KeyboardEvent; keyCode: number }): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

/**
 * Fenêtre superposée : elle prend le focus à l'ouverture et le garde (Safari ne donne pas le focus
 * aux boutons cliqués, il part sur <body> et Esc ou ↩ n'arrivent plus à la fenêtre).
 * À poser sur l'élément `.overlay` (avec tabIndex={-1}).
 */
export function useDialogFocus<T extends HTMLElement>(open = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const keep = () => {
      const a = document.activeElement;
      if (!a || a === document.body || !el.contains(a)) el.focus({ preventScroll: true });
    };
    // Tout de suite (les touches tapées aussitôt arrivent à la fenêtre), puis une seconde fois
    // après les champs marqués autoFocus.
    keep();
    const t = setTimeout(keep, 0);
    const onDown = () => setTimeout(keep, 0);
    el.addEventListener('mousedown', onDown);
    return () => {
      clearTimeout(t);
      el.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  return ref;
}

/**
 * Champ qui doit prendre le focus alors qu'il apparaît pendant un clic (sur le plan au sol…) :
 * le focus est donné après la fin du clic, sinon le navigateur le rend à l'élément cliqué.
 */
export function useLateFocus<T extends HTMLInputElement>(key: unknown, select = false) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const f = () => {
      const el = ref.current;
      if (!el || document.activeElement === el) return;
      el.focus({ preventScroll: true });
      if (select) el.select();
    };
    const t = setTimeout(f, 0);
    const late = () => setTimeout(f, 0);
    window.addEventListener('mouseup', late, { once: true, capture: true });
    window.addEventListener('pointerup', late, { once: true, capture: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('mouseup', late, { capture: true });
      window.removeEventListener('pointerup', late, { capture: true });
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/**
 * Safari ne donne pas le focus aux boutons cliqués : après un clic sur la barre d'outils ou
 * les Détails, le focus tombe sur <body> et le clavier ne fait plus rien. Dans ce cas, on rend
 * le focus au tableau, et une touche tapée « dans le vide » lui est transmise.
 * `canTake` dit si le tableau peut reprendre la main (pas de fenêtre ouverte, vue Tableau).
 */
export function installFocusRescue(canTake: () => boolean): () => void {
  const lost = () => {
    const a = document.activeElement;
    return !a || a === document.body || a === document.documentElement;
  };
  const onUp = () =>
    setTimeout(() => {
      if (gridEl && lost() && canTake()) gridEl.focus({ preventScroll: true });
    }, 0);
  const onKey = (e: KeyboardEvent) => {
    if (!gridEl || !lost() || !canTake() || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    gridEl.focus({ preventScroll: true });
    gridEl.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true }));
  };
  document.addEventListener('mouseup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('keydown', onKey, true);
  };
}
