/**
 * Vue Jours : jours de tournage (J1, J2…), et pour chacun ses séquences, l'ordre de tournage,
 * les horaires du soleil, les plans au sol et le matériel — tout est déduit, rien n'est ressaisi.
 */
import { Picker } from './Picker';
import { reorderKeys } from './reorder';
import { DragRow } from './DragRow';
import { create } from 'zustand';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { Id, ProjectDoc, ShootingDay } from '../model/types';
import { addDay, compactPlans, duplicateDay, longDate, dayLabels, daysOfSequence, daySun, equipmentFor, moveDay, removeDay, sortDaysByDate, updateDay, type Equipment } from '../model/days';
import { effectiveShooting } from '../model/shooting';
import { computeNumbers } from '../model/numbering';
import { formatNumber } from '../model/text';
import { utcToLocal } from '../model/sun';
import { projectTimeZone } from '../model/sunPlan';
import { useFloor } from '../floor/floorStore';
import { sequenceTitle, stripColors } from './strip';
import { useShootingUi } from './ShootingView';

const ALL = '__tout';
export const useDaysUi = create<{ dayId: Id | null; set(id: Id | null): void }>()((set) => ({ dayId: null, set: (dayId) => set({ dayId }) }));

const apply = (fn: (d: ProjectDoc) => ProjectDoc, message?: string, key?: string) => {
  const st = useApp.getState();
  st.applyDoc(fn(selectDoc(st)), message, key);
};

export function DaysView() {
  const doc = useApp(selectDoc);
  const chosen = useDaysUi((s) => s.dayId);
  const labels = dayLabels(doc);
  if (chosen === ALL) return <WholeShoot doc={doc} />;
  const day = doc.shootingDays.find((d) => d.id === chosen);
  if (day) return <DayPage key={day.id} doc={doc} day={day} label={labels.get(day.id)!} labels={labels} />;
  return <DaysBoard doc={doc} labels={labels} />;
}

/** Ajoute un jour de tournage et l'ouvre. */
export function addShootingDay() {
  const doc = selectDoc(useApp.getState());
  const r = addDay(doc);
  apply(() => r.doc, `Jour ${doc.shootingDays.length + 1} ajouté`);
  useDaysUi.getState().set(r.id);
}

/** Barre de l'onglet Jours : retour au tableau des jours, matériel de tout le tournage, nouveau jour. */
export function DaysBar() {
  const doc = useApp(selectDoc);
  const chosen = useDaysUi((s) => s.dayId);
  const open = chosen !== null && (chosen === ALL || doc.shootingDays.some((d) => d.id === chosen));
  return (
    <>
      {open && (
        <button type="button" className="tool-b" onClick={() => useDaysUi.getState().set(null)}>
          ← Tous les jours
        </button>
      )}
      {doc.shootingDays.some((d) => d.date) && (
        <button type="button" className="tool-b" onClick={() => apply(sortDaysByDate, 'Jours triés par date')}>
          Trier par date
        </button>
      )}
      <button type="button" className={`tool-b ${chosen === ALL ? 'on' : ''}`} aria-pressed={chosen === ALL} onClick={() => useDaysUi.getState().set(chosen === ALL ? null : ALL)}>
        Matériel du tournage
      </button>
      <button type="button" className="tool-b" onClick={addShootingDay}>
        + Jour
      </button>
    </>
  );
}

/** Tous les jours côte à côte : séquences, installations et plans de chaque jour. */
function DaysBoard({ doc, labels }: { doc: ProjectDoc; labels: Map<Id, string> }) {
  const numbers = computeNumbers(doc);
  const cursorPlan = useApp((s) => s.cursor?.planId ?? null);
  const tz = projectTimeZone(doc);
  const t = (ms: number | null) => (ms === null ? '—' : utcToLocal(Math.round(ms / 60000) * 60000, tz).time);
  if (!doc.shootingDays.length)
    return (
      <div className="empty-state">
        <span>Aucun jour de tournage</span>
        <button type="button" className="btn primary" onClick={addShootingDay}>
          + Jour
        </button>
      </div>
    );
  const row = (p: { id: Id }, detail: string) => (
    <button key={p.id} type="button" className={`board-row ${p.id === cursorPlan ? 'here' : ''}`} onClick={() => useApp.getState().goToPlan(p.id)}>
      <span className="mono">{numbers.get(p.id)?.code ?? '?'}</span>
      <span className="detail">{detail}</span>
    </button>
  );
  const detailOf = (plan: ProjectDoc['sequences'][number]['plans'][number]) => {
    const c = plan.cameras[0]!;
    return [c.start.size, c.start.focalMm !== null ? formatNumber(c.start.focalMm) : ''].filter(Boolean).join(' · ');
  };
  return (
    <div className="days-board" aria-label="Jours de tournage">
      {doc.shootingDays.map((d) => {
        const label = labels.get(d.id)!;
        const seqs = d.sequenceIds.map((id) => doc.sequences.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
        const plans = seqs.reduce((n, s) => n + s.plans.length, 0);
        const installs = seqs.reduce((n, s) => n + (effectiveShooting(s)?.installations.filter((i) => i.plans.length).length ?? 0), 0);
        const sun = d.date ? daySun(doc, d)[0] : undefined;
        return (
          <section key={d.id} className="day-col" aria-label={label}>
            <button type="button" className="day-col-h" aria-label={`Ouvrir ${label}`} onClick={() => useDaysUi.getState().set(d.id)}>
              <strong>
                {label} · {d.date ? shortDate(d.date) : 'date à fixer'}
              </strong>
              <span className="sub mono">
                {plans} plan{plans > 1 ? 's' : ''} · {installs ? `${installs} inst.` : '— inst.'}
                {sun && !sun.sun.polar && (
                  <>
                    {' · '}
                    {t(sun.sun.sunrise)} – {t(sun.sun.sunset)}
                  </>
                )}
              </span>
            </button>
            {seqs.length === 0 && <div className="empty-line small">Aucune séquence</div>}
            {seqs.map((s) => {
              const e = effectiveShooting(s);
              const c = stripColors(s);
              if (!e)
                return (
                  <div key={s.id} className="board-group">
                    <div className="board-group-h">
                      <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
                      Séq. {s.number || '?'}
                    </div>
                    {s.plans.map((p) => row(p, detailOf(p)))}
                  </div>
                );
              return (
                <div key={s.id} className="board-seq">
                  {e.installations
                    .filter((i) => i.plans.length)
                    .map((ins, k) => (
                      <div key={ins.id} className="board-group">
                        <div className="board-group-h">
                          <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
                          {ins.name || `Installation ${k + 1}`}
                        </div>
                        {ins.plans.map((p) => row(p, p.repriseOf ? 'Reprise' : detailOf(p)))}
                      </div>
                    ))}
                  {e.loose.length > 0 && (
                    <div className="board-group">
                      <div className="board-group-h">
                        <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
                        Séq. {s.number || '?'} · à ranger
                      </div>
                      {e.loose.map((p) => row(p, detailOf(p)))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function WholeShoot({ doc }: { doc: ProjectDoc }) {
  const eq = equipmentFor(
    doc,
    doc.sequences.map((s) => s.id),
  );
  return (
    <div className="shooting-seq">
      <div className="shooting-head">
        <div>
          <h3>Tout le tournage</h3>
          <p className="note" style={{ margin: 0 }}>
            {doc.sequences.length} séquence{doc.sequences.length > 1 ? 's' : ''} · {doc.shootingDays.length} jour{doc.shootingDays.length > 1 ? 's' : ''} de tournage
          </p>
        </div>
        <span className="spacer" />
      </div>
      <EquipmentPanel eq={eq} />
    </div>
  );
}

function DayPage({ doc, day, label, labels }: { doc: ProjectDoc; day: ShootingDay; label: string; labels: Map<Id, string> }) {
  const numbers = computeNumbers(doc);
  const seqs = day.sequenceIds.map((id) => doc.sequences.find((s) => s.id === id)!).filter(Boolean);
  const eq = equipmentFor(doc, day.sequenceIds);
  const sun = daySun(doc, day);
  const tz = projectTimeZone(doc);
  const t = (ms: number | null) => (ms === null ? '—' : utcToLocal(Math.round(ms / 60000) * 60000, tz).time);
  const i = doc.shootingDays.findIndex((d) => d.id === day.id);
  const upd = (fn: (d: ShootingDay) => void, key?: string) => apply((d) => updateDay(d, day.id, fn), undefined, key ? `day-${key}-${day.id}` : undefined);
  const others = doc.sequences.filter((s) => !day.sequenceIds.includes(s.id));
  const plansCount = seqs.reduce((n, s) => n + s.plans.length, 0);

  return (
    <div className="shooting-seq">
      <div className="shooting-head">
        <div>
          <h3>
            {label} — {day.date ? longDate(day.date) : 'date à fixer'}
          </h3>
          <p className="note" style={{ margin: 0 }}>
            {seqs.length} séquence{seqs.length > 1 ? 's' : ''} · {plansCount} plan{plansCount > 1 ? 's' : ''}
          </p>
        </div>
        <span className="spacer" />
        <label className="field small" style={{ margin: 0 }}>
          Date
          <input type="date" aria-label="Date du jour de tournage" value={day.date ?? ''} onChange={(e) => upd((x) => void (x.date = e.target.value || null))} />
        </label>
        <button type="button" className="icon-btn" aria-label="Monter ce jour" disabled={i === 0} onClick={() => apply((d) => moveDay(d, day.id, -1))}>
          ↑
        </button>
        <button type="button" className="icon-btn" aria-label="Descendre ce jour" disabled={i === doc.shootingDays.length - 1} onClick={() => apply((d) => moveDay(d, day.id, 1))}>
          ↓
        </button>
        <button
          type="button"
          className="linkbtn"
          title="Mêmes séquences et même note, date à fixer"
          onClick={() => {
            const r = duplicateDay(selectDoc(useApp.getState()), day.id);
            if (!r) return;
            apply(() => r.doc, `${label} dupliqué`);
            useDaysUi.getState().set(r.id);
          }}
        >
          Dupliquer
        </button>
        <button
          type="button"
          className="linkbtn danger"
          onClick={() => {
            apply((d) => removeDay(d, day.id), `${label} supprimé`);
            useDaysUi.getState().set(null);
          }}
        >
          Supprimer ce jour
        </button>
      </div>
      <textarea className="day-note" rows={2} aria-label="Note du jour" placeholder="Note : horaires, déplacements, remarques de la régie…" value={day.note} onChange={(e) => upd((x) => void (x.note = e.target.value), 'note')} />

      <section className="install" aria-label="Séquences du jour">
        <div className="install-h">
          <b>Séquences et ordre de tournage</b>
          <span className="spacer" />
          <Picker
            label="Ajouter une séquence au jour"
            variant="add"
            onPick={(id) => upd((x) => void x.sequenceIds.push(id))}
            empty="Toutes les séquences sont déjà dans ce jour"
            groups={[
              { label: 'Sans jour', items: others.filter((s) => !daysOfSequence(doc, s.id).length).map((s) => ({ id: s.id, label: `${s.number || '?'} — ${sequenceTitle(s)}` })) },
              {
                label: 'Déjà dans un autre jour',
                items: others
                  .filter((s) => daysOfSequence(doc, s.id).length)
                  .map((s) => ({ id: s.id, label: `${s.number || '?'} — ${sequenceTitle(s)}`, detail: `déjà au ${daysOfSequence(doc, s.id).map((d) => labels.get(d.id)).join(', ')}` })),
              },
            ]}
          >
            + Ajouter une séquence…
          </Picker>
        </div>
        {seqs.length === 0 && <p className="note install-drop">Ajoutez les séquences de ce jour, dans l’ordre du plan de travail.</p>}
        {seqs.map((s, k) => {
          const c = stripColors(s);
          const e = effectiveShooting(s);
          const also = daysOfSequence(doc, s.id)
            .filter((d) => d.id !== day.id)
            .map((d) => labels.get(d.id));
          return (
            <DragRow key={s.id} list={`day-${day.id}`} index={k} move={(from, to) => upd((x) => void x.sequenceIds.splice(to, 0, x.sequenceIds.splice(from, 1)[0]!))} className="day-seq">
              {(grip) => (
              <>
              <div className="day-seq-h reorder" onKeyDown={reorderKeys((d) => upd((x) => void x.sequenceIds.splice(k + d, 0, x.sequenceIds.splice(k, 1)[0]!)), { up: k > 0, down: k < seqs.length - 1 })}>
                {grip}
                <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
                <b>
                  SÉQ. {s.number || '?'} — {sequenceTitle(s)}
                </b>
                <span className="note">
                  {s.plans.length} plan{s.plans.length > 1 ? 's' : ''}
                </span>
                {also.length > 0 && <span className="day-also">aussi au {also.join(', ')}</span>}
                <span className="spacer" />
                <button type="button" className="icon-btn mv" aria-label={`Monter la séquence ${s.number}`} disabled={k === 0} onClick={() => upd((x) => void x.sequenceIds.splice(k - 1, 0, x.sequenceIds.splice(k, 1)[0]!))}>
                  ↑
                </button>
                <button type="button" className="icon-btn mv" aria-label={`Descendre la séquence ${s.number}`} disabled={k === seqs.length - 1} onClick={() => upd((x) => void x.sequenceIds.splice(k + 1, 0, x.sequenceIds.splice(k, 1)[0]!))}>
                  ↓
                </button>
                <button type="button" className="icon-btn danger mv" aria-label={`Retirer la séquence ${s.number} du jour`} onClick={() => upd((x) => void (x.sequenceIds = x.sequenceIds.filter((y) => y !== s.id)))}>
                  ×
                </button>
              </div>
              {e ? (
                <ol className="day-installs">
                  {e.installations
                    .filter((ins) => ins.plans.length)
                    .map((ins) => (
                      <li key={ins.id}>
                        <b>{ins.name}</b> : <span className="mono">{ins.plans.map((p) => numbers.get(p.id)?.code ?? '?').join(', ')}</span>
                        {ins.note && <span className="note"> — {ins.note}</span>}
                      </li>
                    ))}
                  {e.loose.length > 0 && (
                    <li className="note">
                      À ranger : <span className="mono">{e.loose.map((p) => numbers.get(p.id)?.code ?? '?').join(', ')}</span>
                    </li>
                  )}
                </ol>
              ) : (
                <button
                  type="button"
                  className="linkbtn"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    useShootingUi.getState().set(s.id);
                    useApp.getState().setView('shooting');
                  }}
                >
                  Ordre de tournage à établir (Installations)
                </button>
              )}
              </>
              )}
            </DragRow>
          );
        })}
      </section>

      <section className="install" aria-label="Soleil du jour">
        <div className="install-h">
          <b>Soleil</b>
        </div>
        {!day.date ? (
          <p className="note" style={{ margin: 0 }}>Fixez la date du jour pour les horaires du soleil.</p>
        ) : sun.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>Aucun décor de ce jour n’a de position GPS (fiche de la séquence).</p>
        ) : (
          <table className="day-table">
            <thead>
              <tr>
                <th>Décor</th>
                <th>Lever</th>
                <th>Coucher</th>
                <th>Heure dorée du matin</th>
                <th>Heure dorée du soir</th>
                <th>Crépuscule civil</th>
              </tr>
            </thead>
            <tbody>
              {sun.map((x) => (
                <tr key={x.location + x.sequences.join()}>
                  <td>
                    {x.location} <span className="note">(séq. {x.sequences.join(', ')})</span>
                  </td>
                  {x.sun.polar ? (
                    <td colSpan={5}>{x.sun.polar === 'day' ? 'Soleil levé toute la journée' : 'Soleil couché toute la journée'}</td>
                  ) : (
                    <>
                      <td className="mono">{t(x.sun.sunrise)}</td>
                      <td className="mono">{t(x.sun.sunset)}</td>
                      <td className="mono">
                        {t(x.sun.goldenMorning[0])}–{t(x.sun.goldenMorning[1])}
                      </td>
                      <td className="mono">
                        {t(x.sun.goldenEvening[0])}–{t(x.sun.goldenEvening[1])}
                      </td>
                      <td className="mono">{t(x.sun.dusk)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="install" aria-label="Plans au sol du jour">
        <div className="install-h">
          <b>Plans au sol</b>
        </div>
        {eq.floorPlans.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>Aucun plan au sol pour ces séquences.</p>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {eq.floorPlans.map((fp) => (
              <button
                key={fp.id}
                type="button"
                className="btn"
                onClick={() => {
                  useFloor.getState().set({ currentId: fp.id, selection: [] });
                  useApp.getState().setView('floor');
                }}
              >
                {fp.name || 'Plan au sol'}
              </button>
            ))}
          </div>
        )}
      </section>

      <EquipmentPanel eq={eq} />
    </div>
  );
}

/** Matériel déduit, par département. */
function EquipmentPanel({ eq }: { eq: Equipment }) {
  const plans = (xs: string[]) => <span className="mono note">{compactPlans(xs)}</span>;
  return (
    <section className="install" aria-label="Matériel">
      <div className="install-h">
        <b>Matériel</b>
        <span className="note">déduit du découpage, des plans au sol et des plans feux</span>
      </div>
      <div className="equip">
        <div className="equip-col">
          <h4>Caméra</h4>
          {eq.cameras.length === 0 && <p className="note">—</p>}
          {eq.cameras.map((c) => (
            <div key={c.label} className="equip-row">
              <b>Caméra {c.label}</b> {[c.body, c.mode].filter(Boolean).join(' · ') || <span className="note">boîtier non renseigné</span>} {plans(c.plans)}
            </div>
          ))}
          <h4>Optiques</h4>
          {eq.focals.length === 0 && <p className="note">Aucune focale renseignée.</p>}
          {eq.focals.map((f) => (
            <div key={f.focal} className="equip-row">
              <b className="qty">{formatNumber(f.focal)} mm</b>{' '}
              {f.offKit ? <span className="warn-tag">hors des optiques du projet</span> : f.series.length ? <span>{f.series.join(' ou ')}</span> : null} {plans(f.plans)}
            </div>
          ))}
          {eq.focalMissing.length > 0 && <p className="note">Focale non renseignée : {compactPlans(eq.focalMissing)}</p>}
          <h4>Machinerie</h4>
          {eq.grip.length === 0 && eq.moves.length === 0 && <p className="note">—</p>}
          {eq.grip.map((g) => (
            <div key={g.term} className="equip-row">
              <b>{g.term}</b> {plans(g.plans)}
            </div>
          ))}
          {eq.moves.map((mv, i) => (
            <div key={i} className="equip-row">
              Trajet caméra <span className="mono">{mv.plan}</span>
              {mv.grip.length ? ` (${mv.grip.join(', ')})` : ''} : <b>{mv.lengthM !== null ? `${formatNumber(mv.lengthM)} m` : 'plan non mis à l’échelle'}</b> <span className="note">— {mv.floorPlan}</span>
            </div>
          ))}
        </div>
        <div className="equip-col">
          <h4>Lumière</h4>
          {eq.fixtures.length === 0 && eq.undefinedLights === 0 && <p className="note">Aucun projecteur sur les plans au sol.</p>}
          {eq.fixtures.map((f) => (
            <div key={f.name} className="equip-row">
              <b>
                {f.max} × {f.name}
              </b>
              {f.watts !== null ? ` · ${formatNumber(f.watts)} W` : ''}{' '}
              {f.perPlan.length > 1 && <span className="note">({f.perPlan.map((p) => `${p.floorPlan} : ${p.count}`).join(' · ')})</span>}
            </div>
          ))}
          {eq.undefinedLights > 0 && <p className="note" style={{ color: 'var(--warn-text)' }}>{eq.undefinedLights > 1 ? `${eq.undefinedLights} projecteurs sans modèle sur les plans au sol.` : '1 projecteur sans modèle sur les plans au sol.'}</p>}
          {eq.peakPower && (
            <p className="note">
              Puissance du plan le plus gourmand : {formatNumber(eq.peakPower.watts)} W ({eq.peakPower.floorPlan}, {formatNumber(Math.round((eq.peakPower.watts / 230) * 10) / 10)} A à 230 V)
            </p>
          )}
          {eq.gels.length > 0 && (
            <>
              <h4>Gélatines et diffusion</h4>
              {eq.gels.map((g) => (
                <div key={g.label} className="equip-row">
                  <b>{g.label}</b> <span className="note">sur {g.lights} projecteur{g.lights > 1 ? 's' : ''}</span>
                </div>
              ))}
            </>
          )}
          {eq.reflectors.length > 0 && (
            <>
              <h4>Réflecteurs</h4>
              {eq.reflectors.map((r) => (
                <div key={r.name + r.size} className="equip-row">
                  <b>
                    {r.max} × {r.name}
                  </b>{' '}
                  {r.size} {r.perPlan.length > 1 && <span className="note">({r.perPlan.map((p) => `${p.floorPlan} : ${p.count}`).join(' · ')})</span>}
                </div>
              ))}
            </>
          )}
          {eq.notes.length > 0 && (
            <>
              <h4>Dépouillement</h4>
              {eq.notes.map((n) => (
                <div key={n.sequence} className="equip-row">
                  <b>Séq. {n.sequence}</b>{' '}
                  {[
                    ['Caméra', n.camera],
                    ['Machinerie', n.grip],
                    ['Lumière', n.lighting],
                    ['Autre', n.other],
                  ]
                    .filter(([, v]) => v!.trim())
                    .map(([k, v]) => `${k} : ${v}`)
                    .join(' · ')}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <p className="note" style={{ margin: 0, fontSize: 11 }}>
        Projecteurs et réflecteurs : nombre maximal sur un même plan au sol (détail entre parenthèses si plusieurs plans).
      </p>
    </section>
  );
}
