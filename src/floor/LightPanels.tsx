/** Plan feux : réglages d'un projecteur, éclairement sur les personnages, puissance électrique. */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorActor, FloorElement, FloorIcon, FloorLight, FloorPlan } from '../model/floor';
import { updateElement } from '../model/floorOps';
import { formatStop, powerTotals, readingAt, readingsAt, stopFromLux } from '../model/light';
import { formatNumber } from '../model/text';
import { newId } from '../model/defaults';
import type { Fixture, ProjectDoc } from '../model/types';
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

const KINDS: [Fixture['kind'], string][] = [
  ['led', 'LED'],
  ['tungsten', 'Tungstène'],
  ['hmi', 'HMI'],
  ['other', 'Autre'],
];

const NEW = '__nouveau';
const NEW_MODE = -1;

/** Nombre de projecteurs placés (tous plans au sol) qui utilisent ce modèle. */
function usesOf(doc: ProjectDoc, fixtureId: string): number {
  return doc.floorPlans.reduce((n, fp) => n + fp.elements.filter((e) => e.kind === 'light' && e.fixtureId === fixtureId).length, 0);
}

/**
 * Données du modèle de projecteur, saisies sur place : nom, type, puissance, et pour le mode
 * choisi l'éclairement « x lx à X m » et l'angle du faisceau. Partagées par tous les projecteurs
 * de ce modèle dans le projet (une seule saisie).
 */
function FixtureData({ fixture, modeIndex, uses }: { fixture: Fixture; modeIndex: number; uses: number }) {
  const md = fixture.modes[modeIndex];
  const upd = (fn: (f: Fixture) => void, key: string) =>
    useApp.getState().updateDoc((d) => {
      const f = d.settings.fixtures.find((x) => x.id === fixture.id);
      if (f) fn(f);
    }, `fix:${fixture.id}:${key}`);
  const missing = !md || md.lux === null || md.distanceM === null || md.beamDeg === null;
  return (
    <div className="fixture-data" aria-label="Données du projecteur">
      <div className="row" style={{ gap: 8 }}>
        <label className="field" style={{ flex: 1 }}>
          Modèle
          <input autoFocus={!fixture.name} value={fixture.name} placeholder="ex. Fresnel 2K, Aputure 600d" aria-label="Nom du projecteur" onChange={(e) => upd((f) => void (f.name = e.target.value), 'n')} />
        </label>
        <label className="field small">
          Type
          <select aria-label="Type de projecteur" value={fixture.kind} onChange={(e) => upd((f) => void (f.kind = e.target.value as Fixture['kind']), 'k')}>
            {KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="field small">
          Puissance
          <DecimalField label="Puissance en watts" unit="W" width={64} min={0} max={100000} value={fixture.watts} onChange={(v) => upd((f) => void (f.watts = v), 'w')} />
        </div>
      </div>
      {md && (
        <>
          <div className="field">
            Fiche du fabricant{md.label ? ` (${md.label})` : ''}
            <div className="photometry">
              <DecimalField label="Éclairement en lux" unit="lx à" width={76} min={0.1} max={10000000} value={md.lux} onChange={(v) => upd((f) => void (f.modes[modeIndex]!.lux = v), `mx${modeIndex}`)} />
              <DecimalField label="Distance de la mesure en mètres" unit="m · faisceau" width={46} min={0.1} max={100} value={md.distanceM} onChange={(v) => upd((f) => void (f.modes[modeIndex]!.distanceM = v), `md${modeIndex}`)} />
              <DecimalField label="Angle du faisceau en degrés" unit="°" width={46} min={1} max={180} value={md.beamDeg} onChange={(v) => upd((f) => void (f.modes[modeIndex]!.beamDeg = v), `mb${modeIndex}`)} />
            </div>
          </div>
          {missing && (
            <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>
              Renseignez l’éclairement, sa distance et l’angle du faisceau (fiche technique du fabricant) : sans ces trois valeurs, rien n’est calculé.
            </p>
          )}
        </>
      )}
      {uses > 1 && (
        <p className="note" style={{ margin: 0, fontSize: 11 }}>
          Modèle utilisé par {uses} projecteurs du projet : une modification s’applique à tous.
        </p>
      )}
    </div>
  );
}

export function LightInspector({ fp, el }: { fp: FloorPlan; el: FloorLight }) {
  const doc = useApp(selectDoc);
  const fixtures = doc.settings.fixtures;
  const fixture = fixtures.find((f) => f.id === el.fixtureId);
  const upd = (fn: (x: FloorLight) => void, key: string) => apply((d) => updateElement(d, fp.id, el.id, (x) => void (x.kind === 'light' && fn(x))), undefined, `${key}-${el.id}`);
  const actors = fp.elements.filter((x): x is FloorActor => x.kind === 'actor');
  const createFixture = () => {
    const id = newId('fx');
    apply(
      (d) =>
        produce(updateElement(d, fp.id, el.id, (x) => void (x.kind === 'light' && ((x.fixtureId = id), (x.mode = 0)))), (x) => {
          x.settings.fixtures.push({ id, name: '', watts: null, kind: 'led', modes: [{ label: '', lux: null, distanceM: null, beamDeg: null }] });
        }),
      'Nouveau projecteur : saisissez ses données',
    );
  };
  const addMode = () => {
    if (!fixture) return;
    apply((d) =>
      produce(d, (x) => {
        const f = x.settings.fixtures.find((y) => y.id === fixture.id);
        const l = x.floorPlans.find((p) => p.id === fp.id)?.elements.find((e) => e.id === el.id);
        if (!f || l?.kind !== 'light') return;
        f.modes.push({ label: '', lux: null, distanceM: null, beamDeg: null });
        l.mode = f.modes.length - 1;
      }),
    );
  };
  const md = fixture?.modes[el.mode];
  return (
    <>
      <label className="field">
        Projecteur
        <select aria-label="Modèle de projecteur" value={el.fixtureId ?? ''} onChange={(e) => (e.target.value === NEW ? createFixture() : upd((x) => ((x.fixtureId = e.target.value || null), (x.mode = 0)), 'fix'))}>
          <option value="">Non défini</option>
          {fixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name || 'Sans nom'}
              {f.watts !== null ? ` · ${formatNumber(f.watts)} W` : ''}
            </option>
          ))}
          <option value={NEW}>+ Nouveau projecteur…</option>
        </select>
      </label>
      {fixture && (
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>
            Mode
            <select aria-label="Mode du projecteur" value={el.mode} onChange={(e) => (Number(e.target.value) === NEW_MODE ? addMode() : upd((x) => void (x.mode = Number(e.target.value)), 'mode'))}>
              {fixture.modes.map((m, i) => (
                <option key={i} value={i}>
                  {m.label || (fixture.modes.length > 1 ? `Mode ${i + 1}` : 'Unique')}
                  {m.beamDeg !== null ? ` · ${formatNumber(m.beamDeg)}°` : ''}
                </option>
              ))}
              <option value={NEW_MODE}>+ Autre mode (spot, flood, optique…)</option>
            </select>
          </label>
          {md && fixture.modes.length > 1 && (
            <label className="field small">
              Nom du mode
              <input
                aria-label="Nom du mode"
                value={md.label}
                placeholder="Spot, Flood…"
                onChange={(e) =>
                  useApp.getState().updateDoc((d) => {
                    const f = d.settings.fixtures.find((x) => x.id === fixture.id);
                    if (f?.modes[el.mode]) f.modes[el.mode]!.label = e.target.value;
                  }, `fix:${fixture.id}:ml${el.mode}`)
                }
              />
            </label>
          )}
        </div>
      )}
      {fixture && <FixtureData key={fixture.id} fixture={fixture} modeIndex={el.mode} uses={usesOf(doc, fixture.id)} />}
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
          <input value={el.label} placeholder={fixture?.name || 'ex. Face, contre'} onChange={(e) => upd((x) => void (x.label = e.target.value), 'lab')} />
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
            {r.light.label || r.fixture.name || 'Projecteur'} à {m(r.distanceM)}
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
      {p.unknown > 0 && <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>{p.unknown} projecteur(s) sans modèle ou sans puissance renseignée : non comptés.</p>}
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
