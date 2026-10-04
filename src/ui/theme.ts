import { useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'prepvispro.theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    /* stockage indisponible : thème automatique */
  }
  return 'auto';
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Préférence d'affichage propre à cet ordinateur (pas dans le fichier projet). */
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  useEffect(() => {
    apply(choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* sans conséquence */
    }
  }, [choice]);
  return [choice, setChoice];
}

/** Au démarrage : applique le thème, puis suit le passage clair / sombre de macOS tant que l'app tourne. */
export function initTheme() {
  apply(read());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => apply(read()));
}
