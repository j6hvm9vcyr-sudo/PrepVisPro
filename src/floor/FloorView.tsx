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
import { FilmTree, SpaceBar, BarMenu } from '../ui/Chrome';
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
  { id: 'sun', label: 'Soleil' },
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

  const floorsHead = doc.floorPlans.length > 0 && (
    <div className="tree-section" aria-label="Plans au sol">
      <div className="tree-head">
        <h2>Plans au sol</h2>
      </div>
      {doc.floorPlans.map((f) => (
        <button key={f.id} type="button" className={`tree-item ${f.id === current?.id ? 'here' : ''}`} title={f.scale ? 'À l’échelle' : 'Pas encore à l’échelle'} onClick={() => useFloor.getState().set({ currentId: f.id, selection: [], tool: 'select', draft: [] })}>
          <span className="lbl">{f.name}</span>
          {!f.scale && <span className="st st-warn" aria-hidden />}
        </button>
      ))}
      <div className="tree-new">{newPicker('add')}</div>
    </div>
  );

  return (
    <div className="space-body">
      <FilmTree head={floorsHead} onPlan={choosePlan} />
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

/** Onglets de l'espace : Plan au sol, Lumière, Soleil. */
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

/** Outils, en colonne sur le bord du plan ; la touche de chaque outil est dans son infobulle. */
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
