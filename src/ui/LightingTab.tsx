/**
 * Réglages › Lumière : exposition de référence et projecteurs du projet, avec les données des
 * fiches techniques des fabricants (éclairement à une distance donnée, angle du faisceau, puissance).
 */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { newId } from '../model/defaults';
import { formatStop, luxForStop } from '../model/light';
import type { Fixture } from '../model/types';
import { DecimalField } from './DecimalField';

const KINDS: [Fixture['kind'], string][] = [
  ['led', 'LED'],
  ['tungsten', 'Tungstène'],
  ['hmi', 'HMI'],
  ['other', 'Autre'],
];

export function LightingTab() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const e = doc.settings.exposure;
  const updE = (fn: (x: typeof e) => void, key: string) => st().updateDoc((d) => fn(d.settings.exposure), `exp:${key}`);
  const updF = (id: string, fn: (f: Fixture) => void, key: string) =>
    st().updateDoc((d) => {
      const f = d.settings.fixtures.find((x) => x.id === id);
      if (f) fn(f);
    }, `fix:${id}:${key}`);

  return (
    <div className="lighting">
      <section className="sec">
        <div className="sec-h">Exposition de référence</div>
        <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
          <div className="field small">
            Sensibilité
            <DecimalField label="Sensibilité ISO" unit="ISO" width={70} min={25} max={102400} required value={e.iso} onChange={(v) => v !== null && updE((x) => void (x.iso = v), 'iso')} />
          </div>
          <div className="field small">
            Cadence
            <DecimalField label="Cadence en images par seconde" unit="i/s" width={60} min={1} max={2000} required value={e.fps} onChange={(v) => v !== null && updE((x) => void (x.fps = v), 'fps')} />
          </div>
          <div className="field small">
            Obturation
            <DecimalField label="Angle d’obturation en degrés" unit="°" width={60} min={1} max={360} required value={e.shutterDeg} onChange={(v) => v !== null && updE((x) => void (x.shutterDeg = v), 'sh')} />
          </div>
          <p className="note" style={{ margin: 0, flex: 1 }}>
            Repère : {formatStop(2.8)} demande {Math.round(luxForStop(2.8, e)).toLocaleString('fr-FR')} lx, {formatStop(4)} {Math.round(luxForStop(4, e)).toLocaleString('fr-FR')} lx (posemètre incident, C = 340).
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h">Projecteurs de ce projet</div>
        <p className="note" style={{ margin: 0 }}>
          Liste propre à ce projet. Pour chaque projecteur, recopiez de sa fiche technique l’éclairement « x lx à X m » au centre du faisceau et l’angle du faisceau, pour
          chaque mode (spot, flood, optique ou réflecteur). Sans ces valeurs, aucun chiffre n’est calculé. Vous pouvez aussi créer et renseigner un projecteur directement
          sur le plan au sol (outil Projecteur, L).
        </p>
        {doc.settings.fixtures.length === 0 && <p className="note" style={{ margin: 0 }}>Aucun projecteur pour l’instant.</p>}
        {doc.settings.fixtures.map((f) => (
          <div key={f.id} className="fixture">
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input className="field-input" aria-label="Nom du projecteur" placeholder="ex. Arri 650 Plus, Aputure 600d" value={f.name} onChange={(ev) => updF(f.id, (x) => void (x.name = ev.target.value), 'n')} />
              <select aria-label="Type de projecteur" value={f.kind} onChange={(ev) => updF(f.id, (x) => void (x.kind = ev.target.value as Fixture['kind']), 'k')}>
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <DecimalField label="Puissance en watts" unit="W" width={70} min={0} max={100000} value={f.watts} onChange={(v) => updF(f.id, (x) => void (x.watts = v), 'w')} />
              <button type="button" className="linkbtn danger" onClick={() => st().updateDoc((d) => void (d.settings.fixtures = d.settings.fixtures.filter((x) => x.id !== f.id)))}>
                Retirer
              </button>
            </div>
            <table className="modes">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Éclairement (lx)</th>
                  <th>à (m)</th>
                  <th>Faisceau (°)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.modes.map((md, i) => {
                  const used = doc.floorPlans.reduce((n, fp) => n + fp.elements.filter((x) => x.kind === 'light' && x.fixtureId === f.id && x.mode === i).length, 0);
                  return (
                  <tr key={i}>
                    <td>
                      <input aria-label="Nom du mode" placeholder="Spot, Flood, 30°…" value={md.label} onChange={(ev) => updF(f.id, (x) => void (x.modes[i]!.label = ev.target.value), `ml${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Éclairement en lux" unit="lx" width={76} min={0.1} max={10000000} value={md.lux} onChange={(v) => updF(f.id, (x) => void (x.modes[i]!.lux = v), `mx${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Distance de référence en mètres" unit="m" width={50} min={0.1} max={100} value={md.distanceM} onChange={(v) => updF(f.id, (x) => void (x.modes[i]!.distanceM = v), `md${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Angle du faisceau en degrés" unit="°" width={50} min={1} max={180} value={md.beamDeg} onChange={(v) => updF(f.id, (x) => void (x.modes[i]!.beamDeg = v), `mb${i}`)} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linkbtn danger"
                        aria-label="Retirer ce mode"
                        disabled={used > 0 || f.modes.length === 1}
                        title={used > 0 ? `Utilisé par ${used} projecteur(s) placé(s)` : f.modes.length === 1 ? 'Un projecteur a au moins un mode' : undefined}
                        onClick={() =>
                          st().updateDoc((d) => {
                            d.settings.fixtures.find((x) => x.id === f.id)?.modes.splice(i, 1);
                            // Les modes suivants remontent d'un rang : les projecteurs qui les utilisent suivent.
                            for (const fp of d.floorPlans) for (const x of fp.elements) if (x.kind === 'light' && x.fixtureId === f.id && x.mode > i) x.mode--;
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => updF(f.id, (x) => void x.modes.push({ label: '', lux: null, distanceM: null, beamDeg: null }), 'ma')}>
              + Mode
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => st().updateDoc((d) => void d.settings.fixtures.push({ id: newId('fx'), name: '', watts: null, kind: 'led', modes: [{ label: '', lux: null, distanceM: null, beamDeg: null }] }))}
        >
          + Projecteur
        </button>
      </section>
    </div>
  );
}
