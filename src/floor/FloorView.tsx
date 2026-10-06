import { Picker } from '../ui/Picker';
import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addFloorPlan, cameraLabel, newFloorPlan } from '../model/floorOps';
import { formatNumber } from '../model/text';
import { computeNumbers } from '../model/numbering';
import { locatePlan } from '../model/ops';
import type { FloorPlan } from '../model/floor';
import type { Id } from '../model/types';
import { useFloor, type FloorTool } from './floorStore';
import { FloorCanvas } from './FloorCanvas';
import { FloorInspector } from './FloorInspector';
import { BarMenu, ProjectHead, SpaceBar } from '../ui/Chrome';
import { filmFlow } from '../model/stamps';
import { stripColors } from '../ui/strip';
import { ToolIcons } from '../ui/Icons';

const TOOLS: { id: Exclude<FloorTool, 'path'>; label: string; key: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V' },
  { id: 'camera', label: 'Caméra', key: 'C' },
  { id: 'actor', label: 'Personnage', key: 'P' },
  { id: 'light', label: 'Projecteur', key: 'L' },
  { id: 'reflector', label: 'Réflecteur', key: 'B' },
  { id: 'text', label: 'Texte', key: 'T' },
  { id: 'measure', label: 'Mesure', key: 'M' },
  { id: 'scale', label: 'Échelle', key: 'E' },
];

const PANELS = [
  { id: 'plan', label: 'Plan au sol' },
  { id: 'light', label: 'Lumière' },
] as const;

/** Un plan du découpage choisi dans l'arbre : sa caméra est sélectionnée si elle est placée, sinon prête à placer. */
function choosePlan(planId: Id) {
  const st = useApp.getState();
  st.goToPlan(planId);
  const doc = selectDoc(st);
  const loc = locatePlan(doc, planId);
  if (!loc) return;
  const ui = useFloor.getState();
  const cur = doc.floorPlans.find((f) => f.id === ui.currentId);
  const fp = cur && cur.sequenceIds.includes(loc.seq.id) ? cur : doc.floorPlans.find((f) => f.sequenceIds.includes(loc.seq.id));
  if (!fp) return;
  const el = fp.elements.find((e) => e.kind === 'camera' && e.planId === planId);
  if (el) useFloor.getState().set({ currentId: fp.id, selection: [el.id], placing: null, tool: 'select', panel: 'plan' });
  else useFloor.getState().set({ currentId: fp.id, selection: [], placing: { planId, setupId: loc.plan.cameras[0]!.id }, tool: 'select', panel: 'plan' });
}

export function FloorView() {
  const doc = useApp(selectDoc);
  const ui = useFloor();
  const st = useApp.getState;
  const cursorPlan = useApp((s) => s.cursor?.planId);
  // Plan au sol courant : celui choisi, sinon celui de la séquence du plan sélectionné dans le découpage.
  const current = doc.floorPlans.find((f) => f.id === ui.currentId) ?? null;
  useEffect(() => {
    if (current || !doc.floorPlans.length) return;
    const seq = doc.sequences.find((s) => s.plans.some((p) => p.id === cursorPlan));
    const fp = (seq && doc.floorPlans.find((f) => f.sequenceIds.includes(seq.id))) ?? doc.floorPlans[0]!;
    useFloor.getState().set({ currentId: fp.id, selection: [] });
  }, [current, doc.floorPlans, doc.sequences, cursorPlan]);

  const create = (seqId: string) => {
    const s = doc.sequences.find((x) => x.id === seqId);
    if (!s) return;
    const fp = newFloorPlan(`Séq. ${s.number || '?'} — ${s.location || 'Décor'}`, [s.id]);
    st().applyDoc(addFloorPlan(doc, fp), 'Plan au sol créé');
    useFloor.getState().set({ currentId: fp.id, selection: [], tool: 'select' });
  };

  const seqsWithout = doc.sequences.filter((s) => !doc.floorPlans.some((f) => f.sequenceIds.includes(s.id)));
  const newPicker = (variant: 'add' | 'primary') =>
    seqsWithout.length > 0 && (
      <Picker label="Créer un plan au sol pour la séquence" variant={variant === 'primary' ? 'field' : 'add'} onPick={create} groups={[{ items: seqsWithout.map((s) => ({ id: s.id, label: `${s.number || '?'} — ${s.location || 'Décor à préciser'}`, detail: `${s.intExt} · ${s.dayNight}` })) }]}>
        + Plan au sol
      </Picker>
    );

  return (
    <div className="space-body">
      <FloorTree current={current} onCreate={create} />
      <div className="center">
        <SpaceBar views={false} left={current && <FloorTabs />}>
          {current && <FloorBarRight fp={current} />}
        </SpaceBar>
        <main className="floor-main">
          {current ? (
            <div className="floor-stage">
              <FloorCanvas key={current.id} fp={current} />
              <ToolPalette />
              <PlanChips fp={current} />
            </div>
          ) : (
            <div className="empty-state">
              <span>Aucun plan au sol</span>
              {newPicker('primary')}
            </div>
          )}
        </main>
      </div>
      {current && <FloorInspector fp={current} />}
    </div>
  );
}

/** Onglets de l'espace : Plan au sol, Lumière (soleil compris). */
function FloorTabs() {
  const panel = useFloor((s) => s.panel);
  return (
    <div className="seg floor-tabs" role="tablist" aria-label="Onglets du plan au sol">
      {PANELS.map((p) => (
        <button key={p.id} type="button" role="tab" aria-selected={panel === p.id} aria-pressed={panel === p.id} onClick={() => useFloor.getState().set({ panel: p.id, ...(p.id === 'plan' ? {} : { selection: [] }) })}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** À droite de la barre : consigne de l'outil en cours, échelle du plan. */
function FloorBarRight({ fp }: { fp: FloorPlan }) {
  const tool = useFloor((s) => s.tool);
  const hint = tool === 'scale' ? 'Deux points à distance connue' : tool === 'measure' ? 'Deux points à mesurer' : tool === 'path' ? 'Points du trajet, ↩ pour finir' : '';
  return (
    <>
      {hint && <span className="bar-hint">{hint}</span>}
      <BarMenu label={fp.scale ? `Échelle ${formatNumber(fp.scale.meters)} m` : 'Pas à l’échelle'} active={tool === 'scale'}>
        <button type="button" role="menuitem" onClick={() => useFloor.getState().set({ tool: 'scale', draft: [], placing: null })}>
          {fp.scale ? 'Refaire l’échelle' : 'Mettre à l’échelle'}
        </button>
      </BarMenu>
    </>
  );
}

/** Outils, en ligne en haut du plan ; la touche de chaque outil est dans son infobulle. */
function ToolPalette() {
  const tool = useFloor((s) => s.tool);
  return (
    <div className="tool-palette" role="group" aria-label="Outils">
      {TOOLS.map((t) => {
        const I = ToolIcons[t.id];
        return (
          <button key={t.id} type="button" aria-pressed={tool === t.id} aria-label={t.label} title={`${t.label} (${t.key})`} onClick={() => useFloor.getState().set({ tool: t.id, draft: [], placing: null })}>
            <I />
          </button>
        );
      })}
    </div>
  );
}

/** En bas du plan : les plans de la séquence ; orange = caméra pas encore placée sur ce plan au sol. */
function PlanChips({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const ui = useFloor();
  const numbers = computeNumbers(doc);
  const items = doc.sequences
    .filter((s) => fp.sequenceIds.includes(s.id))
    .flatMap((s) => s.plans.flatMap((p) => p.cameras.map((c) => ({ planId: p.id, setupId: c.id, el: fp.elements.find((e) => e.kind === 'camera' && e.planId === p.id && e.setupId === c.id) ?? null }))));
  if (!items.length) return null;
  return (
    <div className="plan-chips" role="group" aria-label="Plans de la séquence">
      {items.map((it) => {
        const lab = cameraLabel(doc, it.planId, it.setupId, numbers);
        const on = it.el ? ui.selection.includes(it.el.id) : ui.placing?.planId === it.planId && ui.placing?.setupId === it.setupId;
        return (
          <button
            key={`${it.planId}|${it.setupId}`}
            type="button"
            className={`plan-chip ${on ? 'on' : ''}`}
            aria-label={`${it.el ? 'Caméra' : 'Placer la caméra'} ${lab.code}`}
            title={`${lab.code} · ${lab.detail}${it.el ? '' : ' · pas encore placée'}`}
            onClick={() => {
              useApp.getState().goToPlan(it.planId);
              if (it.el) useFloor.getState().set({ selection: [it.el.id], placing: null, tool: 'select', panel: 'plan' });
              else useFloor.getState().set({ selection: [], placing: on ? null : { planId: it.planId, setupId: it.setupId }, tool: 'select', panel: 'plan' });
            }}
          >
            {!it.el && <span className="st st-warn" aria-hidden />}
            <span className="mono">{lab.code}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Gauche : une seule liste. Une séquence ouvre son plan au sol ; sans plan au sol, « + Plan au sol » le crée.
 * Les plans de la séquence ouverte : vert = caméra placée sur ce plan au sol, orange = à placer.
 */
function FloorTree({ current, onCreate }: { current: FloorPlan | null; onCreate: (seqId: Id) => void }) {
  const doc = useApp(selectDoc);
  const cursorPlan = useApp((s) => s.cursor?.planId ?? null);
  const numbers = computeNumbers(doc);
  const cursorSeq = cursorPlan ? locatePlan(doc, cursorPlan)?.seq.id : null;
  const openSeq = current ? (cursorSeq && current.sequenceIds.includes(cursorSeq) ? cursorSeq : current.sequenceIds[0]) : null;
  const orphans = doc.floorPlans.filter((f) => !f.sequenceIds.some((id) => doc.sequences.some((x) => x.id === id)));
  const openFloor = (fp: FloorPlan, seqId: Id) => {
    useFloor.getState().set({ currentId: fp.id, selection: [], tool: 'select', draft: [], placing: null });
    const seq = doc.sequences.find((x) => x.id === seqId);
    if (seq?.plans[0] && locatePlan(selectDoc(useApp.getState()), cursorPlan ?? '')?.seq.id !== seqId) useApp.getState().goToPlan(seq.plans[0].id);
  };
  return (
    <nav className="tree glass-panel" aria-label="Le film">
      <ProjectHead />
      {filmFlow(doc).map((it) => {
        if (it.kind === 'stamp')
          return (
            <div key={it.stamp.id} className="tree-stamp" aria-hidden>
              {it.stamp.text.trim() || 'Tampon'}
            </div>
          );
        const s = it.seq;
        const c = stripColors(s);
        const fp = (current && current.sequenceIds.includes(s.id) ? current : null) ?? doc.floorPlans.find((f) => f.sequenceIds.includes(s.id)) ?? null;
        const open = s.id === openSeq;
        if (!fp)
          return (
            <div key={s.id} className="tree-seq">
              <button type="button" className="tree-seq-row none" aria-label={`Créer le plan au sol de la séquence ${s.number || '?'}`} onClick={() => onCreate(s.id)}>
                <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
                <span className="lbl">
                  {s.number || '?'} · {s.location || 'Décor à préciser'}
                </span>
                <span className="add-floor">+ Plan au sol</span>
              </button>
            </div>
          );
        return (
          <div key={s.id} className="tree-seq">
            <button type="button" className={`tree-seq-row ${open ? 'open' : ''}`} aria-expanded={open} title={fp.scale ? fp.name : `${fp.name} · pas encore à l’échelle`} onClick={() => openFloor(fp, s.id)}>
              <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
              <span className="lbl">
                {s.number || '?'} · {s.location || 'Décor à préciser'}
              </span>
              {!fp.scale && <span className="st st-warn" aria-hidden />}
            </button>
            {open &&
              s.plans.map((p) => {
                const placed = p.cameras.every((cam) => fp.elements.some((e) => e.kind === 'camera' && e.planId === p.id && e.setupId === cam.id));
                const code = numbers.get(p.id)?.code ?? '?';
                return (
                  <button key={p.id} type="button" className={`tree-plan ${cursorPlan === p.id ? 'here' : ''}`} aria-label={`Plan ${code}`} title={`${code} · caméra ${placed ? 'placée' : 'à placer'}`} onClick={() => choosePlan(p.id)}>
                    <span className="mono">{code}</span>
                    <span className={`st ${placed ? 'st-ok' : 'st-warn'}`} aria-hidden />
                  </button>
                );
              })}
          </div>
        );
      })}
      {orphans.map((f) => (
        <button key={f.id} type="button" className={`tree-seq-row ${f.id === current?.id ? 'open' : ''}`} onClick={() => useFloor.getState().set({ currentId: f.id, selection: [], tool: 'select', draft: [] })}>
          <span className="lbl">{f.name}</span>
        </button>
      ))}
    </nav>
  );
}
