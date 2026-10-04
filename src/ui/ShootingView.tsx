/**
 * Vue Tournage : installations et ordre de tournage, séquence par séquence.
 * L'ordre est proposé d'après les plans au sol, puis ajusté à la main (glisser-déposer).
 */
import { plural } from '../model/text';
import { useState, type DragEvent } from 'react';
import { create } from 'zustand';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { displayText } from '../model/entry';
import type { Id, Plan, ProjectDoc, Sequence } from '../model/types';
import { addInstallation, effectiveShooting, moveInstallation, movePlanToInstallation, proposeShooting, removeInstallation, setShooting, updateInstallation } from '../model/shooting';
import { getBackend } from '../platform/backend';
import { sequenceTitle, stripColors } from './strip';

export const useShootingUi = create<{ seqId: Id | null; set(id: Id): void }>()((set) => ({ seqId: null, set: (seqId) => set({ seqId }) }));

/** Plan en cours de glisser-déposer. */
let dragged: Id | null = null;

const apply = (fn: (d: ProjectDoc) => ProjectDoc, message?: string, key?: string) => {
  const st = useApp.getState();
  st.applyDoc(fn(selectDoc(st)), message, key);
};

export function ShootingView() {
  const doc = useApp(selectDoc);
  const cursorPlan = useApp((s) => s.cursor?.planId ?? null);
  const chosen = useShootingUi((s) => s.seqId);
  const seq = doc.sequences.find((s) => s.id === chosen) ?? doc.sequences.find((s) => s.plans.some((p) => p.id === cursorPlan)) ?? doc.sequences[0];
  const numbers = computeNumbers(doc);
  if (!seq) return null;
  return (
    <div className="shooting">
      <aside className="shooting-list" aria-label="Séquences">
        <h2 className="panel-title">Séquences</h2>
        {doc.sequences.map((s) => {
          const c = stripColors(s);
          const e = effectiveShooting(s);
          return (
            <button key={s.id} type="button" className={`index-item ${s.id === seq.id ? 'here' : ''}`} onClick={() => useShootingUi.getState().set(s.id)}>
              <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
              <span className="meta">
                <span className="num">{s.number || '?'}</span>
                <span className="loc">{e ? `${plural(e.installations.length, 'installation')}${e.loose.length ? ` · ${e.loose.length} à ranger` : ''}` : 'ordre à établir'}</span>
              </span>
            </button>
          );
        })}
      </aside>
      <main className="shooting-main">
        <SequenceShooting key={seq.id} doc={doc} seq={seq} numbers={numbers} />
      </main>
    </div>
  );
}

function SequenceShooting({ doc, seq, numbers }: { doc: ProjectDoc; seq: Sequence; numbers: ReturnType<typeof computeNumbers> }) {
  const e = effectiveShooting(seq);
  const placedCount = seq.plans.filter((p) => doc.floorPlans.some((fp) => fp.sequenceIds.includes(seq.id) && fp.elements.some((el) => el.kind === 'camera' && el.planId === p.id))).length;

  const propose = async () => {
    if (seq.shooting) {
      const b = await getBackend();
      if (!(await b.confirm('Refaire la proposition ?', 'L’ordre actuel de cette séquence sera remplacé par une nouvelle proposition (⌘Z pour revenir).', 'Proposer', 'Annuler'))) return;
    }
    apply((d) => setShooting(d, seq.id, proposeShooting(d, seq)), `Ordre de tournage proposé pour la séquence ${seq.number} · ⌘Z pour annuler`);
  };

  let order = 0;
  return (
    <div className="shooting-seq">
      <div className="shooting-head">
        <div>
          <h3>
            SÉQ. {seq.number || '?'} — {sequenceTitle(seq)}
          </h3>
          <p className="note" style={{ margin: 0 }}>
            {seq.plans.length} plan{seq.plans.length > 1 ? 's' : ''} · {placedCount} placé{placedCount > 1 ? 's' : ''} sur un plan au sol
          </p>
        </div>
        <span className="spacer" />
        {e && (
          <button type="button" className="btn" onClick={() => apply((d) => addInstallation(d, seq.id, `Installation ${e.installations.length + 1}`).doc)}>
            + Installation
          </button>
        )}
        <button type="button" className={`btn ${e ? '' : 'primary'}`} onClick={() => void propose()}>
          {e ? 'Refaire la proposition' : 'Proposer un ordre'}
        </button>
      </div>

      {!e ? (
        <div className="shooting-empty">
          <p>
            L’app regroupe les plans par <b>installation</b> (même position de caméra, même direction) d’après les plans au sol, tourne d’abord le côté du plan le plus
            large (champ) puis l’autre (contrechamp), et va du plus large au plus serré dans chaque installation.
          </p>
          <p className="note">
            {placedCount === 0 ? 'Aucun plan de cette séquence n’est encore placé sur un plan au sol : tous les plans seront dans une seule installation, à organiser à la main.' : 'Vous pourrez ensuite tout réorganiser en glissant les plans.'}
          </p>
        </div>
      ) : (
        <>
          {e.installations.map((ins, i) => (
            <section key={ins.id} className="install" aria-label={`Installation ${ins.name}`} onDragOver={(ev) => dragged && ev.preventDefault()} onDrop={(ev) => drop(ev, seq.id, ins.id)}>
              <div className="install-h">
                <span className="install-n">{i + 1}</span>
                <input className="install-name" aria-label="Nom de l’installation" value={ins.name} onChange={(ev) => apply((d) => updateInstallation(d, seq.id, ins.id, (x) => void (x.name = ev.target.value)), undefined, `insname-${ins.id}`)} />
                <span className="note">
                  {ins.plans.length} plan{ins.plans.length > 1 ? 's' : ''}
                </span>
                <span className="spacer" />
                <button type="button" className="icon-btn" aria-label="Monter l’installation" disabled={i === 0} onClick={() => apply((d) => moveInstallation(d, seq.id, ins.id, -1))}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label="Descendre l’installation" disabled={i === e.installations.length - 1} onClick={() => apply((d) => moveInstallation(d, seq.id, ins.id, 1))}>
                  ↓
                </button>
                <button type="button" className="icon-btn danger" aria-label={`Supprimer l’installation ${ins.name}`} title="Ses plans passent dans « À ranger »" onClick={() => apply((d) => removeInstallation(d, seq.id, ins.id), 'Installation supprimée · ses plans sont à ranger · ⌘Z pour annuler')}>
                  ×
                </button>
              </div>
              <input
                className="install-note"
                aria-label={`Note de l’installation ${ins.name}`}
                placeholder="Note : lumière, machinerie, temps de mise en place…"
                value={ins.note}
                onChange={(ev) => apply((d) => updateInstallation(d, seq.id, ins.id, (x) => void (x.note = ev.target.value)), undefined, `insnote-${ins.id}`)}
              />
              <div className="install-plans">
                {ins.plans.length === 0 && <p className="note install-drop">Glissez des plans ici.</p>}
                {ins.plans.map((p, k) => (
                  <PlanRow key={p.id} p={p} code={numbers.get(p.id)?.code ?? '?'} order={++order} seqId={seq.id} installationId={ins.id} index={k} count={ins.plans.length} doc={doc} />
                ))}
              </div>
            </section>
          ))}
          {e.loose.length > 0 && (
            <section className="install loose" aria-label="À ranger">
              <div className="install-h">
                <b>À ranger</b>
                <span className="note">plans ajoutés depuis la proposition : glissez-les dans une installation</span>
              </div>
              <div className="install-plans">
                {e.loose.map((p) => (
                  <PlanRow key={p.id} p={p} code={numbers.get(p.id)?.code ?? '?'} order={null} seqId={seq.id} installationId={null} index={0} count={0} doc={doc} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function drop(ev: DragEvent, seqId: Id, installationId: Id, index?: number) {
  const id = dragged;
  if (!id) return;
  ev.preventDefault();
  ev.stopPropagation();
  dragged = null;
  apply((d) => movePlanToInstallation(d, seqId, id, installationId, index));
}

function PlanRow({ p, code, order, seqId, installationId, index, count, doc }: { p: Plan; code: string; order: number | null; seqId: Id; installationId: Id | null; index: number; count: number; doc: ProjectDoc }) {
  const [over, setOver] = useState(false);
  const c = p.cameras[0]!;
  const multi = p.cameras.length > 1;
  const cams = multi ? p.cameras.map((x) => doc.settings.cameras.find((k) => k.id === x.cameraId)?.label ?? '?').join('+') : '';
  return (
    <div
      className={`shot-row ${over ? 'over' : ''}`}
      draggable
      onDragStart={(ev) => {
        dragged = p.id;
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', code);
      }}
      onDragEnd={() => {
        dragged = null;
        setOver(false);
      }}
      onDragOver={(ev) => {
        if (!dragged || !installationId) return;
        ev.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(ev) => {
        setOver(false);
        if (installationId) drop(ev, seqId, installationId, index);
      }}
    >
      <span className="shot-grip" aria-hidden="true">
        ⋮⋮
      </span>
      <span className="shot-order mono">{order ?? '–'}</span>
      <b className="shot-code mono">{code}</b>
      {multi ? <span className="camtag">{cams}</span> : <span />}
      <span className="shot-v">{displayText('size', c) || '—'}</span>
      <span className="shot-v">{displayText('axis', c) || '—'}</span>
      <span className="shot-v mono">{displayText('focal', c) || '—'}</span>
      <span className="shot-v">{displayText('movement', c) || '—'}</span>
      <span className="shot-action">{p.action || '—'}</span>
      {installationId && (
        <span className="shot-move">
          <button type="button" className="icon-btn" aria-label={`Monter ${code}`} disabled={index === 0} onClick={() => apply((d) => movePlanToInstallation(d, seqId, p.id, installationId, index - 1))}>
            ↑
          </button>
          <button type="button" className="icon-btn" aria-label={`Descendre ${code}`} disabled={index === count - 1} onClick={() => apply((d) => movePlanToInstallation(d, seqId, p.id, installationId, index + 1))}>
            ↓
          </button>
        </span>
      )}
    </div>
  );
}
