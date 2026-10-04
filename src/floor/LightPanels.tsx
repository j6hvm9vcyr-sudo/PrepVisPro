/** Plan feux : réglages d'un projecteur, éclairement sur les personnages, puissance électrique. */
import { Explain } from '../ui/Explain';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorActor, FloorLight, FloorPlan } from '../model/floor';
import { updateElement } from '../model/floorOps';
import { contributionsAt, formatStop, powerTotals, readingAt, stopFromLux } from '../model/light';
import { GEL_GROUPS, GELS, gelLabel, gelStack, gelTransmission, stopsLost } from '../model/gels';
import { formatNumber } from '../model/text';
import { newId } from '../model/defaults';
import type { Fixture, ProjectDoc } from '../model/types';
import { DecimalField } from '../ui/DecimalField';
import { produce } from 'immer';

/** Lux arrondis à deux chiffres significatifs (la précision des données des fabricants). */
export const lx = (v: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(v, 1))) - 1);
  return `${(Math.round(v / p) * p).toLocaleString('fr-FR')} lx`;
};
export const m = (v: number) => `${formatNumber(Math.round(v * 10) / 10)} m`;

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
      <GelsField fixture={fixture ?? null} el={el} onChange={(ids) => upd((x) => void (x.gels = ids), 'gels')} />
      <div className="row" style={{ gap: 10 }}>
        <label className="field">
          Gradateur {Math.round(el.dimmer * 100)} %
          <input type="range" min={5} max={100} step={5} value={Math.round(el.dimmer * 100)} onChange={(e) => upd((x) => void (x.dimmer = Number(e.target.value) / 100), 'dim')} aria-label="Gradateur" />
        </label>
        <div className="field small">
          Autres pertes
          <DecimalField label="Autres pertes en diaphs (gélatine hors liste, grille…)" unit="diaph" width={56} min={0} max={20} required value={el.lossStops} onChange={(v) => v !== null && upd((x) => void (x.lossStops = v), 'loss')} />
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
                <b>{r.lux === null ? (r.why === 'diffusion' ? 'non calculé (diffusion)' : 'hors faisceau') : `${r.gels.diffused ? '≈ ' : ''}${lx(r.lux)} · ${formatStop(stopFromLux(r.lux, doc.settings.exposure))}`}</b>
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

/** Éclairement reçu par un personnage : chaque projecteur, en direct et par les réflecteurs. */
export function ActorLight({ fp, actor }: { fp: FloorPlan; actor: FloorActor }) {
  const doc = useApp(selectDoc);
  if (!fp.scale || !fp.elements.some((e) => e.kind === 'light')) return null;
  const cs = contributionsAt(doc, fp, actor.at);
  const lit = cs.filter((c) => c.lux !== null);
  const sum = lit.reduce((n, c) => n + c.lux!, 0);
  const approx = lit.some((c) => c.approx);
  const e = doc.settings.exposure;
  return (
    <section className="sec suggest" aria-label="Lumière reçue">
      <div className="sec-h">Lumière reçue</div>
      {cs.length === 0 && <p className="note" style={{ margin: 0 }}>Aucun projecteur renseigné (modèle et fiche du fabricant).</p>}
      {cs.map((c) => (
        <div key={c.key} className="reading">
          <span>
            {c.label} à {m(c.distanceM)}
          </span>
          <b>{c.lux === null ? (c.note ?? '—') : `${c.approx ? '≈ ' : ''}${lx(c.lux)} · ${formatStop(stopFromLux(c.lux, e))}`}</b>
          {c.edge && <small>bord du faisceau</small>}
        </div>
      ))}
      {actor.positions.length > 0 && (
        <div className="light-readings" aria-label="Lumière à chaque position">
          {[actor.at, ...actor.positions.map((q) => q.at)].map((at, i) => {
            const ls = contributionsAt(doc, fp, at).filter((c) => c.lux !== null);
            const tot = ls.reduce((n, c) => n + c.lux!, 0);
            return (
              <div key={i} className="reading">
                <span>
                  Position {i + 1}
                  {i === actor.positions.length ? ' (fin)' : i === 0 ? ' (début)' : ''}
                </span>
                <b>{ls.length ? `${ls.some((c) => c.approx) ? '≈ ' : ''}${lx(tot)} · ${formatStop(stopFromLux(tot, e))}` : 'aucune source'}</b>
              </div>
            );
          })}
        </div>
      )}
      {lit.length > 1 && (
        <div className="reading total">
          <span>Toutes sources</span>
          <b>
            {approx ? '≈ ' : ''}
            {lx(sum)} · {formatStop(stopFromLux(sum, e))}
          </b>
        </div>
      )}
      <Explain id="light-calc">
        Lumière incidente face à chaque source. Direct : E = lux du fabricant × (distance de référence ÷ distance)² × gradateur × transmission des gélatines (fiches LEE).
        Réflecteur : taux de réflexion mesuré, miroir en réflexion exacte, toile ou poly en surface diffuse. « ≈ » : diffusion ou réflecteur diffus, à ± ⅓ diaph
        environ. Diaph : N² = E × ISO × t ÷ 340 (ISO {formatNumber(e.iso)}, {formatNumber(e.fps)} i/s, {formatNumber(e.shutterDeg)}°).
      </Explain>
    </section>
  );
}

const pct = (t: number) => `${formatNumber(Math.round(t * 1000) / 10)} %`;
const stopTxt = (t: number) => `−${formatNumber(Math.round(stopsLost(t) * 10) / 10)} diaph`;

/** Gélatines et diffusions LEE posées sur le projecteur, avec leur transmission publiée. */
function GelsField({ fixture, el, onChange }: { fixture: Fixture | null; el: FloorLight; onChange: (ids: string[]) => void }) {
  const tungsten = fixture?.kind === 'tungsten';
  const stack = gelStack(el.gels, tungsten);
  return (
    <div className="field">
      Gélatines et diffusion
      {el.gels.length > 0 && (
        <div className="gel-chips">
          {el.gels.map((g, i) => (
            <span key={`${g}-${i}`} className="gel-chip">
              {gelLabel(g) || 'Référence inconnue'}
              <button type="button" aria-label={`Retirer ${gelLabel(g)}`} onClick={() => onChange(el.gels.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        aria-label="Ajouter une gélatine ou une diffusion"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...el.gels, e.target.value]);
        }}
      >
        <option value="">+ Ajouter (LEE)…</option>
        {GEL_GROUPS.map((grp) => (
          <optgroup key={grp.id} label={grp.label}>
            {GELS.filter((g) => g.group === grp.id).map((g) => {
              const t = gelTransmission(g, tungsten);
              return (
                <option key={g.id} value={g.id}>
                  {g.ref} {g.name} · {g.atLeast ? '> ' : ''}
                  {pct(t)} · {stopTxt(t)}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      {el.gels.length > 0 && (
        <span className="note" style={{ fontSize: 11.5 }}>
          Transmission {pct(stack.transmission)} · {stopTxt(stack.transmission)} (fiches LEE, mesure {tungsten ? 'en tungstène' : 'en lumière du jour'})
        </span>
      )}
      {stack.strong && (
        <span className="note" style={{ fontSize: 11.5, color: 'var(--warn-text)' }}>
          Diffusion forte : chiffre valable projecteur ouvert (flood), diffusion près du projecteur. Sur un faisceau serré, le centre reçoit moins. Hors du faisceau d’origine, rien n’est calculé.
        </span>
      )}
      {stack.atLeast && <span className="note" style={{ fontSize: 11.5 }}>252 : la fiche indique plus de 85 % ; la perte comptée est la perte maximale.</span>}
    </div>
  );
}

/** Puissance des projecteurs du plan, par circuit (230 V). */
export function PowerSummary({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  if (!fp.elements.some((e) => e.kind === 'light')) return null;
  const p = powerTotals(doc, fp);
  return (
    <div className="light-readings" role="region" aria-label="Puissance électrique">
      <div className="reading-h">Puissance de ce plan</div>
      {p.circuits.map((c) => (
        <div key={c.circuit} className="reading">
          <span>
            {c.circuit === '—' ? 'Sans circuit' : `Circuit ${c.circuit}`} · {c.count} projecteur{c.count > 1 ? 's' : ''}
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
      {p.unknown > 0 && <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>{p.unknown > 1 ? `${p.unknown} projecteurs sans modèle ou sans puissance renseignée : non comptés.` : '1 projecteur sans modèle ou sans puissance renseignée : non compté.'}</p>}
      <p className="note" style={{ margin: 0, fontSize: 11 }}>À pleine puissance, intensité à 230 V.</p>
    </div>
  );
}
