import { Picker } from '../ui/Picker';
import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addFloorPlan, newFloorPlan } from '../model/floorOps';
import { formatNumber, plural } from '../model/text';
import type { FloorPlan } from '../model/floor';
import { useFloor, type FloorTool } from './floorStore';
import { FloorCanvas } from './FloorCanvas';
import { stripColors } from '../ui/strip';
import { FloorInspector } from './FloorInspector';

const TOOLS: { id: FloorTool; label: string; key: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V' },
  { id: 'camera', label: 'Caméra', key: 'C' },
  { id: 'actor', label: 'Personnage', key: 'P' },
  { id: 'light', label: 'Projecteur', key: 'L' },
  { id: 'reflector', label: 'Réflecteur', key: 'B' },
  { id: 'text', label: 'Texte', key: 'T' },
  { id: 'measure', label: 'Mesure', key: 'M' },
  { id: 'scale', label: 'Échelle', key: 'E' },
];

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

  return (
    <div className="floor">
      <aside className="floor-list" aria-label="Plans au sol">
        <h2 className="panel-title">Plans au sol</h2>
        {doc.floorPlans.map((f) => {
          const s = doc.sequences.find((x) => f.sequenceIds.includes(x.id));
          const c = s ? stripColors(s) : { fill: 'var(--border)', edge: 'var(--border)' };
          return (
            <button key={f.id} type="button" className={`index-item ${f.id === current?.id ? 'here' : ''}`} onClick={() => useFloor.getState().set({ currentId: f.id, selection: [], tool: 'select', draft: [] })}>
              <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
              <span className="meta">
                <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                <span className="loc">
                  {plural(f.elements.filter((e) => e.kind === 'camera').length, 'caméra')}{f.scale ? ' · à l’échelle' : ' · pas à l’échelle'}
                </span>
              </span>
            </button>
          );
        })}
        {seqsWithout.length > 0 && (
          <div className="floor-new">
            <div className="field">
              Nouveau plan au sol
              <Picker label="Créer un plan au sol pour la séquence" variant="field" onPick={create} groups={[{ items: seqsWithout.map((s) => ({ id: s.id, label: `${s.number || '?'} — ${s.location || 'Décor à préciser'}`, detail: `${s.intExt} · ${s.dayNight}` })) }]}>
                <span className="ph">Pour la séquence…</span>
              </Picker>
            </div>
          </div>
        )}
      </aside>

      <main className="floor-main">
        {current ? (
          <>
            <FloorToolbar fp={current} />
            <FloorCanvas key={current.id} fp={current} />
          </>
        ) : (
          <div className="floor-empty">
            <p>Aucun plan au sol pour l’instant.</p>
            <p className="note">Choisissez une séquence dans « Nouveau plan au sol », importez le plan du décor (PDF d’architecte ou vue satellite), mettez-le à l’échelle, puis placez les caméras du découpage.</p>
          </div>
        )}
      </main>

      {current && <FloorInspector fp={current} />}
    </div>
  );
}

function FloorToolbar({ fp }: { fp: FloorPlan }) {
  const tool = useFloor((s) => s.tool);
  return (
    <div className="floor-toolbar">
      <div className="seg" role="group" aria-label="Outils">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tool === t.id} title={`${t.label} (${t.key})`} onClick={() => useFloor.getState().set({ tool: t.id, draft: [], placing: null })}>
            {t.label}
          </button>
        ))}
      </div>
      <span className="note" style={{ fontSize: 12 }}>
        {tool === 'scale'
          ? 'Cliquez sur deux points séparés d’une distance connue (une porte, un mur coté).'
          : tool === 'measure'
            ? 'Cliquez sur deux points pour mesurer.'
            : tool === 'path'
              ? 'Cliquez sur les points du trajet ; ↩ ou double-clic pour finir.'
              : fp.scale
                ? `Échelle : ${formatNumber(fp.scale.meters)} m de référence`
                : fp.background
                  ? 'Pas encore à l’échelle (E)'
                  : ''}
      </span>
    </div>
  );
}
