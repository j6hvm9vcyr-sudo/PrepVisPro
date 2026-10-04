import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import './ui/styles.css';
import { App } from './ui/App';
import { initTheme } from './ui/theme';
import { installMenuBridge } from './platform/menu';
import { startup } from './state/project';

initTheme();
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
    <App />
  </StrictMode>,
);
