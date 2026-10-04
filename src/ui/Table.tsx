import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useApp } from '../state/appStore';
import { rangeOf, selectCursor, selectDoc } from '../state/store';
import { COLUMNS } from '../state/lines';
import type { Column } from '../state/lines';
import type { Plan, ProjectSettings, Sequence } from '../model/types';
import { computeNumbers } from '../model/numbering';
import { displayText, isEvolving, type EditableField } from '../model/entry';
import { DEFAULT_TERMS } from '../model/defaults';
import { missingFields } from '../model/completeness';
import { coverImage } from '../model/images';
import { imageStore } from '../platform/images';
import { norm } from '../model/text';
import { CellEditor } from './CellEditor';
import { registerGrid } from './focus';
import { sequenceTitle, stripColors } from './strip';

const TECH: { col: Exclude<EditableField, 'action'>; label: string }[] = [
  { col: 'size', label: 'Valeur' },
  { col: 'axis', label: 'Axe' },
  { col: 'angle', label: 'Angle' },
  { col: 'focal', label: 'Focale' },
  { col: 'movement', label: 'Mouvement' },
  { col: 'grip', label: 'Machinerie' },
];

const CATEGORY_OF = { size: 'size', axis: 'axis', angle: 'angle', movement: 'movement', grip: 'grip' } as const;

/** Un terme est « personnalisé » s'il ne fait pas partie de la liste de base. */
function isCustom(col: Exclude<EditableField, 'action'>, plan: Plan, setupIndex: number): boolean {
  if (col === 'focal') return false;
  const base = DEFAULT_TERMS[CATEGORY_OF[col]].map(norm);
  const c = plan.cameras[setupIndex]!;
  const values = col === 'movement' ? c.movements : col === 'grip' ? c.grip : [c.start[col], c.end?.[col] ?? ''];
  return values.some((v) => v && !base.includes(norm(v)));
}

export const cellId = (setupId: string, col: Column) => `cell-${setupId}-${col}`;

export function DecoupageTable() {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const editing = useApp((s) => s.editing);
  const collapsed = useApp((s) => s.collapsed);
  const onlyIncomplete = useApp((s) => s.onlyIncomplete);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const anchor = useApp((s) => s.anchor);
  // Sélection de plusieurs cellules : pour chaque plan concerné, colonnes sélectionnées par caméra.
  const selection = useMemo(() => {
    if (!anchor || !cursor) return null;
    const r = rangeOf({ ...useApp.getState(), cursor, anchor });
    if (!r || (r.r0 === r.r1 && r.c0 === r.c1)) return null;
    const m = new Map<string, Record<string, [number, number]>>();
    for (let i = r.r0; i <= r.r1; i++) {
      const l = r.lines[i]!;
      const rec = m.get(l.planId) ?? {};
      rec[l.setupId] = [r.c0, r.c1];
      m.set(l.planId, rec);
    }
    return { map: m, cells: (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1) };
  }, [anchor, cursor, doc, collapsed, onlyIncomplete]); // eslint-disable-line react-hooks/exhaustive-deps
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerGrid(gridRef.current);
    gridRef.current?.focus({ preventScroll: true });
    return () => registerGrid(null);
  }, []);

  useEffect(() => {
    if (!cursor) return;
    document.getElementById(cellId(cursor.setupId, cursor.col))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const st = useApp.getState();
    if (st.editing) {
      // Frappe rapide : les touches arrivées avant que le champ de saisie n'ait le focus
      // ne doivent pas être perdues.
      if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
      if (e.key.length === 1) {
        e.preventDefault();
        st.setEditText(st.editing.text + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        st.setEditText(st.editing.text.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        st.commitEdit('down');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        st.commitEdit(e.shiftKey ? 'left' : 'right');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        st.cancelEdit();
      }
      return;
    }
    // Une fenêtre superposée (aperçu, aide…) a la main sur le clavier.
    if (st.preview || st.showShortcuts || st.pendingDrop || st.editingSequenceId) return;
    if (e.nativeEvent.isComposing) return;
    const meta = e.metaKey || e.ctrlKey;
    const ext = e.shiftKey;
    if (meta && !e.altKey) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        st.jump('top', ext);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        st.jump('bottom', ext);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        st.jump('home', ext);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        st.jump('end', ext);
      } else if (e.key.toLowerCase() === 'd' && !ext) {
        e.preventDefault();
        st.fillDown();
      } else if (e.key.toLowerCase() === 'a' && !ext) {
        // ⌘A : toute la colonne visible.
        e.preventDefault();
        st.jump('top');
        st.jump('bottom', true);
      }
      return;
    }
    if (e.altKey) return;
    const c = selectCursor(st);
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        st.move(-1, 0, false, ext);
        return;
      case 'ArrowDown':
        e.preventDefault();
        st.move(1, 0, false, ext);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        st.move(0, -1, false, ext);
        return;
      case 'ArrowRight':
        e.preventDefault();
        st.move(0, 1, false, ext);
        return;
      case 'Home':
        e.preventDefault();
        st.jump(meta ? 'top' : 'home', ext);
        return;
      case 'End':
        e.preventDefault();
        st.jump(meta ? 'bottom' : 'end', ext);
        return;
      case 'PageDown':
        e.preventDefault();
        st.move(12, 0, false, ext);
        return;
      case 'PageUp':
        e.preventDefault();
        st.move(-12, 0, false, ext);
        return;
      case 'Escape':
        if (st.anchor) {
          e.preventDefault();
          st.setCursor(c!);
        }
        return;
      case 'Tab':
        e.preventDefault();
        st.move(0, e.shiftKey ? -1 : 1, true);
        return;
      case 'Enter':
        e.preventDefault();
        st.startEdit();
        return;
      case ' ':
        e.preventDefault();
        st.openPreview();
        return;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        st.clearCell();
        return;
    }
    if (e.key.length === 1 && c && c.col !== 'image' && e.key !== '?') {
      e.preventDefault();
      st.startEdit(e.key);
    }
  };

  return (
    <div className="table-scroll">
      <div
        ref={gridRef}
        className="grid"
        role="grid"
        aria-label="Découpage"
        tabIndex={0}
        aria-activedescendant={cursor ? cellId(cursor.setupId, cursor.col) : undefined}
        onKeyDown={onKeyDown}
        onCopy={(e) => {
          const st = useApp.getState();
          if (st.editing) return;
          const t = st.copyCell();
          if (t === null) return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', t);
          st.setMessage('Copié');
        }}
        onCut={(e) => {
          const st = useApp.getState();
          if (st.editing) return;
          const t = st.copyCell();
          if (t === null) return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', t);
          st.clearCell();
        }}
        onPaste={(e) => {
          const st = useApp.getState();
          if (st.editing) return;
          // Image copiée (capture d'écran, image d'un site, d'un film…) : ajoutée au plan.
          const files = Array.from(e.clipboardData.files ?? []).filter((f) => f.type.startsWith('image/'));
          const c = selectCursor(st);
          if (files.length && c) {
            e.preventDefault();
            st.requestDrop(c.planId, files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `presse-papiers-${i + 1}.${f.type.split('/')[1] || 'png'}`, { type: f.type }))));
            return;
          }
          const t = e.clipboardData.getData('text/plain');
          if (!t) return;
          e.preventDefault();
          st.pasteText(t);
        }}
      >
        <div className="grid-cols grid-head" role="row">
          <span role="columnheader">N°</span>
          <span role="columnheader">Plan</span>
          <span role="columnheader">Image</span>
          <span role="columnheader">Action</span>
          {TECH.map((t) => (
            <span key={t.col} role="columnheader">
              {t.label}
            </span>
          ))}
        </div>
        {doc.sequences.map((seq) => (
          <SequenceBlock
            key={seq.id}
            seq={seq}
            settings={doc.settings}
            collapsed={!!collapsed[seq.id]}
            onlyIncomplete={onlyIncomplete}
            numbers={numbers}
            cursorPlanId={cursor?.planId ?? null}
            cursorSetupId={cursor?.setupId ?? null}
            cursorCol={cursor?.col ?? null}
            editing={!!editing}
            selection={selection?.map ?? null}
          />
        ))}
        <div style={{ height: 160 }} />
      </div>
    </div>
  );
}

interface BlockProps {
  seq: Sequence;
  settings: ProjectSettings;
  collapsed: boolean;
  onlyIncomplete: boolean;
  numbers: ReturnType<typeof computeNumbers>;
  cursorPlanId: string | null;
  cursorSetupId: string | null;
  cursorCol: Column | null;
  editing: boolean;
  selection: Map<string, Record<string, [number, number]>> | null;
}

function SequenceBlock(p: BlockProps) {
  const { seq } = p;
  const colors = stripColors(seq);
  const st = useApp.getState;
  const plans = p.onlyIncomplete ? seq.plans.filter((x) => missingFields(x, p.settings).length > 0) : seq.plans;
  return (
    <>
      <div className="band" id={`seq-${seq.id}`} role="row">
        <button
          type="button"
          className="chev"
          aria-expanded={!p.collapsed}
          aria-label={`${p.collapsed ? 'Déplier' : 'Replier'} la séquence ${seq.number}`}
          onClick={() => st().toggleCollapsed(seq.id)}
          tabIndex={-1}
        >
          {p.collapsed ? '▸' : '▾'}
        </button>
        <span className="strip wide" style={{ background: colors.fill, borderColor: colors.edge }} />
        <span className="num mono">SÉQ. {seq.number || '?'}</span>
        <span className="ttl">{sequenceTitle(seq)}</span>
        <span className="cnt">
          {seq.plans.length} plan{seq.plans.length > 1 ? 's' : ''}
          {p.onlyIncomplete ? ` · ${plans.length} à compléter` : ''}
        </span>
        <span className="spacer" />
        <button type="button" className="linkbtn" tabIndex={-1} aria-label={`Modifier la séquence ${seq.number}`} onClick={() => st().setEditingSequence(seq.id)}>
          Modifier
        </button>
      </div>
      {!p.collapsed &&
        plans.map((plan) => {
          const n = p.numbers.get(plan.id)!;
          const here = plan.id === p.cursorPlanId;
          return (
            <PlanRows
              key={plan.id}
              plan={plan}
              settings={p.settings}
              code={n.code}
              global={n.global}
              isReprise={n.repriseLetter !== ''}
              activeSetupId={here ? p.cursorSetupId : null}
              activeCol={here ? p.cursorCol : null}
              editing={here && p.editing}
              sel={p.selection?.get(plan.id) ?? null}
            />
          );
        })}
      {!p.collapsed && seq.comments.trim() && (
        <div className="seq-comments" role="row">
          <b>Commentaires : </b>
          {seq.comments.trim()}
        </div>
      )}
    </>
  );
}

interface RowsProps {
  plan: Plan;
  settings: ProjectSettings;
  code: string;
  global: number;
  isReprise: boolean;
  activeSetupId: string | null;
  activeCol: Column | null;
  editing: boolean;
  sel: Record<string, [number, number]> | null;
}

const PlanRows = memo(function PlanRows({ plan, settings, code, global, isReprise, activeSetupId, activeCol, editing, sel }: RowsProps) {
  const missing = missingFields(plan, settings);
  const multi = plan.cameras.length > 1;
  const cover = coverImage(plan);
  const coverUrl = cover ? imageStore.url(cover.file) : null;
  const [dropOver, setDropOver] = useState(false);
  const st = useApp.getState;
  const req = settings.required;

  const select = (setupId: string, col: Column, shift = false) => {
    let s = st();
    if (shift && !s.editing) {
      s.extendTo({ planId: plan.id, setupId, col });
      return;
    }
    if (s.editing) {
      // Clic ailleurs pendant une saisie : validation stricte (rien de deviné), puis on se déplace.
      if (!s.commitEdit('stay', undefined, true)) {
        const err = st().editing?.error ?? '';
        st().cancelEdit();
        st().setMessage(`Saisie non appliquée : ${err}`, 'warn');
      }
      s = st();
      s.setCursor({ planId: plan.id, setupId, col });
      return;
    }
    const c = selectCursor(s);
    if (c && c.planId === plan.id && c.setupId === setupId && c.col === col) {
      s.startEdit();
      return;
    }
    s.setCursor({ planId: plan.id, setupId, col });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const files = Array.from(e.dataTransfer.files);
    st().setCursor({ planId: plan.id, setupId: plan.cameras[0]!.id, col: 'image' });
    st().requestDrop(plan.id, files);
  };

  return (
    <>
      {plan.cameras.map((setup, i) => {
        const first = i === 0;
        const lineActive = setup.id === activeSetupId;
        const label = settings.cameras.find((k) => k.id === setup.cameraId)?.label ?? '?';
        const range = sel?.[setup.id];
        const cls = (col: Column, extra = '') => {
          const k = COLUMNS.indexOf(col);
          const inRange = range && k >= range[0] && k <= range[1];
          return `c cell ${extra} ${lineActive && activeCol === col ? 'active' : ''} ${inRange ? 'inrange' : ''}`;
        };
        const techMissing: Record<string, boolean> = {
          size: req.size && !setup.start.size,
          axis: req.axis && !setup.start.axis,
          angle: req.angle && !setup.start.angle && setup.start.tiltDeg === null,
          focal: req.focal && setup.start.focalMm === null,
          movement: req.movement && setup.movements.length === 0,
          grip: req.grip && setup.grip.length === 0,
        };
        return (
          <div
            key={setup.id}
            role="row"
            aria-selected={lineActive}
            className={`grid-cols line ${first ? 'first' : 'cont'} ${lineActive ? 'sel' : ''} ${i < plan.cameras.length - 1 ? 'joined' : ''}`}
          >
            <span className="c n mono">{first ? global : ''}</span>
            <span className="c code">
              {first && (
                <span
                  className="dot"
                  title={missing.length ? `À compléter : ${missing.join(', ')}` : 'Complet'}
                  style={{ background: missing.length ? 'var(--warn)' : 'var(--ok)', width: 7, height: 7 }}
                />
              )}
              {first && <b className="mono">{code}</b>}
              {multi && <span className="camtag mono">{label}</span>}
              {first && isReprise && <span className="rep sr-only">reprise</span>}
            </span>
            <div
              id={cellId(setup.id, 'image')}
              role="gridcell"
              className={cls('image', 'img')}
              onMouseDown={(e) => select(setup.id, 'image', e.shiftKey)}
              onDoubleClick={() => st().openPreview(plan.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDropOver(true);
              }}
              onDragLeave={() => setDropOver(false)}
              onDrop={onDrop}
            >
              {first && (
                <div className={`thumb ${coverUrl ? 'has' : ''} ${dropOver ? 'drop' : ''}`}>
                  {coverUrl ? <img src={coverUrl} alt="" draggable={false} /> : <span>{dropOver ? 'déposer' : ''}</span>}
                  {plan.images.length > 1 && <span className="more mono">+{plan.images.length - 1}</span>}
                </div>
              )}
            </div>
            <div
              id={cellId(setup.id, 'action')}
              role="gridcell"
              className={cls('action', `action ${first ? (plan.action ? '' : req.action ? 'missing' : 'empty') : 'dim'}`)}
              onMouseDown={(e) => select(setup.id, 'action', e.shiftKey)}
              onDoubleClick={() => st().startEdit()}
              title={first ? plan.action : ''}
            >
              <span className="txt">{first ? plan.action || '—' : `Cam ${label} · même plan`}</span>
              {lineActive && activeCol === 'action' && editing && <CellEditor field="action" />}
            </div>
            {TECH.map(({ col }) => {
              const txt = displayText(col, setup);
              const flags = [
                !txt ? (techMissing[col] ? 'missing' : 'empty') : '',
                txt && isEvolving(col, setup) ? 'evol' : '',
                txt && isCustom(col, plan, i) ? 'custom' : '',
                col === 'focal' ? 'mono' : '',
              ].join(' ');
              return (
                <div
                  key={col}
                  id={cellId(setup.id, col)}
                  role="gridcell"
                  className={cls(col, flags)}
                  onMouseDown={(e) => select(setup.id, col, e.shiftKey)}
                  onDoubleClick={() => st().startEdit()}
                  title={txt}
                >
                  <span className="txt">{txt || '—'}</span>
                  {lineActive && activeCol === col && editing && <CellEditor field={col} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
});
