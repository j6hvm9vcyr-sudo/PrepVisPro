import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { filmDuration, formatDuration } from '../model/duration';
import { useApp } from '../state/appStore';
import { rangeOf, selectCursor, selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { locatePlan } from '../model/ops';
import { itemLabel, verify, type PlanState, type VerifyItem } from '../model/verify';
import { planLinks } from '../model/links';
import { DEFAULT_TABLE_COLUMNS, TABLE_COLUMN_IDS, type Id, type TableColumnId } from '../model/types';
import { stripColors } from './strip';
import { focusGrid } from './focus';
import { flushSave, saveAsDialog, useProject } from '../state/project';
import { filmFlow } from '../model/stamps';
import { useFloor } from '../floor/floorStore';
import { IconClose, IconExport, IconGear, IconGrid, IconList, PanelIcons, SpaceIcons } from './Icons';
import { PANEL_KEY, PANEL_LABEL, togglePanel, usePanelOpen, type PanelId } from './panels';
import { isGridView, openSpace, SPACE_OF, SPACES, useVerifyPanel, type Space } from './spaces';
import { Info } from './Info';

/** Relevé « À vérifier », recalculé à chaque modification du projet. */
export function useVerification() {
  const doc = useApp(selectDoc);
  return useMemo(() => verify(doc), [doc]);
}

const KEY_OF: Record<Space, string> = { decoupage: '⌘1', sol: '⌘2', tournage: '⌘3' };

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

/** Panneaux qu'on ouvre ou ferme dans chaque page (0.18 ; Plans au sol en 0.19). */
const PANELS_OF: Record<Space, PanelId[]> = { decoupage: ['film', 'scenario', 'images', 'notes'], sol: [], tournage: ['film'] };

function PanelToggle({ id }: { id: PanelId }) {
  const on = usePanelOpen(id);
  const I = PanelIcons[id];
  return (
    <button type="button" className={`tog ${on ? 'on' : ''}`} aria-pressed={on} aria-label={PANEL_LABEL[id]} title={`${on ? 'Masquer' : 'Afficher'} ${PANEL_LABEL[id]} (${PANEL_KEY[id]})`} onMouseDown={(e) => e.preventDefault()} onClick={() => togglePanel(id)}>
      <I />
      <span>{PANEL_LABEL[id]}</span>
    </button>
  );
}

/**
 * Barre du haut (0.18, comme celle de Resolve) : les panneaux de la page à gauche, le projet au centre
 * (menu, enregistrement, taille du film), Détails à droite.
 */
export function InterfaceBar() {
  const doc = useApp(selectDoc);
  const view = useApp((s) => s.view);
  const space = SPACE_OF[view];
  const st = useApp.getState;
  const plans = doc.sequences.reduce((n, s) => n + s.plans.length, 0);
  const total = filmDuration(doc);
  const film = total.counted ? total : null;
  return (
    <header className="ibar glass" data-tauri-drag-region aria-label="Panneaux">
      <div className="ibar-side" data-tauri-drag-region>
        <span className="lights-space" data-tauri-drag-region aria-hidden />
        {PANELS_OF[space].map((id) => (
          <PanelToggle key={id} id={id} />
        ))}
      </div>
      <div className="ibar-proj" data-tauri-drag-region>
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
        <SaveIndicator />
        <span className="proj-sub" data-tauri-drag-region>
          {doc.sequences.length} séquence{doc.sequences.length > 1 ? 's' : ''} · {plans} plan{plans > 1 ? 's' : ''}
          {film && (
            <span title={film.missing ? `Durée des plans minutés, sans les reprises ; ${film.missing} plan${film.missing > 1 ? 's' : ''} sans durée` : 'Durée du film, sans les reprises'}>
              {' '}
              · {formatDuration(film.seconds)}
              {film.missing ? ' +' : ''}
            </span>
          )}
        </span>
      </div>
      <div className="ibar-side right" data-tauri-drag-region>
        {space === 'decoupage' && <PanelToggle id="details" />}
      </div>
    </header>
  );
}

/** En-tête d'un panneau : son nom, son ⓘ, et de quoi le fermer. */
export function PanelHead({ label, count, info, onClose, children }: { label: string; count?: ReactNode; info?: ReactNode; onClose?: () => void; children?: ReactNode }) {
  return (
    <div className="panel-head">
      <span className="panel-h">{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
      {info}
      <span className="spacer" />
      {children}
      {onClose && (
        <button type="button" className="ibtn small" aria-label={`Fermer ${label}`} onClick={onClose}>
          <IconClose />
        </button>
      )}
    </div>
  );
}

/** Petit menu déroulant de la barre des vues (« Afficher ▾ »). */
export function BarMenu({ label, active, className = 'tool-b', title, keepOpen = false, children }: { label: string; active?: boolean; className?: string; title?: string; keepOpen?: boolean; children: ReactNode }) {
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
        <div className="bar-pop" role="menu" onClick={() => !keepOpen && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

const COLUMN_LABEL: Record<TableColumnId, string> = { image: 'Image', size: 'Valeur', axis: 'Axe', angle: 'Angle', focal: 'Focale', movement: 'Mouvement', grip: 'Machinerie', duration: 'Durée', notes: 'Notes' };

/**
 * Colonnes ▾ : colonnes affichées dans le tableau (N°, caméra et action sont toujours là).
 * Réglage du projet, annulable ; le modèle d'export « Comme le tableau » le reprend.
 */
function ColumnsMenu() {
  const shown = useApp((s) => s.hist.present.doc.settings.tableColumns);
  const custom = shown.join() !== DEFAULT_TABLE_COLUMNS.join();
  return (
    <BarMenu label="Colonnes" active={custom} keepOpen title="Colonnes du tableau (et de l’export « Comme le tableau »)">
      {TABLE_COLUMN_IDS.map((c) => {
        const on = shown.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="menuitemcheckbox"
            aria-checked={on}
            onClick={() => {
              useApp.getState().updateDoc((d) => void (d.settings.tableColumns = TABLE_COLUMN_IDS.filter((x) => (x === c ? !on : d.settings.tableColumns.includes(x)))), undefined, `Colonne ${COLUMN_LABEL[c]} ${on ? 'masquée' : 'affichée'}`);
              // Durée et Notes sont au bout du tableau : on les fait voir s'il dépasse.
              if (!on && (c === 'duration' || c === 'notes')) setTimeout(() => document.querySelector('.table-scroll')?.scrollTo({ left: 1e6 }), 0);
            }}
          >
            <span className="check" aria-hidden>
              {on ? '✓' : ''}
            </span>
            {COLUMN_LABEL[c]}
          </button>
        );
      })}
    </BarMenu>
  );
}

/** Barre de la surface : Liste / Fiches, Filtrer, Colonnes (Découpage) ; Jours / Installations (Tournage). */
export function SpaceBar({ left, children, views = true }: { left?: ReactNode; children?: ReactNode; views?: boolean }) {
  const view = useApp((s) => s.view);
  const onlyIncomplete = useApp((s) => s.onlyIncomplete);
  const sp = SPACES.find((x) => x.id === SPACE_OF[view])!;
  const st = useApp.getState;
  const decoupage = sp.id === 'decoupage';
  return (
    <div className="space-bar">
      {views && decoupage && (
        <div className="seg ico-seg" role="group" aria-label="Affichage du découpage">
          {sp.views.map((v) => (
            <button key={v.view} type="button" aria-pressed={view === v.view} aria-label={v.label} onClick={() => st().setView(v.view)} title={`${v.title} (${v.key})`}>
              {v.view === 'cards' ? <IconGrid /> : <IconList />}
            </button>
          ))}
        </div>
      )}
      {views && !decoupage && sp.views.length > 1 && (
        <div className="seg" role="group" aria-label={`Vues de l’espace ${sp.label}`}>
          {sp.views.map((v) => (
            <button key={v.view} type="button" aria-pressed={view === v.view} onClick={() => st().setView(v.view)} title={v.key ? `${v.title} (${v.key})` : v.title}>
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
      {isGridView(view) && <ColumnsMenu />}
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
      <PanelHead label="Le film" onClose={() => togglePanel('film')} />
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
                if (isGridView(st().view)) requestAnimationFrame(() => document.getElementById(`seq-${s.id}`)?.scrollIntoView({ block: 'start' }));
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
    if (!isGridView(st.view) && st.view !== 'cards') st.setView('table');
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
      <PanelHead
        label="À vérifier"
        count={items.length}
        info={
          <Info title="À vérifier">
            <span>Cases du découpage vides, caméras absentes du plan au sol de leur séquence, séquences sans jour.</span>
            <span>Le plan au sol et les jours ne sont vérifiés qu’une fois commencés.</span>
          </Info>
        }
        onClose={close}
      />
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
                    if (!isGridView(st().view) && st().view !== 'cards') st().setView('table');
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
  if (anchor && cursor && isGridView(view)) {
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
