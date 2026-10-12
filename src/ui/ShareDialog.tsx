/**
 * Partager (0.24) : une seule fenêtre pour tout ce qui sort du projet — publier sur le drive de
 * l'équipe, un fichier (découpage PDF, Excel, CSV), l'animatique pour le montage, et les retours reçus.
 * ⇧⌘P l'ouvre sur Publier, ⌘E sur Fichier.
 */
import { useApp } from '../state/appStore';
import type { ShareTab } from '../state/store';
import { usePublish } from '../state/publish';
import { ExportPane } from './ExportDialog';
import { PublishPane, useChangesSincePublication } from './PublishDialog';
import { AnimaticPane } from './AnimaticDialog';
import { RetoursPane, useRetoursCount } from './RetoursPanel';
import { useShareBusyStore } from './shareBusy';
import { focusGrid, useDialogFocus } from './focus';

const TABS: { id: ShareTab; label: string }[] = [
  { id: 'publish', label: 'Publier sur le drive' },
  { id: 'file', label: 'Fichier' },
  { id: 'animatic', label: 'Animatique' },
  { id: 'retours', label: 'Retours reçus' },
];

function TabIcon({ id }: { id: ShareTab }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (id === 'publish')
    return (
      <svg {...p}>
        <path d="M4 16.5a4 4 0 0 1 1.5-7.7A6 6 0 0 1 17 7.5a4.5 4.5 0 0 1 2.5 8.5" />
        <path d="M12 12v8M9 15l3-3 3 3" />
      </svg>
    );
  if (id === 'file')
    return (
      <svg {...p}>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v4h4" />
      </svg>
    );
  if (id === 'animatic')
    return (
      <svg {...p}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 6v12M17 6v12" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M4 5h16v11H8l-4 4z" />
    </svg>
  );
}

/** Sous-titre de chaque partie, dans la liste. */
function useSubtitles(): Record<ShareTab, { text: string; mark?: 'dot' | number }> {
  const last = usePublish((s) => s.last);
  const changes = useChangesSincePublication();
  const retours = useRetoursCount();
  return {
    publish: last ? { text: `Publication ${last.n}${changes?.any ? ' · modifié depuis' : ' · à jour'}`, mark: changes?.any ? 'dot' : undefined } : { text: 'Jamais publié' },
    file: { text: 'PDF, Excel, CSV' },
    animatic: { text: 'DaVinci Resolve, Final Cut Pro' },
    retours: { text: retours ? `${retours} à traiter` : 'Dans « Retours » ou par mail', mark: retours || undefined },
  };
}

export function ShareDialog({ tab }: { tab: ShareTab }) {
  const busy = useShareBusyStore((s) => s.busy);
  const dlg = useDialogFocus<HTMLDivElement>();
  const subs = useSubtitles();
  const st = useApp.getState;
  const close = () => {
    if (busy) return;
    st().setShare(null);
    focusGrid();
  };
  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Partager"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div className="dialog share" onClick={(e) => e.stopPropagation()}>
        <nav className="share-nav" role="tablist" aria-label="Que partager" aria-orientation="vertical">
          <h2>Partager</h2>
          {TABS.map((t) => {
            const sub = subs[t.id];
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`share-tab ${tab === t.id ? 'on' : ''}`}
                disabled={busy && tab !== t.id}
                onClick={() => st().setShare(t.id)}
              >
                <TabIcon id={t.id} />
                <span className="share-tab-text">
                  <b>{t.label}</b>
                  <small>{sub.text}</small>
                </span>
                {sub.mark === 'dot' ? <span className="share-dot" aria-hidden /> : typeof sub.mark === 'number' ? <span className="tog-count">{sub.mark}</span> : <span />}
              </button>
            );
          })}
          <span className="spacer" />
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={close} disabled={busy}>
            Fermer
          </button>
        </nav>
        <div className="share-main">
          {tab === 'publish' && <PublishPane />}
          {tab === 'file' && <ExportPane />}
          {tab === 'animatic' && <AnimaticPane />}
          {tab === 'retours' && <RetoursPane onDone={() => st().setShare(null)} />}
        </div>
      </div>
    </div>
  );
}
