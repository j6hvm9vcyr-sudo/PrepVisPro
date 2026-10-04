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
        <div className="sec-h">Projecteurs du projet</div>
        <p className="note" style={{ margin: 0 }}>
          Recopiez les données photométriques de la fiche du fabricant : éclairement au centre du faisceau à une distance donnée, et angle du faisceau, pour chaque mode
          (spot, flood, optique ou réflecteur). Sans ces données, aucun chiffre n’est calculé.
        </p>
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
              <DecimalField label="Puissance en watts" unit="W" width={70} min={0} max={100000} required value={f.watts} onChange={(v) => v !== null && updF(f.id, (x) => void (x.watts = v), 'w')} />
              <button type="button" className="linkbtn danger" onClick={() => st().updateDoc((d) => void (d.settings.fixtures = d.settings.fixtures.filter((x) => x.id !== f.id)))}>
                Retirer
              </button>
            </div>
            <table className="modes">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Éclairement</th>
                  <th>à</th>
                  <th>Faisceau</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.modes.map((md, i) => (
                  <tr key={i}>
                    <td>
                      <input aria-label="Nom du mode" placeholder="Spot, Flood, 30°…" value={md.label} onChange={(ev) => updF(f.id, (x) => void (x.modes[i]!.label = ev.target.value), `ml${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Éclairement en lux" unit="lx" width={76} min={0.1} max={10000000} required value={md.lux} onChange={(v) => v !== null && updF(f.id, (x) => void (x.modes[i]!.lux = v), `mx${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Distance de référence en mètres" unit="m" width={50} min={0.1} max={100} required value={md.distanceM} onChange={(v) => v !== null && updF(f.id, (x) => void (x.modes[i]!.distanceM = v), `md${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Angle du faisceau en degrés" unit="°" width={50} min={1} max={180} required value={md.beamDeg} onChange={(v) => v !== null && updF(f.id, (x) => void (x.modes[i]!.beamDeg = v), `mb${i}`)} />
                    </td>
                    <td>
                      <button type="button" className="linkbtn danger" aria-label="Retirer ce mode" onClick={() => updF(f.id, (x) => void x.modes.splice(i, 1), `mr${i}`)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => updF(f.id, (x) => void x.modes.push({ label: '', lux: 1000, distanceM: 5, beamDeg: 30 }), 'ma')}>
              + Mode
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => st().updateDoc((d) => void d.settings.fixtures.push({ id: newId('fx'), name: '', watts: 0, kind: 'led', modes: [{ label: 'Spot', lux: 1000, distanceM: 5, beamDeg: 30 }] }))}
        >
          + Projecteur
        </button>
      </section>
    </div>
  );
}
