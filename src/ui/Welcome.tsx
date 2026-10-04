import { useEffect, useState } from 'react';
import { AppLogo } from './AppLogo';
import { APP_VERSION } from '../version';
import { baseName, getBackend } from '../platform/backend';
import { isTauri } from '../platform/env';
import { newProjectFromScript } from '../import/flow';
import { forgetRecent, newProjectDialog, openBlankUnsaved, openDialog, openPath, openSample, recentProjects, useProject } from '../state/project';

export function Welcome() {
  const openError = useProject((s) => s.openError);
  const [kind, setKind] = useState<'tauri' | 'memory' | null>(isTauri() ? 'tauri' : null);
  const [recent, setRecent] = useState<string[]>(recentProjects);
  useEffect(() => {
    void getBackend().then((b) => {
      setKind(b.kind);
      // Le démarrage a pu retirer des projets introuvables entre-temps.
      setRecent(recentProjects());
    });
    document.title = 'PrepVisPro';
    if (isTauri()) void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle('PrepVisPro')).catch(() => {});
  }, []);
  const mac = kind === 'tauri';

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-head">
          <AppLogo />
          <div>
            <h1>PrepVisPro</h1>
            <p>Découpage technique, plans au sol, plans feux · version {APP_VERSION}</p>
          </div>
        </div>

        {openError && (
          <div className="welcome-error" role="alert">
            {openError}
          </div>
        )}

        {mac ? (
          <div className="welcome-actions">
            <button type="button" className="btn primary big" onClick={() => void newProjectDialog()} autoFocus>
              Nouveau projet… <span className="kbd">⌘N</span>
            </button>
            <button type="button" className="btn big" onClick={() => void openDialog()}>
              Ouvrir… <span className="kbd">⌘O</span>
            </button>
          </div>
        ) : (
          <div className="welcome-actions">
            <button type="button" className="btn primary big" onClick={() => void openSample()} autoFocus>
              Ouvrir l’exemple
            </button>
            <button type="button" className="btn big" onClick={() => void openBlankUnsaved()}>
              Projet vierge
            </button>
          </div>
        )}

        {mac && recent.length > 0 && (
          <section className="welcome-recent" aria-label="Projets récents">
            <h2>Récents</h2>
            {recent.map((d) => (
              <div className="recent-row" key={d}>
                <button type="button" className="recent" onClick={() => void openPath(d)} title={d}>
                  <b>{baseName(d)}</b>
                  <span>{d.replace(/\/[^/]+$/, '')}</span>
                </button>
                <button
                  type="button"
                  className="linkbtn"
                  aria-label={`Retirer ${baseName(d)} des récents`}
                  onClick={() => {
                    forgetRecent(d);
                    setRecent(recentProjects());
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        )}

        <div className="welcome-foot">
          <button type="button" className="linkbtn" onClick={() => void newProjectFromScript()} style={{ display: 'block', marginBottom: 6 }}>
            Nouveau projet depuis un scénario…
          </button>
          {mac ? (
            <button type="button" className="linkbtn" onClick={() => void openSample()}>
              Découvrir avec un projet d’exemple
            </button>
          ) : (
            <p className="note">Dans le navigateur, rien n’est enregistré. L’application Mac enregistre vos projets sur votre disque.</p>
          )}
        </div>
      </div>
    </div>
  );
}
