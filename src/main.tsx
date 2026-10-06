import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import './ui/styles.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { initTheme } from './ui/theme';
import { installMenuBridge } from './platform/menu';
import { startup } from './state/project';
import { useApp } from './state/appStore';
import { setPrefsErrorReporter } from './state/prefs';

initTheme();
// Texte prédictif en ligne de macOS (WebKit) : il garde la saisie « en composition », ce qui
// détourne ↩ et ⇥. Désactivé sur tous les champs dès qu'ils reçoivent le focus.
document.addEventListener(
  'focusin',
  (e) => {
    const t = e.target;
    if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && !t.hasAttribute('writingsuggestions')) t.setAttribute('writingsuggestions', 'false');
  },
  true,
);
// Erreur imprévue hors affichage : signalée dans la barre d'état plutôt que silencieuse.
const report = (msg: string) => {
  try {
    useApp.getState().setMessage(`Problème inattendu : ${msg}`, 'warn');
  } catch {
    /* rien de plus à faire */
  }
};
window.addEventListener('error', (e) => {
  // Avertissement bénin des navigateurs, sans conséquence.
  if (/ResizeObserver/.test(e.message)) return;
  report(e.message || 'erreur');
});
window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error)?.message ?? e.reason)));
setPrefsErrorReporter((msg) => useApp.getState().setMessage(msg, 'warn'));
void installMenuBridge();
// ?exemple : ouvre directement le projet d'exemple (démonstration, tests).
const params = new URLSearchParams(location.search);
void startup({ sample: params.has('exemple'), large: params.get('exemple') === 'grand' });

// Crochets pour les tests de l'application réelle (jamais présents dans une version normale).
if (import.meta.env.VITE_TEST_HOOKS === '1') {
  void import('./testHooks').then((m) => m.install());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
