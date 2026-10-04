/** Plan feux : réglages d'un projecteur, éclairement sur les personnages, puissance électrique. */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorActor, FloorElement, FloorIcon, FloorLight, FloorPlan } from '../model/floor';
import { updateElement } from '../model/floorOps';
import { formatStop, powerTotals, readingAt, readingsAt, stopFromLux } from '../model/light';
import { formatNumber } from '../model/text';
import { DecimalField } from '../ui/DecimalField';
import { produce } from 'immer';

/** Lux arrondis à deux chiffres significatifs (la précision des données des fabricants). */
const lx = (v: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(v, 1))) - 1);
  return `${(Math.round(v / p) * p).toLocaleString('fr-FR')} lx`;
};
const m = (v: number) => `${formatNumber(Math.round(v * 10) / 10)} m`;

function apply(fn: (d: ReturnType<typeof selectDoc>) => ReturnType<typeof selectDoc>, msg?: string, key?: string) {
  const st = useApp.getState();
  st.applyDoc(fn(selectDoc(st)), msg, key);
}

export function LightInspector({ fp, el }: { fp: FloorPlan; el: FloorLight }) {
  const doc = useApp(selectDoc);
  const fixtures = doc.settings.fixtures;
  const fixture = fixtures.find((f) => f.id === el.fixtureId);
  const upd = (fn: (x: FloorLight) => void, key: string) => apply((d) => updateElement(d, fp.id, el.id, (x) => void (x.kind === 'light' && fn(x))), undefined, `${key}-${el.id}`);
  const actors = fp.elements.filter((x): x is FloorActor => x.kind === 'actor');
  return (
    <>
      {fixtures.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>
          Déclarez d’abord vos projecteurs et leurs données (Réglages › Lumière) pour obtenir éclairement, diaph et puissance.
        </p>
      ) : (
        <label className="field">
          Projecteur
          <select value={el.fixtureId ?? ''} onChange={(e) => upd((x) => ((x.fixtureId = e.target.value || null), (x.mode = 0)), 'fix')}>
            <option value="">Non défini</option>
            {fixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {formatNumber(f.watts)} W
              </option>
            ))}
          </select>
        </label>
      )}
      {fixture && fixture.modes.length > 0 && (
        <label className="field">
          Mode
          <select value={el.mode} onChange={(e) => upd((x) => void (x.mode = Number(e.target.value)), 'mode')}>
            {fixture.modes.map((md, i) => (
              <option key={i} value={i}>
                {md.label || `Mode ${i + 1}`} · {formatNumber(md.beamDeg)}° · {formatNumber(md.lux)} lx à {formatNumber(md.distanceM)} m
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row" style={{ gap: 10 }}>
        <label className="field">
          Gradateur {Math.round(el.dimmer * 100)} %
          <input type="range" min={5} max={100} step={5} value={Math.round(el.dimmer * 100)} onChange={(e) => upd((x) => void (x.dimmer = Number(e.target.value) / 100), 'dim')} aria-label="Gradateur" />
        </label>
        <div className="field small">
          Pertes
          <DecimalField label="Pertes en diaphs (diffusion, gélatine)" unit="diaph" width={56} min={0} max={20} required value={el.lossStops} onChange={(v) => v !== null && upd((x) => void (x.lossStops = v), 'loss')} />
        </div>
      </div>
      {fixture && fixture.kind !== 'led' && el.dimmer < 1 && <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>Gradateur sur un {fixture.kind === 'hmi' ? 'HMI' : 'tungstène'} : lumière estimée proportionnelle, température de couleur modifiée.</p>}
      <div className="row" style={{ gap: 10 }}>
        <label className="field small">
          Circuit
          <input value={el.circuit} placeholder="A" onChange={(e) => upd((x) => void (x.circuit = e.target.value), 'circ')} aria-label="Circuit électrique" />
        </label>
        <label className="field">
          Légende
          <input value={el.label} placeholder={fixture?.name ?? 'ex. Face, contre'} onChange={(e) => upd((x) => void (x.label = e.target.value), 'lab')} />
        </label>
      </div>
      {fixture && actors.length > 0 && fp.scale && (
        <div className="light-readings" aria-label="Éclairement sur les personnages">
          {actors.map((a) => {
            const r = readingAt(doc, fp, el, a.at);
            if (!r) return null;
            return (
              <div key={a.id} className="reading">
                <span>
                  {a.name} à {m(r.distanceM)}
                </span>
                <b>{r.lux === null ? 'hors faisceau' : `${lx(r.lux)} · ${formatStop(stopFromLux(r.lux, doc.settings.exposure))}`}</b>
                {r.edge && <small>bord du faisceau</small>}
              </div>
            );
          })}
        </div>
      )}
      {!fp.scale && <p className="note" style={{ margin: 0 }}>Mettez le plan à l’échelle (E) pour calculer l’éclairement.</p>}
    </>
  );
}

/** Éclairement reçu par un personnage, projecteur par projecteur. */
export function ActorLight({ fp, actor }: { fp: FloorPlan; actor: FloorActor }) {
  const doc = useApp(selectDoc);
  if (!fp.scale || !fp.elements.some((e) => e.kind === 'light')) return null;
  const rs = readingsAt(doc, fp, actor.at);
  const lit = rs.filter((r) => r.lux !== null);
  const sum = lit.reduce((n, r) => n + r.lux!, 0);
  const e = doc.settings.exposure;
  return (
    <section className="sec suggest" aria-label="Lumière reçue">
      <div className="sec-h">Lumière reçue</div>
      {rs.length === 0 && <p className="note" style={{ margin: 0 }}>Aucun projecteur défini (Réglages › Lumière).</p>}
      {rs.map((r) => (
        <div key={r.light.id} className="reading">
          <span>
            {r.light.label || r.fixture.name} à {m(r.distanceM)}
          </span>
          <b>{r.lux === null ? 'hors faisceau' : `${lx(r.lux)} · ${formatStop(stopFromLux(r.lux, e))}`}</b>
          {r.edge && <small>bord du faisceau</small>}
        </div>
      ))}
      {lit.length > 1 && (
        <div className="reading total">
          <span>Toutes sources</span>
          <b>
            {lx(sum)} · {formatStop(stopFromLux(sum, e))}
          </b>
        </div>
      )}
      <p className="note" style={{ margin: 0, fontSize: 11, lineHeight: '15px' }}>
        Lumière incidente face à chaque source, au centre du faisceau : E = lux du fabricant × (distance de référence ÷ distance)², × gradateur, − pertes. Diaph :
        N² = E × ISO × t ÷ 340 (ISO {formatNumber(e.iso)}, {formatNumber(e.fps)} i/s, {formatNumber(e.shutterDeg)}°).
      </p>
    </section>
  );
}

/** Puissance des projecteurs du plan, par circuit (230 V). */
export function PowerSummary({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  if (!fp.elements.some((e) => e.kind === 'light')) return null;
  const p = powerTotals(doc, fp);
  return (
    <section className="sec" aria-label="Puissance électrique">
      <div className="sec-h">Puissance</div>
      {p.circuits.map((c) => (
        <div key={c.circuit} className="reading">
          <span>
            Circuit {c.circuit} · {c.count} proj.
          </span>
          <b>
            {formatNumber(c.watts)} W · {formatNumber(Math.round(c.amps * 10) / 10)} A
          </b>
        </div>
      ))}
      <div className="reading total">
        <span>Total</span>
        <b>
          {formatNumber(p.total.watts)} W · {formatNumber(Math.round(p.total.amps * 10) / 10)} A
        </b>
      </div>
      {p.unknown > 0 && <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>{p.unknown} projecteur(s) sans modèle : non comptés.</p>}
      <p className="note" style={{ margin: 0, fontSize: 11 }}>À pleine puissance, intensité à 230 V.</p>
    </section>
  );
}

/** Une icône de la bibliothèque devient un projecteur (elle garde son image). */
export function iconToLight(fp: FloorPlan, el: FloorIcon) {
  apply(
    (d) =>
      produce(d, (x) => {
        const f = x.floorPlans.find((p) => p.id === fp.id);
        const i = f?.elements.findIndex((e) => e.id === el.id) ?? -1;
        if (!f || i < 0) return;
        const light: FloorElement = { id: el.id, kind: 'light', at: el.at, rotation: el.rotation, fixtureId: x.settings.fixtures[0]?.id ?? null, mode: 0, dimmer: 1, lossStops: 0, circuit: '', label: el.label, icon: el.icon, size: el.size };
        f.elements[i] = light;
      }),
    'Icône transformée en projecteur · ⌘Z pour annuler',
  );
}
