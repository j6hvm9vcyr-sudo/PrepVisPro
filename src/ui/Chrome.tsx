import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/appStore';
import { rangeOf, selectCursor, selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { locatePlan } from '../model/ops';
import { itemLabel, verify, type PlanState, type VerifyItem } from '../model/verify';
import { planLinks } from '../model/links';
import type { Id } from '../model/types';
import { stripColors } from './strip';
import { focusGrid } from './focus';
import { flushSave, saveAsDialog, useProject } from '../state/project';
import { filmFlow } from '../model/stamps';
import { useFloor } from '../floor/floorStore';
import { IconClose, IconExport, IconGear, IconSidebar, SpaceIcons } from './Icons';
import { openSpace, SPACE_OF, SPACES, useVerifyPanel, type Space } from './spaces';
import { Info } from './Info';

/** Relevé « À vérifier », recalculé à chaque modification du projet. */
export function useVerification() {
  const doc = useApp(selectDoc);
  return useMemo(() => verify(doc), [doc]);
}

const KEY_OF: Record<Space, string> = { decoupage: '⌘1', sol: '⌘3', tournage: '⌘5' };

/** Barre des espaces, en bas de la fenêtre (comme les pages de Resolve). */
export function PageBar() {
  const view = useApp((s) => s.view);
  const space = SPACE_OF[view];
  const n = useVerification().items.length;
  const verifyOpen = useVerifyPanel((s) => s.open);
  const st = useApp.getState;
  return (
    <footer className="pagebar glass" data-tauri-drag-region>
      <div className="pagebar-left">
        <button
          type="button"
          className={`vpill verify-btn ${verifyOpen ? 'on' : ''}`}
          aria-pressed={verifyOpen}
          aria-label={`À vérifier${n ? ` : ${n}` : ''}`}
          title="À vérifier"
          onClick={() => useVerifyPanel.getState().set(!verifyOpen)}
        >
          <span className={`st ${n ? 'st-warn' : 'st-ok'}`} aria-hidden />
          {n ? `${n} à vérifier` : 'Rien à vérifier'}
        </button>
      </div>
      <nav className="pages" aria-label="Espaces">
        {SPACES.map((sp) => {
          const I = SpaceIcons[sp.id];
          return (
            <button key={sp.id} type="button" className="page" aria-pressed={space === sp.id} onClick={() => openSpace(sp.id)} title={`${sp.label} (${KEY_OF[sp.id]})`}>
              <I />
              <span>{sp.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="pagebar-right">
        <button type="button" className="ibtn" aria-label="Réglages" onClick={() => st().setShowSettings(true)} title="Réglages du projet (⇧⌘,)">
          <IconGear />
        </button>
        <button type="button" className="ibtn" aria-label="Exporter…" onClick={() => st().setShowExport(true)} title="Exporter… (⌘E)">
          <IconExport />
        </button>
        <button type="button" className="ibtn help-btn" onClick={() => st().setShowShortcuts(true)} aria-label="Raccourcis clavier" title="Aide et raccourcis (⌘/)">
          ?
        </button>
      </div>
    </footer>
  );
}

/** En haut de la colonne de gauche : le projet (menu), son état d'enregistrement et sa taille. */
export function ProjectHead() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const plans = doc.sequences.reduce((n, s) => n + s.plans.length, 0);
  // Non enregistré, ou erreur : l'état demande des mots (et un bouton), sur sa propre ligne.
  const saveNeedsWords = useProject((p) => p.mode === 'unsaved' || (p.mode === 'file' && p.status === 'error'));
  return (
    <div className="proj-head">
      <div className="titlebar-space" data-tauri-drag-region aria-hidden />
      <div className="proj-row">
        <BarMenu label={doc.meta.title || 'Sans titre'} className="proj-menu" title="Projet">
          <button type="button" role="menuitem" onClick={() => st().setShowSettings(true)}>
            Réglages du projet…
          </button>
          <button type="button" role="menuitem" onClick={() => st().setShowVersions(true)}>
            Versions…
          </button>
          <button type="button" role="menuitem" onClick={() => st().setShowExport(true)}>
            Exporter…
          </button>
        </BarMenu>
        {!saveNeedsWords && <SaveIndicator />}
      </div>
      <div className="proj-sub">
        {doc.sequences.length} séquence{doc.sequences.length > 1 ? 's' : ''} · {plans} plan{plans > 1 ? 's' : ''}
      </div>
      {saveNeedsWords && (
        <div className="proj-sub">
          <SaveIndicator />
        </div>
      )}
    </div>
  );
}

/** Petit menu déroulant de la barre des vues (« Filtrer ▾ »). */
export function BarMenu({ label, active, className = 'tool-b', title, children }: { label: string; active?: boolean; className?: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="bar-menu" ref={ref}>
      <button type="button" className={`${className} ${active ? 'on' : ''}`} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="lbl">{label}</span> <span className="chev" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="bar-pop" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Vues de l'espace en cours (Tableau · Fiches · Images ; Jours · Installations), et ses réglages à droite. */
export function SpaceBar({ left, children, views = true }: { left?: ReactNode; children?: ReactNode; views?: boolean }) {
  const view = useApp((s) => s.view);
  const inspector = useApp((s) => s.inspector);
  const onlyIncomplete = useApp((s) => s.onlyIncomplete);
  const sp = SPACES.find((x) => x.id === SPACE_OF[view])!;
  const st = useApp.getState;
  const decoupage = view === 'table' || view === 'cards';
  return (
    <div className="space-bar">
      {views && sp.views.length > 1 && (
        <div className="seg" role="group" aria-label={`Vues de l’espace ${sp.label}`}>
          {sp.views.map((v) => (
            <button key={v.view} type="button" aria-pressed={view === v.view} onClick={() => st().setView(v.view)} title={`${v.title} (${v.key})`}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      {left}
      <span className="spacer" />
      {children}
      {decoupage && (
        <BarMenu label="Filtrer" active={onlyIncomplete}>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={onlyIncomplete}
            onClick={() => {
              st().toggleOnlyIncomplete();
              focusGrid();
            }}
          >
            <span className="check" aria-hidden>
              {onlyIncomplete ? '✓' : ''}
            </span>
            Plans à compléter
          </button>
        </BarMenu>
      )}
      {decoupage && !inspector && (
        <button type="button" className="ibtn" aria-label="Détails" title="Afficher les détails du plan (⌘I)" onClick={() => st().toggleInspector()}>
          <IconSidebar />
        </button>
      )}
    </div>
  );
}

const STATE_LABEL: Record<PlanState, string> = { ok: 'Complet', warn: 'À vérifier', none: 'Pas encore commencé' };

export function StateDot({ state }: { state: PlanState | undefined }) {
  const s = state ?? 'none';
  return <span className={`st st-${s}`} title={STATE_LABEL[s]} aria-hidden />;
}

/**
 * Gauche : la structure du film. Toutes les séquences ; les plans de la séquence en cours.
 * `onPlan` : ce que fait un clic sur un plan (par défaut, le sélectionner dans le découpage).
 */
export function FilmTree({ onPlan, head }: { onPlan?: (planId: Id) => void; head?: ReactNode }) {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const { states } = useVerification();
  const numbers = computeNumbers(doc);
  const st = useApp.getState;
  const hereSeq = cursor ? locatePlan(doc, cursor.planId)?.seq.id : null;
  const choose = onPlan ?? ((id: Id) => {
    st().goToPlan(id);
    focusGrid();
  });
  return (
    <nav className="tree glass-panel" aria-label="Le film">
      <ProjectHead />
      {head}
      {filmFlow(doc).map((it) => {
        if (it.kind === 'stamp')
          return (
            <button key={it.stamp.id} type="button" className="tree-stamp" title={`Tampon${it.stamp.note.trim() ? ` · ${it.stamp.note.trim()}` : ''} — cliquer pour modifier`} onClick={() => st().setEditingStamp(it.stamp.id)}>
              {it.stamp.text.trim() || 'Tampon'}
            </button>
          );
        const s = it.seq;
        const c = stripColors(s);
        const open = s.id === hereSeq;
        const done = s.plans.filter((p) => states.get(p.id) === 'ok').length;
        return (
          <div key={s.id} className="tree-seq">
            <button
              type="button"
              className={`tree-seq-row ${open ? 'open' : ''}`}
              aria-expanded={open}
              title={`Séquence ${s.number || '?'} · ${s.plans.length} plan${s.plans.length > 1 ? 's' : ''}`}
              onClick={() => {
                const first = s.plans[0];
                if (first) choose(first.id);
                if (st().view === 'table') requestAnimationFrame(() => document.getElementById(`seq-${s.id}`)?.scrollIntoView({ block: 'start' }));
              }}
            >
              <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
              <span className="lbl">
                {s.number || '?'} · {s.location || 'Décor à préciser'}
              </span>
              {s.plans.length > 0 && (
                <span className="cnt mono" title={`${done} plan${done > 1 ? 's' : ''} complet${done > 1 ? 's' : ''} sur ${s.plans.length}`}>
                  {done}/{s.plans.length}
                </span>
              )}
            </button>
            {open &&
              s.plans.map((p) => (
                <button key={p.id} type="button" className={`tree-plan ${cursor?.planId === p.id ? 'here' : ''}`} aria-label={`Plan ${numbers.get(p.id)?.code ?? '?'}`} title={`${numbers.get(p.id)?.code ?? '?'} · ${STATE_LABEL[states.get(p.id) ?? 'none']}`} onClick={() => choose(p.id)}>
                  <span className="mono">{numbers.get(p.id)?.code ?? '?'}</span>
                  <StateDot state={states.get(p.id)} />
                </button>
              ))}
          </div>
        );
      })}
      <div className="tree-actions">
        <button type="button" className="linkbtn" title="Nouvelle séquence après la séquence en cours" onClick={() => st().addSequence(hereSeq ?? null)}>
          + Séquence
        </button>
        <button type="button" className="linkbtn" title="TITRE, GÉNÉRIQUE DE FIN… après la séquence en cours" onClick={() => st().addStamp('', hereSeq ? { after: hereSeq } : null)}>
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
  const st = useApp.getState;
  const close = () => useVerifyPanel.getState().set(false);
  return (
    <aside className="side-panel verify" aria-label="À vérifier">
      <div className="side-head">
        <strong>À vérifier</strong>
        <span className="count">{items.length}</span>
        <Info title="À vérifier">
          <span>Cases du découpage vides, caméras absentes du plan au sol de leur séquence, séquences sans jour.</span>
          <span>Le plan au sol et les jours ne sont vérifiés qu’une fois commencés.</span>
        </Info>
        <span className="spacer" />
        <button type="button" className="ibtn small" aria-label="Fermer À vérifier" onClick={close}>
          <IconClose />
        </button>
      </div>
      <div className="side-body">
        {items.length === 0 && <div className="empty-line">Rien à vérifier</div>}
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
            <div className="side-sub">Pas encore commencés</div>
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
    </aside>
  );
}

/** Messages : une bulle discrète en bas de la fenêtre, et l'aide « ? » en bas à droite. */
export function StatusBar() {
  const message = useApp((s) => s.message);
  const anchor = useApp((s) => s.anchor);
  const cursor = useApp(selectCursor);
  const view = useApp((s) => s.view);
  let hint = '';
  if (anchor && cursor && view === 'table') {
    const r = rangeOf(useApp.getState());
    if (r && (r.r1 > r.r0 || r.c1 > r.c0)) hint = `${(r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1)} cellules sélectionnées`;
  }
  const text = message ? message.text : hint;
  return (
    <>
      <div className={`status ${text ? 'shown' : ''}`} role="status">
        <span className={`msg ${message ? message.kind : ''}`}>{text}</span>
      </div>
    </>
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
      <span className="dot" style={{ width: 8, height: 8, background: p.status === 'saved' ? 'var(--ok)' : 'var(--text3)' }} />
    </span>
  );
}
