/**
 * Listes lumière du projet (vue Plans au sol › Lumière) : exposition de référence, projecteurs
 * avec les données des fiches techniques (éclairement à une distance donnée, angle du faisceau,
 * puissance), matières de réflecteurs.
 */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { newId } from '../model/defaults';
import { formatStop, luxForStop } from '../model/light';
import type { Fixture, ProjectDoc } from '../model/types';
import { plural } from '../model/text';

/** Nombre de réflecteurs placés (tous plans au sol) faits de cette matière. */
function reflectorUses(doc: ProjectDoc, materialId: string): number {
  return doc.floorPlans.reduce((n, fp) => n + fp.elements.filter((e) => e.kind === 'reflector' && e.materialId === materialId).length, 0);
}


import { DecimalField } from '../ui/DecimalField';
import { MaterialFields, materialGroups, PRESET } from './ReflectorPanel';
import { materialForPreset } from '../model/reflectorPresets';
import { Explain } from '../ui/Explain';
import { Picker } from '../ui/Picker';
import { FIXTURE_KINDS as KINDS, usesOf } from './LightPanels';


/** Exposition de référence : sert au calcul des diaphs (posemètre incident). */
export function ExposureFields() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const e = doc.settings.exposure;
  const updE = (fn: (x: typeof e) => void, key: string) => st().updateDoc((d) => fn(d.settings.exposure), `exp:${key}`);
  return (
    <>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
        <div className="field small">
          Sensibilité
          <DecimalField label="Sensibilité ISO" unit="ISO" width={64} min={25} max={102400} required value={e.iso} onChange={(v) => v !== null && updE((x) => void (x.iso = v), 'iso')} />
        </div>
        <div className="field small">
          Cadence
          <DecimalField label="Cadence en images par seconde" unit="i/s" width={48} min={1} max={2000} required value={e.fps} onChange={(v) => v !== null && updE((x) => void (x.fps = v), 'fps')} />
        </div>
        <div className="field small">
          Obturation
          <DecimalField label="Angle d’obturation en degrés" unit="°" width={48} min={1} max={360} required value={e.shutterDeg} onChange={(v) => v !== null && updE((x) => void (x.shutterDeg = v), 'sh')} />
        </div>
      </div>
      <p className="note" style={{ margin: 0 }}>
        Repère : {formatStop(2.8)} demande {Math.round(luxForStop(2.8, e)).toLocaleString('fr-FR')} lx, {formatStop(4)} {Math.round(luxForStop(4, e)).toLocaleString('fr-FR')} lx (posemètre incident, C = 340).
      </p>
    </>
  );
}

/** Projecteurs du projet (la liste change à chaque projet). */
export function FixtureCatalog() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const updF = (id: string, fn: (f: Fixture) => void, key: string) =>
    st().updateDoc((d) => {
      const f = d.settings.fixtures.find((x) => x.id === id);
      if (f) fn(f);
    }, `fix:${id}:${key}`);

  return (
    <div className="lighting">
      <section className="catalog" aria-label="Projecteurs du projet">
        <Explain id="fixtures-help" label="Quelles données saisir ?">
          Liste propre à ce projet. Pour chaque projecteur, recopiez de sa fiche technique l’éclairement « x lx à X m » au centre du faisceau et l’angle du faisceau, pour
          chaque mode (spot, flood, optique ou réflecteur). Sans ces valeurs, aucun chiffre n’est calculé. Vous pouvez aussi créer et renseigner un projecteur directement
          sur le plan au sol (outil Projecteur, L) : il apparaît alors ici.
        </Explain>
        {doc.settings.fixtures.length === 0 && <p className="note" style={{ margin: 0 }}>Aucun projecteur pour l’instant.</p>}
        {doc.settings.fixtures.map((f) => (
          <div key={f.id} className="fixture">
            <input className="field-input" aria-label="Nom du projecteur" placeholder="ex. Arri 650 Plus, Aputure 600d" value={f.name} onChange={(ev) => updF(f.id, (x) => void (x.name = ev.target.value), 'n')} />
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <select aria-label="Type de projecteur" value={f.kind} onChange={(ev) => updF(f.id, (x) => void (x.kind = ev.target.value as Fixture['kind']), 'k')}>
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <DecimalField label="Puissance en watts" unit="W" width={70} min={0} max={100000} value={f.watts} onChange={(v) => updF(f.id, (x) => void (x.watts = v), 'w')} />
              <span className="spacer" />
              <button
                type="button"
                className="linkbtn danger"
                disabled={usesOf(doc, f.id) > 0}
                title={usesOf(doc, f.id) > 0 ? `Placé ${usesOf(doc, f.id)} fois sur les plans au sol` : undefined}
                onClick={() => st().updateDoc((d) => void (d.settings.fixtures = d.settings.fixtures.filter((x) => x.id !== f.id)))}
              >
                Retirer
              </button>
            </div>
            <table className="modes">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th title="Éclairement au centre du faisceau, d’après la fiche technique">Éclairement</th>
                  <th>à</th>
                  <th>Faisceau</th>
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
                      <DecimalField label="Éclairement en lux" unit="lx" width={64} min={0.1} max={10000000} value={md.lux} onChange={(v) => updF(f.id, (x) => void (x.modes[i]!.lux = v), `mx${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Distance de référence en mètres" unit="m" width={40} min={0.1} max={100} value={md.distanceM} onChange={(v) => updF(f.id, (x) => void (x.modes[i]!.distanceM = v), `md${i}`)} />
                    </td>
                    <td>
                      <DecimalField label="Angle du faisceau en degrés" unit="°" width={40} min={1} max={180} value={md.beamDeg} onChange={(v) => updF(f.id, (x) => void (x.modes[i]!.beamDeg = v), `mb${i}`)} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linkbtn danger"
                        aria-label="Retirer ce mode"
                        disabled={used > 0 || f.modes.length === 1}
                        title={used > 0 ? `Utilisé par ${plural(used, 'projecteur placé', 'projecteurs placés')}` : f.modes.length === 1 ? 'Un projecteur a au moins un mode' : undefined}
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

/** Matières de réflecteurs du projet : préréglées (valeurs publiées, sourcées) ou mesurées. */
export function ReflectorCatalog() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  return (
    <div className="lighting">
      <section className="catalog" aria-label="Réflecteurs du projet">
        <Explain id="refl-help" label="D’où viennent les valeurs ?">
          Les matières préréglées reprennent des valeurs publiées (source affichée pour chacune) : tables de réflexion de l’éclairagisme pour le papier, la peinture,
          les miroirs et les surfaces naturelles ; essai comparatif de M. Porwoll pour les toiles et le poly, ancré sur la réflectance du coton blanchi. Pour une
          matière de votre parc, vous pouvez saisir une valeur mesurée.
        </Explain>
        {doc.settings.reflectors.length === 0 && <p className="note" style={{ margin: 0 }}>Aucune matière pour l’instant.</p>}
        {doc.settings.reflectors.map((mt) => (
          <div key={mt.id} className="fixture">
            <MaterialFields material={mt} />
            <button
              type="button"
              className="linkbtn danger"
              style={{ alignSelf: 'flex-start' }}
              disabled={reflectorUses(doc, mt.id) > 0}
              title={reflectorUses(doc, mt.id) > 0 ? `Utilisée par ${plural(reflectorUses(doc, mt.id), 'réflecteur placé', 'réflecteurs placés')}` : undefined}
              onClick={() => st().updateDoc((d) => void (d.settings.reflectors = d.settings.reflectors.filter((x) => x.id !== mt.id)))}
            >
              Retirer
            </button>
          </div>
        ))}
        <Picker
          label="Ajouter une matière de réflecteur"
          variant="add"
          {...materialGroups([])}
          onPick={(v) => {
            if (v.startsWith(PRESET)) st().applyDoc(materialForPreset(selectDoc(st()), v.slice(PRESET.length), () => newId('rm')).doc);
            else st().updateDoc((d) => void d.settings.reflectors.push({ id: newId('rm'), name: '', type: 'diffuse', reflectance: null, presetId: null }));
          }}
        >
          + Ajouter une matière…
        </Picker>
      </section>
    </div>
  );
}
