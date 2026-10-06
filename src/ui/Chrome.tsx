import { useMemo, type ReactNode } from 'react';
import { create } from 'zustand';
import { useApp } from '../state/appStore';
import { rangeOf, selectCursor, selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { locatePlan } from '../model/ops';
import { FIELD_LABEL } from '../model/entry';
import { itemLabel, verify, type PlanState, type VerifyItem } from '../model/verify';
import { planLinks } from '../model/links';
import type { Id } from '../model/types';
import { stripColors } from './strip';
import { focusGrid } from './focus';
import { flushSave, saveAsDialog, useProject } from '../state/project';
import { filmFlow } from '../model/stamps';
import { useFloor } from '../floor/floorStore';
import { IconChevron, IconClose, IconGear, IconSidebar, IconWarn } from './Icons';
import { openSpace, SPACE_OF, SPACES, useVerifyPanel, type Space } from './spaces';
import { Info } from './Info';

/** Relevé « À vérifier », recalculé à chaque modification du projet. */
function useVerification() {
  const doc = useApp(selectDoc);
  return useMemo(() => verify(doc), [doc]);
}

export function Toolbar() {
  const doc = useApp(selectDoc);
  const view = useApp((s) => s.view);
  const space = SPACE_OF[view];
  const n = useVerification().items.length;
  const verifyOpen = useVerifyPanel((s) => s.open);
  const st = useApp.getState;
  const keyOf: Record<Space, string> = { decoupage: '⌘1', sol: '⌘3', tournage: '⌘5' };

  return (
    <header className="toolbar">
      <div className="title">
        <b>{doc.meta.title || 'Sans titre'}</b>
        <SaveIndicator />
      </div>
      <nav className="spaces" aria-label="Espaces">
        {SPACES.map((sp) => (
          <button key={sp.id} type="button" aria-pressed={space === sp.id} onClick={() => openSpace(sp.id)} title={`${sp.label} (${keyOf[sp.id]})`}>
            {sp.label}
          </button>
        ))}
      </nav>
      <span className="spacer" />
      <div className="tool-icons">
        <button
          type="button"
          className={`btn icon verify-btn ${verifyOpen ? 'on' : ''}`}
          aria-pressed={verifyOpen}
          aria-label={`À vérifier${n ? ` : ${n}` : ''}`}
          title={n ? `À vérifier : ${n}` : 'Rien à vérifier'}
          onClick={() => useVerifyPanel.getState().set(!verifyOpen)}
        >
          <IconWarn />
          {n > 0 && <span className="badge">{n > 99 ? '99+' : n}</span>}
        </button>
        <button type="button" className="btn icon" aria-label="Réglages" onClick={() => st().setShowSettings(true)} title="Réglages du projet (⇧⌘,)">
          <IconGear />
        </button>
      </div>
      <button type="button" className="btn primary" onClick={() => st().setShowExport(true)} title="PDF, Excel, CSV (⌘E)">
        Exporter…
      </button>
    </header>
  );
}

/** Vues de l'espace en cours (Tableau · Fiches · Images ; Jours · Installations). */
export function SpaceBar({ children }: { children?: ReactNode }) {
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const sp = SPACES.find((x) => x.id === SPACE_OF[view])!;
  const st = useApp.getState;
  const showDetails = (view === 'table' || view === 'cards') && !inspector;
  if (sp.views.length < 2 && !children && !showDetails) return null;
  return (
    <div className="space-bar">
      {sp.views.length > 1 && (
        <div className="seg" role="group" aria-label={`Vues de l’espace ${sp.label}`}>
          {sp.views.map((v) => (
            <button key={v.view} type="button" aria-pressed={view === v.view} onClick={() => st().setView(v.view)} title={`${v.title} (${v.key})`}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      <span className="spacer" />
      {children}
      {showDetails && (
        <button type="button" className="btn icon ghost-icon" aria-label="Détails" title="Afficher les détails du plan (⌘I)" onClick={() => st().toggleInspector()}>
          <IconSidebar />
        </button>
      )}
    </div>
  );
}

/** Séquences dépliées dans l'arbre du film (la séquence du plan sélectionné l'est d'office). */
const useTree = create<{ open: Record<Id, boolean>; toggle(id: Id, now: boolean): void }>()((set) => ({
  open: {},
  toggle: (id, now) => set((s) => ({ open: { ...s.open, [id]: !now } })),
}));

const STATE_LABEL: Record<PlanState, string> = { ok: 'Complet', warn: 'À vérifier', none: 'Pas encore commencé' };

export function StateDot({ state }: { state: PlanState | undefined }) {
  const s = state ?? 'none';
  return <span className={`st st-${s}`} title={STATE_LABEL[s]} aria-hidden />;
}

/** Gauche : la structure du film, séquence par séquence, plan par plan. */
export function FilmTree() {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const open = useTree((s) => s.open);
  const { states } = useVerification();
  const numbers = computeNumbers(doc);
  const st = useApp.getState;
  const hereSeq = cursor ? locatePlan(doc, cursor.planId)?.seq.id : null;
  const nPlans = doc.sequences.reduce((a, s) => a + s.plans.length, 0);
  return (
    <nav className="index tree" aria-label="Le film">
      <div className="tree-head">
        <h2>Le film</h2>
        <span className="mono">{nPlans} plans</span>
      </div>
      {filmFlow(doc).map((it) => {
        if (it.kind === 'stamp')
          return (
            <button key={it.stamp.id} type="button" className="index-stamp" title={`Tampon${it.stamp.note.trim() ? ` · ${it.stamp.note.trim()}` : ''} — cliquer pour modifier`} onClick={() => st().setEditingStamp(it.stamp.id)}>
              <span>{it.stamp.text.trim() || 'Tampon'}</span>
            </button>
          );
        const s = it.seq;
        const c = stripColors(s);
        const isOpen = open[s.id] ?? s.id === hereSeq;
        return (
          <div key={s.id} className="tree-seq">
            <div className={`tree-seq-row ${s.id === hereSeq ? 'here' : ''}`}>
              <button type="button" className="tree-fold" aria-expanded={isOpen} aria-label={`${isOpen ? 'Replier' : 'Déplier'} les plans de la séquence ${s.number || '?'}`} onClick={() => useTree.getState().toggle(s.id, isOpen)}>
                <IconChevron open={isOpen} />
              </button>
              <button
                type="button"
                className="index-item"
                onClick={() => {
                  st().expandAndGo(s.id);
                  if (st().view === 'table') requestAnimationFrame(() => document.getElementById(`seq-${s.id}`)?.scrollIntoView({ block: 'start' }));
                  focusGrid();
                }}
              >
                <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
                <span className="loc">
                  <b className="mono">{s.number || '?'}</b> · {s.location || 'Décor à préciser'}
                </span>
                <span className="mono count">{s.plans.length}</span>
              </button>
            </div>
            {isOpen &&
              s.plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`tree-plan ${cursor?.planId === p.id ? 'here' : ''}`}
                  title={`${numbers.get(p.id)?.code ?? '?'} · ${STATE_LABEL[states.get(p.id) ?? 'none']}`}
                  onClick={() => {
                    st().goToPlan(p.id);
                    focusGrid();
                  }}
                >
                  <StateDot state={states.get(p.id)} />
                  <span className="mono">{numbers.get(p.id)?.code ?? '?'}</span>
                  <span className="act">{p.action.trim()}</span>
                </button>
              ))}
          </div>
        );
      })}
      <div className="index-actions">
        <button type="button" className="btn ghost" title="Nouvelle séquence après la séquence en cours" onClick={() => st().addSequence(hereSeq ?? null)}>
          + Séquence
        </button>
        <button type="button" className="btn ghost" title="TITRE, GÉNÉRIQUE DE FIN… après la séquence en cours" onClick={() => st().addStamp('', hereSeq ? { after: hereSeq } : null)}>
          + Tampon
        </button>
      </div>
    </nav>
  );
}

/** Mène à l'endroit où l'élément se corrige. */
function goTo(it: VerifyItem) {
  const st = useApp.getState();
  if (it.kind === 'day') {
    st.setView('days');
    return;
  }
  if (it.kind === 'fields') {
    if (st.view !== 'table' && st.view !== 'cards') st.setView('table');
    st.goToPlan(it.planId);
    focusGrid();
    return;
  }
  // Plan au sol : on ouvre le premier plan au sol de la séquence, caméra à placer.
  st.goToPlan(it.planId);
  const links = planLinks(st.hist.present.doc, it.planId);
  const f = links?.floors[0];
  if (!f) return;
  const cam = f.cameras.find((c) => !c.elementId);
  useFloor.getState().set({ currentId: f.id, selection: [], tool: 'select', draft: [], panel: 'plan', ...(cam ? { placing: { planId: it.planId, setupId: cam.setupId } } : {}) });
  st.setView('floor');
}

/** Droite, à la demande : un seul « À vérifier » pour tout le projet. */
export function VerifyPanel() {
  const { items, notStarted } = useVerification();
  const onlyIncomplete = useApp((s) => s.onlyIncomplete);
  const view = useApp((s) => s.view);
  const st = useApp.getState;
  const close = () => useVerifyPanel.getState().set(false);
  return (
    <aside className="verify" aria-label="À vérifier">
      <div className="verify-head">
        <strong>À vérifier</strong>
        <span className="mono">{items.length}</span>
        <Info title="À vérifier">
          <span>Cases du découpage vides, caméras absentes du plan au sol de leur séquence, séquences sans jour.</span>
          <span>Le plan au sol et les jours ne sont vérifiés qu’une fois commencés.</span>
        </Info>
        <span className="spacer" />
        <button type="button" className="btn icon ghost-icon" aria-label="Fermer À vérifier" onClick={close}>
          <IconClose />
        </button>
      </div>
      <div className="verify-body">
        {items.length === 0 && <div className="verify-empty">Rien à vérifier</div>}
        {items.map((it) => (
          <button key={`${it.kind}-${it.kind === 'day' ? it.seqId : it.planId}`} type="button" className="verify-item" onClick={() => goTo(it)}>
            <span className="st st-warn" aria-hidden />
            <span className="lbl">{itemLabel(it)}</span>
            <span className="go" aria-hidden>
              ›
            </span>
          </button>
        ))}
        {notStarted.length > 0 && (
          <>
            <div className="verify-sub">Pas encore commencés</div>
            <div className="verify-codes">
              {notStarted.map((p) => (
                <button
                  key={p.planId}
                  type="button"
                  className="verify-code mono"
                  onClick={() => {
                    if (st().view !== 'table' && st().view !== 'cards') st().setView('table');
                    st().goToPlan(p.planId);
                    focusGrid();
                  }}
                >
                  <span className="st st-none" aria-hidden />
                  {p.code}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {(view === 'table' || view === 'cards') && (items.some((i) => i.kind === 'fields') || notStarted.length > 0 || onlyIncomplete) && (
        <div className="verify-foot">
          <button
            type="button"
            className={`btn small ${onlyIncomplete ? 'on' : ''}`}
            aria-pressed={onlyIncomplete}
            onClick={() => {
              st().toggleOnlyIncomplete();
              focusGrid();
            }}
          >
            {onlyIncomplete ? 'Tout afficher' : 'N’afficher que les plans à compléter'}
          </button>
        </div>
      )}
    </aside>
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
      hint = `${code}${loc.plan.cameras.length > 1 ? ` · Cam ${label}` : ''} · ${col}`;
    }
  }
  if (anchor && cursor && view === 'table') {
    const r = rangeOf(useApp.getState());
    if (r && (r.r1 > r.r0 || r.c1 > r.c0)) {
      const n = (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);
      hint = `${n} cellules sélectionnées`;
    }
  }
  return (
    <footer className="status" role="status">
      <span className={`msg ${message ? message.kind : ''}`}>{message ? message.text : hint}</span>
      <span className="spacer" />
      <button type="button" className="help-btn" onClick={() => useApp.getState().setShowShortcuts(true)} aria-label="Raccourcis clavier" title="Aide et raccourcis (⌘/)">
        ?
      </button>
    </footer>
  );
}

function timeLabel(t: number | null): string {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** État d'enregistrement : une pastille quand tout va bien, des mots quand il faut agir. */
function SaveIndicator() {
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
    <span className="save-state" title={`${label}${p.dir ? `\n${p.dir}` : ''}`} aria-label={label}>
      <span className="dot" style={{ width: 7, height: 7, background: p.status === 'saved' ? 'var(--ok)' : 'var(--text3)' }} />
    </span>
  );
}
