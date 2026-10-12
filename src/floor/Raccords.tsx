/**
 * Raccords (0.23) : axes des 180° dans les détails d'un personnage, sauts d'axe dans ceux d'une
 * caméra, et les personnages dans le champ d'une caméra.
 */
import { useMemo } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorActor, FloorCamera, FloorPlan } from '../model/floor';
import { updateFloorPlan } from '../model/floorOps';
import { newId } from '../model/defaults';
import { computeNumbers } from '../model/numbering';
import { axisReports, type AxisJump, type Side } from '../model/raccords';
import { actorsInField } from '../model/floorSuggest';
import { formatDeg } from '../model/optics';
import { formatNumber } from '../model/text';
import { Picker } from '../ui/Picker';
import { Info } from '../ui/Info';
import { useFloor } from './floorStore';

const m = (v: number) => `${formatNumber(Math.round(v * 100) / 100)} m`;
const sideText = (s: Side | null) => (s === null ? '—' : s === 0 ? 'sur l’axe' : s === 1 ? 'côté 1' : 'côté 2');

function useReports(fp: FloorPlan) {
  const doc = useApp(selectDoc);
  return useMemo(() => axisReports(doc, fp, computeNumbers(doc)), [doc, fp]);
}

function setAccepted(fp: FloorPlan, j: AxisJump, on: boolean) {
  const st = useApp.getState();
  st.applyDoc(
    updateFloorPlan(selectDoc(st), fp.id, (f) => {
      const ax = f.axes.find((a) => a.id === j.axisId);
      if (!ax) return;
      ax.accepted = ax.accepted.filter((k) => k !== j.key);
      if (on) ax.accepted.push(j.key);
    }),
    on ? `${j.fromCode} → ${j.toCode} : saut d’axe voulu` : `${j.fromCode} → ${j.toCode} : saut d’axe à nouveau signalé`,
  );
}

function JumpRow({ fp, j }: { fp: FloorPlan; j: AxisJump }) {
  return (
    <div className={`raccord-jump ${j.accepted ? 'accepted' : ''}`}>
      <span className={`st ${j.accepted ? 'st-none' : 'st-warn'}`} aria-hidden />
      <span className="mono">
        {j.fromCode} → {j.toCode}
      </span>
      <span className="lbl">{j.accepted ? 'voulu' : 'saut d’axe'}</span>
      <button type="button" className="linkbtn" onClick={() => setAccepted(fp, j, !j.accepted)}>
        {j.accepted ? 'Signaler à nouveau' : 'C’est voulu'}
      </button>
    </div>
  );
}

const AXIS_INFO = (
  <Info title="Règle des 180°">
    <span>L’axe est la droite qui joint les deux personnages. Chaque caméra de ce plan au sol est d’un côté (1 ou 2) ou sur l’axe (à moins de 3°).</span>
    <span>Entre deux plans qui se suivent dans la séquence, la fin du premier et le début du second doivent être du même côté ; sinon le saut d’axe va dans À vérifier, jusqu’à « C’est voulu ».</span>
    <span>Pas de côté pour un plan sans caméra sur ce plan au sol (une reprise prend celle de son plan) ni pour un plan à plusieurs caméras de côtés différents. Si un des personnages se déplace, l’axe n’est pas vérifié.</span>
  </Info>
);

/** Détails d'un personnage : ses axes, et « Axe avec… ». */
export function ActorAxes({ fp, actor }: { fp: FloorPlan; actor: FloorActor }) {
  const reports = useReports(fp).filter((r) => r.axis.actorIds.includes(actor.id));
  const others = fp.elements.filter((e): e is FloorActor => e.kind === 'actor' && e.id !== actor.id && !fp.axes.some((a) => a.actorIds.includes(actor.id) && a.actorIds.includes(e.id)));
  const st = useApp.getState;
  const add = (otherId: string) => {
    const other = others.find((o) => o.id === otherId);
    if (!other) return;
    st().applyDoc(
      updateFloorPlan(selectDoc(st()), fp.id, (f) => void f.axes.push({ id: newId('ax'), actorIds: [actor.id, other.id], accepted: [] })),
      `Axe ${actor.name || 'Personnage'} ↔ ${other.name || 'Personnage'}`,
    );
  };
  const remove = (axisId: string) => st().applyDoc(updateFloorPlan(selectDoc(st()), fp.id, (f) => void (f.axes = f.axes.filter((a) => a.id !== axisId))), 'Axe retiré');

  return (
    <section className="sec raccords" aria-label="Axes des 180°">
      <div className="sec-h">
        Axes des 180° {AXIS_INFO}
      </div>
      {reports.map((r) => (
        <div key={r.axis.id} className="raccord-axis" aria-label={`Axe ${r.names[0]} ↔ ${r.names[1]}`}>
          <div className="raccord-head">
            <strong>
              {r.names[0]} ↔ {r.names[1]}
            </strong>
            <span className="spacer" />
            <button type="button" className="linkbtn danger" onClick={() => remove(r.axis.id)}>
              Retirer
            </button>
          </div>
          {r.moving ? (
            <span className="note">Personnage en mouvement : axe non vérifié</span>
          ) : (
            r.sequences.map((s) => (
              <div key={s.seqId} className="raccord-shots" role="list" aria-label={`Séquence ${s.number}`}>
                {s.shots.map((sh) => (
                  <span key={sh.planId} role="listitem" className={`raccord-shot side-${sh.start === null ? 'none' : sh.start === 0 ? 'on' : sh.start === 1 ? 'a' : 'b'}`} title={sh.cameras.length ? `Début : ${sideText(sh.start)} · fin : ${sideText(sh.end)}` : 'Caméra pas sur ce plan au sol'}>
                    <span className="mono">{sh.code}</span> {sideText(sh.start)}
                  </span>
                ))}
              </div>
            ))
          )}
          {r.jumps.map((j) => (
            <JumpRow key={j.key} fp={fp} j={j} />
          ))}
        </div>
      ))}
      {others.length > 0 ? (
        <Picker label="Axe avec un autre personnage" value="" onPick={add} groups={[{ items: others.map((o) => ({ id: o.id, label: o.name || 'Personnage' })) }]}>
          <span className="ph">Axe avec…</span>
        </Picker>
      ) : reports.length === 0 ? (
        <span className="note">Un autre personnage sur le plan au sol permet de tracer un axe.</span>
      ) : null}
    </section>
  );
}

/** Détails d'une caméra : les sauts d'axe qui touchent son plan, et le côté de chaque axe. */
export function CameraRaccords({ fp, cam }: { fp: FloorPlan; cam: FloorCamera }) {
  const reports = useReports(fp);
  if (!cam.planId || !reports.length) return null;
  const rows = reports
    .map((r) => {
      const shot = r.sequences.flatMap((s) => s.shots).find((sh) => sh.planId === cam.planId);
      return { r, shot, jumps: r.jumps.filter((j) => j.fromPlanId === cam.planId || j.toPlanId === cam.planId) };
    })
    .filter((x) => x.shot);
  if (!rows.length) return null;
  return (
    <section className="sec raccords" aria-label="Raccords">
      <div className="sec-h">
        Raccords {AXIS_INFO}
      </div>
      {rows.map(({ r, shot, jumps }) => (
        <div key={r.axis.id} className="raccord-axis">
          <div className="raccord-head">
            <span>
              {r.names[0]} ↔ {r.names[1]}
            </span>
            <span className="spacer" />
            <span className="note">{r.moving ? 'non vérifié' : sideText(shot!.start) + (shot!.end !== shot!.start ? ` → ${sideText(shot!.end)}` : '')}</span>
          </div>
          {jumps.map((j) => (
            <JumpRow key={j.key} fp={fp} j={j} />
          ))}
        </div>
      ))}
    </section>
  );
}

/** Détails d'une caméra : les personnages dans son champ horizontal, au début du plan. */
export function CameraField({ fp, cam }: { fp: FloorPlan; cam: FloorCamera }) {
  const doc = useApp(selectDoc);
  const r = actorsInField(doc, fp, cam);
  if (!r || !r.actors.length) return null;
  const pick = (id: string) => useFloor.getState().set({ selection: [id] });
  return (
    <section className="sec in-field" aria-label="Dans le champ">
      <div className="sec-h">
        Dans le champ · {formatDeg(r.horizontalDeg)}
        <Info title="Dans le champ">
          <span>Champ horizontal = 2 × atan(largeur de l’image ÷ 2 × focale), d’après le capteur (Réglages › Caméras), le format du film et la focale du découpage.</span>
          <span>Mise au point à l’infini, optique rectilinéaire : de près, le champ réel est un peu plus serré.</span>
          <span>Largeur du cadre à la distance du personnage = distance × largeur de l’image ÷ focale (plan au sol à l’échelle). Positions de début du plan.</span>
        </Info>
      </div>
      {r.actors.map((a) => (
        <button key={a.actor.id} type="button" className={`in-field-row ${a.inField ? '' : 'out'}`} onClick={() => pick(a.actor.id)}>
          <span className="dot" style={{ background: a.actor.color }} aria-hidden />
          <span className="lbl">{a.actor.name || 'Personnage'}</span>
          <span className="spacer" />
          <span className="note">{a.inField ? (a.distanceM !== null ? `${m(a.distanceM)} · cadre ${m(a.widthM!)}` : 'dans le champ') : 'hors champ'}</span>
        </button>
      ))}
    </section>
  );
}
