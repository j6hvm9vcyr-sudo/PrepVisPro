import { useMemo } from 'react';
import { useApp } from '../state/appStore';
import { rangeOf, selectCursor, selectDoc } from '../state/store';
import { missingFields } from '../model/completeness';
import { computeNumbers } from '../model/numbering';
import { locatePlan } from '../model/ops';
import { FIELD_LABEL } from '../model/entry';
import { stripColors } from './strip';
import { focusGrid } from './focus';
import { flushSave, saveAsDialog, useProject } from '../state/project';

export function Toolbar() {
  const doc = useApp(selectDoc);
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const onlyIncomplete = useApp((s) => s.onlyIncomplete);
  const canUndo = useApp((s) => s.hist.past.length > 0);
  const canRedo = useApp((s) => s.hist.future.length > 0);
  const st = useApp.getState;
  const { total, incomplete } = useMemo(() => {
    let total = 0;
    let incomplete = 0;
    for (const s of doc.sequences)
      for (const p of s.plans) {
        total++;
        if (missingFields(p, doc.settings).length) incomplete++;
      }
    return { total, incomplete };
  }, [doc]);

  return (
    <header className="toolbar">
      <div className="title">
        <b>{doc.meta.title || 'Sans titre'}</b>
        <span>
          {doc.sequences.length} séq. · {total} plans · <SaveIndicator />
        </span>
      </div>
      <div className="seg" role="group" aria-label="Vue">
        <button type="button" aria-pressed={view === 'table'} onClick={() => st().setView('table')} title="⌘1">
          Tableau
        </button>
        <button type="button" aria-pressed={view === 'cards'} onClick={() => st().setView('cards')} title="⌘2">
          Fiches
        </button>
      </div>
      <button
        type="button"
        className={`btn ${onlyIncomplete ? 'on' : ''}`}
        aria-pressed={onlyIncomplete}
        onClick={() => {
          st().toggleOnlyIncomplete();
          focusGrid();
        }}
        disabled={!incomplete && !onlyIncomplete}
      >
        <span className="dot" style={{ background: incomplete ? 'var(--warn)' : 'var(--ok)' }} />
        {onlyIncomplete ? `${incomplete} à compléter · tout afficher` : incomplete ? `${incomplete} plan${incomplete > 1 ? 's' : ''} à compléter` : 'Tous les plans sont complets'}
      </button>
      <span className="spacer" />
      <button type="button" className="btn icon" onClick={() => st().undo()} disabled={!canUndo} aria-label="Annuler" title="Annuler (⌘Z)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button type="button" className="btn icon" onClick={() => st().redo()} disabled={!canRedo} aria-label="Rétablir" title="Rétablir (⇧⌘Z)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H10a6 6 0 000 12h3" />
        </svg>
      </button>
      <button type="button" className={`btn ${inspector ? 'on' : ''}`} aria-pressed={inspector} onClick={() => st().toggleInspector()} title="⌘I">
        Détails
      </button>
      <button type="button" className="btn" onClick={() => st().setShowSettings(true)} title="⌘,">
        Réglages
      </button>
      <button type="button" className="btn icon" onClick={() => st().setShowShortcuts(true)} aria-label="Raccourcis clavier" title="Raccourcis (?)">
        ?
      </button>
      <button type="button" className="btn primary" onClick={() => st().setShowExport(true)} title="⌘E">
        Exporter…
      </button>
    </header>
  );
}

export function SequenceIndex() {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const st = useApp.getState;
  const hereSeq = cursor ? locatePlan(doc, cursor.planId)?.seq.id : null;
  return (
    <nav className="index" aria-label="Séquences">
      <h2>Séquences</h2>
      {doc.sequences.map((s) => {
        const c = stripColors(s);
        return (
          <button
            key={s.id}
            type="button"
            className={`index-item ${s.id === hereSeq ? 'here' : ''}`}
            onClick={() => {
              st().expandAndGo(s.id);
              requestAnimationFrame(() => document.getElementById(`seq-${s.id}`)?.scrollIntoView({ block: 'start' }));
              focusGrid();
            }}
          >
            <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
            <span className="meta">
              <span className="row1">
                <b className="mono">{s.number || '?'}</b>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {s.plans.length}
                </span>
              </span>
              <span className="loc">{s.location || 'Décor à préciser'}</span>
            </span>
          </button>
        );
      })}
      <button type="button" className="btn ghost" style={{ marginTop: 6, justifyContent: 'flex-start', color: 'var(--accent)', fontWeight: 600 }} onClick={() => st().addSequence(hereSeq ?? null)}>
        + Séquence
      </button>
    </nav>
  );
}

export function StatusBar() {
  const message = useApp((s) => s.message);
  const anchor = useApp((s) => s.anchor);
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const view = useApp((s) => s.view);
  let hint = '';
  if (cursor && view === 'table') {
    const loc = locatePlan(doc, cursor.planId);
    if (loc) {
      const code = computeNumbers(doc).get(cursor.planId)?.code ?? '';
      const i = loc.plan.cameras.findIndex((c) => c.id === cursor.setupId);
      const label = doc.settings.cameras.find((k) => k.id === loc.plan.cameras[i]?.cameraId)?.label;
      const col = cursor.col === 'image' ? 'Image' : FIELD_LABEL[cursor.col];
      hint =
        `${code}${loc.plan.cameras.length > 1 ? ` · Cam ${label}` : ''} · ${col} — ` +
        (cursor.col === 'image' ? 'espace : aperçu · glissez une image sur la vignette' : 'tapez pour remplacer · ↩ modifier · ⌫ effacer');
    }
  }
  if (anchor && cursor && view === 'table') {
    const r = rangeOf(useApp.getState());
    if (r && (r.r1 > r.r0 || r.c1 > r.c0)) {
      const n = (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);
      hint = `${n} cellules sélectionnées — ⌘V colle partout · ⌫ efface · ⌘D recopie la première ligne · ⌘C copie · esc annule la sélection`;
    }
  }
  return (
    <footer className="status" role="status">
      <span className={`msg ${message ? message.kind : ''}`}>{message ? message.text : hint}</span>
      <span className="spacer" />
      <span className="keys">
        <span className="kbd">⌘↩</span>nouveau plan<span className="kbd">↩</span>modifier<span className="kbd">espace</span>aperçu<span className="kbd">?</span>raccourcis
      </span>
    </footer>
  );
}

function timeLabel(t: number | null): string {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SaveIndicator() {
  const p = useProject();
  if (p.mode === 'unsaved')
    return (
      <span className="save-state unsaved">
        Non enregistré ·{' '}
        <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => void saveAsDialog()}>
          Enregistrer…
        </button>
      </span>
    );
  if (p.mode !== 'file') return null;
  if (p.status === 'error')
    return (
      <span className="save-state error" title={p.error ?? ''} role="alert">
        Erreur d’enregistrement ·{' '}
        <button type="button" className="linkbtn danger" style={{ padding: 0 }} onClick={() => void flushSave()}>
          Réessayer
        </button>
      </span>
    );
  const label = p.status === 'saving' ? 'Enregistrement…' : p.status === 'pending' ? 'Modifié' : `Enregistré ${timeLabel(p.savedAt)}`;
  return (
    <span className="save-state" title={p.dir ?? ''}>
      <span className="dot" style={{ width: 6, height: 6, background: p.status === 'saved' ? 'var(--ok)' : 'var(--text3)' }} />
      {label}
    </span>
  );
}
